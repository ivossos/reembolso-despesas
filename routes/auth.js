const express = require('express');
const bcrypt = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');

const { query, transaction } = require('../config/database');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const { createSendToken, protect, sensitiveOpLimit } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation middleware
const validateSignup = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long'),
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('department').optional().trim()
];

const validateLogin = [
  body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('password').exists().withMessage('Please provide a password')
];

// Check validation results
const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Validation failed: ' + errors.array().map(e => e.msg).join(', '), 400));
  }
  next();
};

// Sign up
router.post('/signup', validateSignup, checkValidation, catchAsync(async (req, res, next) => {
  const { email, password, firstName, lastName, department } = req.body;

  // Check if user already exists
  const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existingUser.rows.length > 0) {
    return next(new AppError('User with this email already exists', 400));
  }

  // Hash password
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Create verification token
  const verificationToken = uuidv4();
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Create user and verification token in transaction
  const newUser = await transaction(async (client) => {
    // Insert user
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, department, email_verified) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, email, first_name, last_name, role, created_at`,
      [email, passwordHash, firstName, lastName, department, false]
    );

    const user = userResult.rows[0];

    // Insert verification token
    await client.query(
      `INSERT INTO email_verification_tokens (user_id, token, expires_at) 
       VALUES ($1, $2, $3)`,
      [user.id, verificationToken, verificationExpires]
    );

    return user;
  });

  // Send verification email
  try {
    await sendEmail({
      to: email,
      subject: 'Verify your Reembolso account',
      template: 'email-verification',
      data: {
        firstName,
        verificationToken,
        verificationUrl: `${process.env.FRONTEND_URL}/verify-email?token=${verificationToken}`
      }
    });
  } catch (error) {
    logger.error('Failed to send verification email:', error);
    // Don't fail signup if email fails
  }

  logger.info(`New user registered: ${email}`);

  res.status(201).json({
    status: 'success',
    message: 'User registered successfully. Please check your email to verify your account.',
    data: {
      user: newUser
    }
  });
}));

// Verify email
router.post('/verify-email', catchAsync(async (req, res, next) => {
  const { token } = req.body;

  if (!token) {
    return next(new AppError('Verification token is required', 400));
  }

  // Find and validate token
  const tokenResult = await query(
    `SELECT evt.user_id, evt.expires_at, u.email, u.first_name 
     FROM email_verification_tokens evt
     JOIN users u ON evt.user_id = u.id
     WHERE evt.token = $1 AND evt.used = false AND evt.expires_at > NOW()`,
    [token]
  );

  if (tokenResult.rows.length === 0) {
    return next(new AppError('Invalid or expired verification token', 400));
  }

  const { user_id, email, first_name } = tokenResult.rows[0];

  // Update user and mark token as used in transaction
  await transaction(async (client) => {
    await client.query(
      'UPDATE users SET email_verified = true WHERE id = $1',
      [user_id]
    );

    await client.query(
      'UPDATE email_verification_tokens SET used = true WHERE token = $1',
      [token]
    );
  });

  logger.info(`Email verified for user: ${email}`);

  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully. You can now log in.'
  });
}));

// Login
router.post('/login', validateLogin, checkValidation, catchAsync(async (req, res, next) => {
  const { email, password, twoFactorCode } = req.body;

  // Get user with password
  const result = await query(
    `SELECT id, email, password_hash, first_name, last_name, role, is_active, 
            email_verified, two_factor_enabled, two_factor_secret
     FROM users WHERE email = $1`,
    [email]
  );

  if (result.rows.length === 0) {
    return next(new AppError('Invalid email or password', 401));
  }

  const user = result.rows[0];

  // Check if user is active
  if (!user.is_active) {
    return next(new AppError('Your account has been deactivated. Please contact administrator.', 401));
  }

  // Check if email is verified
  if (!user.email_verified) {
    return next(new AppError('Please verify your email before logging in', 401));
  }

  // Check password
  const isPasswordValid = await bcrypt.compare(password, user.password_hash);
  if (!isPasswordValid) {
    return next(new AppError('Invalid email or password', 401));
  }

  // Check 2FA if enabled
  if (user.two_factor_enabled) {
    if (!twoFactorCode) {
      return res.status(200).json({
        status: 'success',
        requiresTwoFactor: true,
        message: 'Please provide your 2FA code'
      });
    }

    const verified = speakeasy.totp.verify({
      secret: user.two_factor_secret,
      encoding: 'base32',
      token: twoFactorCode,
      window: 2
    });

    if (!verified) {
      return next(new AppError('Invalid 2FA code', 401));
    }
  }

  // Update last login
  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  logger.info(`User logged in: ${email}`);

  // Create and send token
  createSendToken(user, 200, res);
}));

// Logout
router.post('/logout', (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({ 
    status: 'success',
    message: 'Logged out successfully'
  });
});

// Forgot password
router.post('/forgot-password', catchAsync(async (req, res, next) => {
  const { email } = req.body;

  if (!email) {
    return next(new AppError('Please provide your email address', 400));
  }

  // Get user
  const userResult = await query(
    'SELECT id, email, first_name FROM users WHERE email = $1 AND is_active = true',
    [email]
  );

  if (userResult.rows.length === 0) {
    // Don't reveal if email exists or not
    return res.status(200).json({
      status: 'success',
      message: 'If an account with that email exists, we sent you a password reset link.'
    });
  }

  const user = userResult.rows[0];

  // Generate reset token
  const resetToken = uuidv4();
  const resetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Save reset token
  await query(
    `INSERT INTO password_reset_tokens (user_id, token, expires_at) 
     VALUES ($1, $2, $3)`,
    [user.id, resetToken, resetExpires]
  );

  // Send reset email
  try {
    await sendEmail({
      to: email,
      subject: 'Reset your Reembolso password',
      template: 'password-reset',
      data: {
        firstName: user.first_name,
        resetToken,
        resetUrl: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`
      }
    });

    logger.info(`Password reset email sent to: ${email}`);
  } catch (error) {
    logger.error('Failed to send password reset email:', error);
    return next(new AppError('There was an error sending the email. Please try again later.', 500));
  }

  res.status(200).json({
    status: 'success',
    message: 'If an account with that email exists, we sent you a password reset link.'
  });
}));

