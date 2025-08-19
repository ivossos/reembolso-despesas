const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { query, transaction } = require('../config/database');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const { protect, restrictTo } = require('../middleware/auth');
const { uploadToS3 } = require('../services/aws');
const { logger } = require('../utils/logger');

const router = express.Router();

// Configure multer for avatar uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit for avatars
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Only JPEG and PNG images are allowed for avatars', 400), false);
    }
  }
});

// Validation middleware
const validateProfileUpdate = [
  body('firstName').optional().trim().isLength({ min: 1, max: 100 }).withMessage('First name must be 1-100 characters'),
  body('lastName').optional().trim().isLength({ min: 1, max: 100 }).withMessage('Last name must be 1-100 characters'),
  body('department').optional().trim().isLength({ max: 100 }).withMessage('Department must be less than 100 characters')
];

const validatePasswordChange = [
  body('currentPassword').exists().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters long'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match');
    }
    return true;
  })
];

const checkValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError('Validation failed: ' + errors.array().map(e => e.msg).join(', '), 400));
  }
  next();
};

// Apply authentication to all routes
router.use(protect);

// Get current user profile
router.get('/profile', catchAsync(async (req, res, next) => {
  const userResult = await query(
    `SELECT id, email, first_name, last_name, role, department, 
            is_active, email_verified, two_factor_enabled, avatar_url,
            notification_preferences, created_at, last_login
     FROM users WHERE id = $1`,
    [req.user.id]
  );

  if (userResult.rows.length === 0) {
    return next(new AppError('User not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user: userResult.rows[0]
    }
  });
}));

// Update user profile
router.put('/profile', validateProfileUpdate, checkValidation, catchAsync(async (req, res, next) => {
  const { firstName, lastName, department } = req.body;
  
  const updateFields = [];
  const updateValues = [];
  let paramIndex = 1;

  if (firstName !== undefined) {
    updateFields.push(`first_name = $${paramIndex}`);
    updateValues.push(firstName);
    paramIndex++;
  }

  if (lastName !== undefined) {
    updateFields.push(`last_name = $${paramIndex}`);
    updateValues.push(lastName);
    paramIndex++;
  }

  if (department !== undefined) {
    updateFields.push(`department = $${paramIndex}`);
    updateValues.push(department);
    paramIndex++;
  }

  if (updateFields.length === 0) {
    return next(new AppError('No fields to update', 400));
  }

  updateFields.push(`updated_at = NOW()`);
  updateValues.push(req.user.id);

  const updatedUser = await query(
    `UPDATE users SET ${updateFields.join(', ')} 
     WHERE id = $${paramIndex} 
     RETURNING id, email, first_name, last_name, role, department, avatar_url`,
    updateValues
  );

  logger.info(`Profile updated for user: ${req.user.email}`);

  res.status(200).json({
    status: 'success',
    data: {
      user: updatedUser.rows[0]
    }
  });
}));

// Upload avatar
router.post('/avatar', upload.single('avatar'), catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('No avatar file provided', 400));
  }

  // Generate unique filename
  const fileExtension = path.extname(req.file.originalname);
  const fileName = `avatars/${req.user.id}/${uuidv4()}${fileExtension}`;

  // Upload to S3
  const avatarUrl = await uploadToS3(req.file.buffer, fileName, req.file.mimetype);

  // Update user record
  await query(
    'UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2',
    [avatarUrl, req.user.id]
  );

  logger.info(`Avatar uploaded for user: ${req.user.email}`);

  res.status(200).json({
    status: 'success',
    data: {
      avatarUrl
    }
  });
}));

// Change password
router.put('/password', validatePasswordChange, checkValidation, catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  // Get current user with password
  const userResult = await query(
    'SELECT password_hash FROM users WHERE id = $1',
    [req.user.id]
  );

  if (userResult.rows.length === 0) {
    return next(new AppError('User not found', 404));
  }

  // Verify current password
  const isCurrentPasswordValid = await bcrypt.compare(currentPassword, userResult.rows[0].password_hash);
  if (!isCurrentPasswordValid) {
    return next(new AppError('Current password is incorrect', 401));
  }

  // Hash new password
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

  // Update password
  await query(
    'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
    [newPasswordHash, req.user.id]
  );

  logger.info(`Password changed for user: ${req.user.email}`);

  res.status(200).json({
    status: 'success',
    message: 'Password updated successfully'
  });
}));

