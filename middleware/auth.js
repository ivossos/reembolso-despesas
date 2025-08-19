const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const { AppError, catchAsync } = require('./errorHandler');
const { logger } = require('../utils/logger');

// Generate JWT token
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
};

// Create and send JWT token
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user.id);
  const cookieOptions = {
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  };

  res.cookie('jwt', token, cookieOptions);

  // Remove password from output
  user.password_hash = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

// Verify JWT token middleware
const protect = catchAsync(async (req, res, next) => {
  // 1) Getting token and check if it's there
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(new AppError('You are not logged in! Please log in to get access.', 401));
  }

  // 2) Verification token
  const decoded = jwt.verify(token, process.env.JWT_SECRET);

  // 3) Check if user still exists
  const result = await query(
    'SELECT id, email, first_name, last_name, role, is_active, created_at FROM users WHERE id = $1',
    [decoded.id]
  );

  if (result.rows.length === 0) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  const currentUser = result.rows[0];

  // 4) Check if user is active
  if (!currentUser.is_active) {
    return next(new AppError('Your account has been deactivated. Please contact administrator.', 401));
  }

  // Grant access to protected route
  req.user = currentUser;
  next();
});

// Restrict access to specific roles
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    next();
  };
};

// Optional authentication - doesn't fail if no token
const optionalAuth = catchAsync(async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const result = await query(
        'SELECT id, email, first_name, last_name, role, is_active FROM users WHERE id = $1',
        [decoded.id]
      );

      if (result.rows.length > 0 && result.rows[0].is_active) {
        req.user = result.rows[0];
      }
    } catch (error) {
      // Token is invalid, but we continue without user
      logger.debug('Invalid token in optional auth:', error.message);
    }
  }

  next();
});

// Check if user owns resource or has admin/approver role
const checkResourceOwnership = (resourceUserIdField = 'user_id') => {
  return (req, res, next) => {
    const resourceUserId = req.resource?.[resourceUserIdField] || req.params.userId;
    
    if (req.user.role === 'admin' || 
        req.user.role === 'approver' || 
        req.user.id === resourceUserId) {
      return next();
    }

    return next(new AppError('You can only access your own resources', 403));
  };
};

// Rate limiting for sensitive operations
const sensitiveOpLimit = catchAsync(async (req, res, next) => {
  const key = `sensitive_${req.user.id}`;
  // This would integrate with Redis for rate limiting
  // For now, we'll just log the attempt
  logger.info(`Sensitive operation attempted by user ${req.user.id}`);
  next();
});

module.exports = {
  signToken,
  createSendToken,
  protect,
  restrictTo,
  optionalAuth,
  checkResourceOwnership,
  sensitiveOpLimit
};