// Reset password
router.post('/reset-password', catchAsync(async (req, res, next) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return next(new AppError('Token and new password are required', 400));
  }

  if (password.length < 8) {
    return next(new AppError('Password must be at least 8 characters long', 400));
  }

  // Find and validate token
  const tokenResult = await query(
    `SELECT prt.user_id, u.email 
     FROM password_reset_tokens prt
     JOIN users u ON prt.user_id = u.id
     WHERE prt.token = $1 AND prt.used = false AND prt.expires_at > NOW()`,
    [token]
  );

  if (tokenResult.rows.length === 0) {
    return next(new AppError('Invalid or expired reset token', 400));
  }

  const { user_id, email } = tokenResult.rows[0];

  // Hash new password
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  // Update password and mark token as used
  await transaction(async (client) => {
    await client.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, user_id]
    );

    await client.query(
      'UPDATE password_reset_tokens SET used = true WHERE token = $1',
      [token]
    );
  });

  logger.info(`Password reset successful for user: ${email}`);

  res.status(200).json({
    status: 'success',
    message: 'Password reset successfully. You can now log in with your new password.'
  });
}));

// Enable 2FA
router.post('/enable-2fa', protect, sensitiveOpLimit, catchAsync(async (req, res, next) => {
  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `Reembolso (${req.user.email})`,
    issuer: 'Reembolso de Despesas'
  });

  // Generate QR code
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

  // Save secret (temporarily, not enabled yet)
  await query(
    'UPDATE users SET two_factor_secret = $1 WHERE id = $2',
    [secret.base32, req.user.id]
  );

  res.status(200).json({
    status: 'success',
    data: {
      secret: secret.base32,
      qrCode: qrCodeUrl,
      manualEntryKey: secret.base32
    }
  });
}));

// Verify and confirm 2FA setup
router.post('/verify-2fa', protect, catchAsync(async (req, res, next) => {
  const { token } = req.body;

  if (!token) {
    return next(new AppError('2FA token is required', 400));
  }

  // Get user's secret
  const userResult = await query(
    'SELECT two_factor_secret FROM users WHERE id = $1',
    [req.user.id]
  );

  if (!userResult.rows[0].two_factor_secret) {
    return next(new AppError('2FA setup not initiated', 400));
  }

  // Verify token
  const verified = speakeasy.totp.verify({
    secret: userResult.rows[0].two_factor_secret,
    encoding: 'base32',
    token,
    window: 2
  });

  if (!verified) {
    return next(new AppError('Invalid 2FA token', 400));
  }

  // Enable 2FA
  await query(
    'UPDATE users SET two_factor_enabled = true WHERE id = $1',
    [req.user.id]
  );

  logger.info(`2FA enabled for user: ${req.user.email}`);

  res.status(200).json({
    status: 'success',
    message: '2FA has been successfully enabled for your account'
  });
}));

// Disable 2FA
router.post('/disable-2fa', protect, sensitiveOpLimit, catchAsync(async (req, res, next) => {
  const { password, twoFactorCode } = req.body;

  if (!password || !twoFactorCode) {
    return next(new AppError('Password and 2FA code are required to disable 2FA', 400));
  }

  // Verify password
  const userResult = await query(
    'SELECT password_hash, two_factor_secret FROM users WHERE id = $1',
    [req.user.id]
  );

  const isPasswordValid = await bcrypt.compare(password, userResult.rows[0].password_hash);
  if (!isPasswordValid) {
    return next(new AppError('Invalid password', 401));
  }

  // Verify 2FA token
  const verified = speakeasy.totp.verify({
    secret: userResult.rows[0].two_factor_secret,
    encoding: 'base32',
    token: twoFactorCode,
    window: 2
  });

  if (!verified) {
    return next(new AppError('Invalid 2FA code', 400));
  }

  // Disable 2FA
  await query(
    'UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL WHERE id = $1',
    [req.user.id]
  );

  logger.info(`2FA disabled for user: ${req.user.email}`);

  res.status(200).json({
    status: 'success',
    message: '2FA has been successfully disabled for your account'
  });
}));

// Get current user
router.get('/me', protect, catchAsync(async (req, res, next) => {
  const userResult = await query(
    `SELECT id, email, first_name, last_name, role, department, is_active, 
            email_verified, two_factor_enabled, avatar_url, notification_preferences, 
            created_at, last_login
     FROM users WHERE id = $1`,
    [req.user.id]
  );

  res.status(200).json({
    status: 'success',
    data: {
      user: userResult.rows[0]
    }
  });
}));

module.exports = router;