// Update notification preferences
router.put('/notifications', catchAsync(async (req, res, next) => {
  const { email, inApp, expenseApproved, expenseRejected, expenseSubmitted } = req.body;

  const preferences = {
    email: email !== undefined ? email : true,
    in_app: inApp !== undefined ? inApp : true,
    expense_approved: expenseApproved !== undefined ? expenseApproved : true,
    expense_rejected: expenseRejected !== undefined ? expenseRejected : true,
    expense_submitted: expenseSubmitted !== undefined ? expenseSubmitted : true
  };

  await query(
    'UPDATE users SET notification_preferences = $1, updated_at = NOW() WHERE id = $2',
    [JSON.stringify(preferences), req.user.id]
  );

  logger.info(`Notification preferences updated for user: ${req.user.email}`);

  res.status(200).json({
    status: 'success',
    data: {
      preferences
    }
  });
}));

// Get user notifications
router.get('/notifications', catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, unreadOnly = false } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = 'user_id = $1';
  const queryParams = [req.user.id];

  if (unreadOnly === 'true') {
    whereClause += ' AND read = false';
  }

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM notifications WHERE ${whereClause}`,
    queryParams
  );

  // Get notifications
  const notificationsResult = await query(
    `SELECT * FROM notifications 
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`,
    [...queryParams, limit, offset]
  );

  res.status(200).json({
    status: 'success',
    data: {
      notifications: notificationsResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    }
  });
}));

// Mark notification as read
router.put('/notifications/:id/read', catchAsync(async (req, res, next) => {
  const result = await query(
    'UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2 RETURNING *',
    [req.params.id, req.user.id]
  );

  if (result.rows.length === 0) {
    return next(new AppError('Notification not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      notification: result.rows[0]
    }
  });
}));

// Mark all notifications as read
router.put('/notifications/read-all', catchAsync(async (req, res, next) => {
  const result = await query(
    'UPDATE notifications SET read = true WHERE user_id = $1 AND read = false',
    [req.user.id]
  );

  res.status(200).json({
    status: 'success',
    message: `${result.rowCount} notifications marked as read`
  });
}));

// Delete notification
router.delete('/notifications/:id', catchAsync(async (req, res, next) => {
  const result = await query(
    'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );

  if (result.rowCount === 0) {
    return next(new AppError('Notification not found', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
}));

// Get user expense statistics
router.get('/stats', catchAsync(async (req, res, next) => {
  const { period = '30' } = req.query; // days

  // Get expense stats for the period
  const statsResult = await query(
    `SELECT 
       COUNT(*) as total_expenses,
       COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_expenses,
       COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_expenses,
       COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_expenses,
       COUNT(CASE WHEN status = 'reimbursed' THEN 1 END) as reimbursed_expenses,
       COALESCE(SUM(amount), 0) as total_amount,
       COALESCE(AVG(amount), 0) as avg_amount,
       COALESCE(MAX(amount), 0) as max_amount
     FROM expenses 
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${period} days'`,
    [req.user.id]
  );

  // Get monthly trend
  const trendResult = await query(
    `SELECT 
       DATE_TRUNC('month', created_at) as month,
       COUNT(*) as expense_count,
       SUM(amount) as total_amount
     FROM expenses 
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '12 months'
     GROUP BY DATE_TRUNC('month', created_at)
     ORDER BY month`,
    [req.user.id]
  );

  // Get category breakdown
  const categoryResult = await query(
    `SELECT 
       category,
       COUNT(*) as count,
       SUM(amount) as total_amount,
       AVG(amount) as avg_amount
     FROM expenses 
     WHERE user_id = $1 AND created_at > NOW() - INTERVAL '${period} days'
     GROUP BY category
     ORDER BY total_amount DESC`,
    [req.user.id]
  );

  res.status(200).json({
    status: 'success',
    data: {
      period: `${period} days`,
      summary: statsResult.rows[0],
      monthlyTrend: trendResult.rows,
      categoryBreakdown: categoryResult.rows
    }
  });
}));

module.exports = router;
