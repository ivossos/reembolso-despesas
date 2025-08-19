const express = require('express');
const { body, validationResult } = require('express-validator');

const { query, transaction } = require('../config/database');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const { protect, restrictTo } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');
const { feedbackLearning } = require('../services/ml');
const { logger } = require('../utils/logger');

const router = express.Router();

// Apply authentication and admin restriction to all routes
router.use(protect);
router.use(restrictTo('admin', 'approver'));

// Get pending expenses for approval
router.get('/expenses/pending', catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  // Get pending expenses with user info
  const expensesResult = await query(
    `SELECT e.*, 
            CONCAT(u.first_name, ' ', u.last_name) as user_name,
            u.email as user_email,
            u.department as user_department
     FROM expenses e
     JOIN users u ON e.user_id = u.id
     WHERE e.status = 'pending'
     ORDER BY e.created_at ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  // Get total count
  const countResult = await query(
    'SELECT COUNT(*) as total FROM expenses WHERE status = $1',
    ['pending']
  );

  res.status(200).json({
    status: 'success',
    data: {
      expenses: expensesResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    }
  });
}));

// Approve expense
router.post('/expenses/:id/approve', catchAsync(async (req, res, next) => {
  const { notes } = req.body;
  const expenseId = req.params.id;

  // Get expense details
  const expenseResult = await query(
    `SELECT e.*, u.email, u.first_name, u.last_name
     FROM expenses e
     JOIN users u ON e.user_id = u.id
     WHERE e.id = $1`,
    [expenseId]
  );

  if (expenseResult.rows.length === 0) {
    return next(new AppError('Expense not found', 404));
  }

  const expense = expenseResult.rows[0];

  if (expense.status !== 'pending') {
    return next(new AppError('Can only approve pending expenses', 400));
  }

  // Update expense status
  const updatedExpense = await transaction(async (client) => {
    const updateResult = await client.query(
      `UPDATE expenses SET
         status = 'approved',
         approver_id = $1,
         approved_at = NOW(),
         approval_notes = $2,
         updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [req.user.id, notes, expenseId]
    );

    // Log approval
    await client.query(
      `INSERT INTO expense_audit_log (expense_id, user_id, action, old_status, new_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [expenseId, req.user.id, 'approved', 'pending', 'approved', notes || 'Expense approved']
    );

    // Create notification for user
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type, related_expense_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        expense.user_id,
        'Expense approved',
        `Your expense "${expense.title}" has been approved by ${req.user.first_name} ${req.user.last_name}`,
        'expense_approved',
        expenseId
      ]
    );

    return updateResult.rows[0];
  });

  // Send approval email
  try {
    await sendEmail({
      to: expense.email,
      template: 'expense-approved',
      data: {
        firstName: expense.first_name,
        expenseTitle: expense.title,
        amount: expense.amount,
        currency: expense.currency,
        approverName: `${req.user.first_name} ${req.user.last_name}`,
        approvalDate: new Date().toLocaleDateString(),
        approvalNotes: notes,
        expenseUrl: `${process.env.FRONTEND_URL}/expenses/${expenseId}`
      }
    });
  } catch (error) {
    logger.error('Failed to send approval email:', error);
  }

  // Record ML feedback if category was changed
  if (expense.ml_suggested_category && expense.ml_suggested_category !== expense.category) {
    feedbackLearning(expenseId, expense.category).catch(error => {
      logger.error('ML feedback failed:', error);
    });
  }

  logger.info(`Expense ${expenseId} approved by ${req.user.email}`);

  res.status(200).json({
    status: 'success',
    message: 'Expense approved successfully',
    data: {
      expense: updatedExpense
    }
  });
}));

// Reject expense
router.post('/expenses/:id/reject', catchAsync(async (req, res, next) => {
  const { reason } = req.body;
  const expenseId = req.params.id;

  if (!reason || reason.trim().length === 0) {
    return next(new AppError('Rejection reason is required', 400));
  }

  // Get expense details
  const expenseResult = await query(
    `SELECT e.*, u.email, u.first_name, u.last_name
     FROM expenses e
     JOIN users u ON e.user_id = u.id
     WHERE e.id = $1`,
    [expenseId]
  );

  if (expenseResult.rows.length === 0) {
    return next(new AppError('Expense not found', 404));
  }

  const expense = expenseResult.rows[0];

  if (expense.status !== 'pending') {
    return next(new AppError('Can only reject pending expenses', 400));
  }

  // Update expense status
  const updatedExpense = await transaction(async (client) => {
    const updateResult = await client.query(
      `UPDATE expenses SET
         status = 'rejected',
         approver_id = $1,
         rejected_at = NOW(),
         approval_notes = $2,
         updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [req.user.id, reason, expenseId]
    );

    // Log rejection
    await client.query(
      `INSERT INTO expense_audit_log (expense_id, user_id, action, old_status, new_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [expenseId, req.user.id, 'rejected', 'pending', 'rejected', reason]
    );

    // Create notification for user
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type, related_expense_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        expense.user_id,
        'Expense rejected',
        `Your expense "${expense.title}" has been rejected by ${req.user.first_name} ${req.user.last_name}`,
        'expense_rejected',
        expenseId
      ]
    );

    return updateResult.rows[0];
  });

  // Send rejection email
  try {
    await sendEmail({
      to: expense.email,
      template: 'expense-rejected',
      data: {
        firstName: expense.first_name,
        expenseTitle: expense.title,
        amount: expense.amount,
        currency: expense.currency,
        approverName: `${req.user.first_name} ${req.user.last_name}`,
        rejectionDate: new Date().toLocaleDateString(),
        rejectionReason: reason,
        expenseUrl: `${process.env.FRONTEND_URL}/expenses/${expenseId}`
      }
    });
  } catch (error) {
    logger.error('Failed to send rejection email:', error);
  }

  logger.info(`Expense ${expenseId} rejected by ${req.user.email}`);

  res.status(200).json({
    status: 'success',
    message: 'Expense rejected successfully',
    data: {
      expense: updatedExpense
    }
  });
}));

// Request changes to expense
router.post('/expenses/:id/request-changes', catchAsync(async (req, res, next) => {
  const { message } = req.body;
  const expenseId = req.params.id;

  if (!message || message.trim().length === 0) {
    return next(new AppError('Change request message is required', 400));
  }

  // Get expense details
  const expenseResult = await query(
    `SELECT e.*, u.email, u.first_name, u.last_name
     FROM expenses e
     JOIN users u ON e.user_id = u.id
     WHERE e.id = $1`,
    [expenseId]
  );

  if (expenseResult.rows.length === 0) {
    return next(new AppError('Expense not found', 404));
  }

  const expense = expenseResult.rows[0];

  if (expense.status !== 'pending') {
    return next(new AppError('Can only request changes for pending expenses', 400));
  }

  // Update expense status and add comment
  const updatedExpense = await transaction(async (client) => {
    const updateResult = await client.query(
      `UPDATE expenses SET
         status = 'changes_requested',
         approver_id = $1,
         approval_notes = $2,
         updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [req.user.id, message, expenseId]
    );

    // Add comment
    await client.query(
      `INSERT INTO expense_comments (expense_id, user_id, comment, is_internal)
       VALUES ($1, $2, $3, $4)`,
      [expenseId, req.user.id, message, false]
    );

    // Log change request
    await client.query(
      `INSERT INTO expense_audit_log (expense_id, user_id, action, old_status, new_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [expenseId, req.user.id, 'changes_requested', 'pending', 'changes_requested', message]
    );

    // Create notification for user
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type, related_expense_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        expense.user_id,
        'Changes requested for expense',
        `${req.user.first_name} ${req.user.last_name} has requested changes to your expense "${expense.title}"`,
        'changes_requested',
        expenseId
      ]
    );

    return updateResult.rows[0];
  });

  logger.info(`Changes requested for expense ${expenseId} by ${req.user.email}`);

  res.status(200).json({
    status: 'success',
    message: 'Changes requested successfully',
    data: {
      expense: updatedExpense
    }
  });
}));

// Mark expense as reimbursed (admin only)
router.post('/expenses/:id/reimburse', restrictTo('admin'), catchAsync(async (req, res, next) => {
  const { notes } = req.body;
  const expenseId = req.params.id;

  // Get expense details
  const expenseResult = await query(
    `SELECT e.*, u.email, u.first_name, u.last_name
     FROM expenses e
     JOIN users u ON e.user_id = u.id
     WHERE e.id = $1`,
    [expenseId]
  );

  if (expenseResult.rows.length === 0) {
    return next(new AppError('Expense not found', 404));
  }

  const expense = expenseResult.rows[0];

  if (expense.status !== 'approved') {
    return next(new AppError('Can only reimburse approved expenses', 400));
  }

  // Update expense status
  const updatedExpense = await transaction(async (client) => {
    const updateResult = await client.query(
      `UPDATE expenses SET
         status = 'reimbursed',
         reimbursed_at = NOW(),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [expenseId]
    );

    // Log reimbursement
    await client.query(
      `INSERT INTO expense_audit_log (expense_id, user_id, action, old_status, new_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [expenseId, req.user.id, 'reimbursed', 'approved', 'reimbursed', notes || 'Expense reimbursed']
    );

    // Create notification for user
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type, related_expense_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        expense.user_id,
        'Expense reimbursed',
        `Your expense "${expense.title}" has been reimbursed`,
        'expense_reimbursed',
        expenseId
      ]
    );

    return updateResult.rows[0];
  });

  logger.info(`Expense ${expenseId} marked as reimbursed by ${req.user.email}`);

  res.status(200).json({
    status: 'success',
    message: 'Expense marked as reimbursed',
    data: {
      expense: updatedExpense
    }
  });
}));

// Get all users (admin only)
router.get('/users', restrictTo('admin'), catchAsync(async (req, res, next) => {
  const { page = 1, limit = 20, role, active } = req.query;
  const offset = (page - 1) * limit;

  let whereConditions = [];
  let queryParams = [];
  let paramIndex = 1;

  if (role) {
    whereConditions.push(`role = $${paramIndex}`);
    queryParams.push(role);
    paramIndex++;
  }

  if (active !== undefined) {
    whereConditions.push(`is_active = $${paramIndex}`);
    queryParams.push(active === 'true');
    paramIndex++;
  }

  const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

  // Get users
  const usersResult = await query(
    `SELECT id, email, first_name, last_name, role, department, 
            is_active, email_verified, two_factor_enabled, created_at, last_login
     FROM users
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...queryParams, limit, offset]
  );

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM users ${whereClause}`,
    queryParams
  );

  res.status(200).json({
    status: 'success',
    data: {
      users: usersResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult.rows[0].total),
        pages: Math.ceil(countResult.rows[0].total / limit)
      }
    }
  });
}));

// Update user role (admin only)
router.put('/users/:id/role', restrictTo('admin'), catchAsync(async (req, res, next) => {
  const { role } = req.body;
  const userId = req.params.id;

  const validRoles = ['employee', 'approver', 'admin'];
  if (!validRoles.includes(role)) {
    return next(new AppError('Invalid role', 400));
  }

  // Cannot change own role
  if (userId === req.user.id) {
    return next(new AppError('Cannot change your own role', 400));
  }

  // Update user role
  const result = await query(
    `UPDATE users SET role = $1, updated_at = NOW() 
     WHERE id = $2 
     RETURNING id, email, first_name, last_name, role`,
    [role, userId]
  );

  if (result.rows.length === 0) {
    return next(new AppError('User not found', 404));
  }

  logger.info(`User role updated: ${result.rows[0].email} -> ${role} by ${req.user.email}`);

  res.status(200).json({
    status: 'success',
    data: {
      user: result.rows[0]
    }
  });
}));

// Deactivate/activate user (admin only)
router.put('/users/:id/status', restrictTo('admin'), catchAsync(async (req, res, next) => {
  const { isActive } = req.body;
  const userId = req.params.id;

  // Cannot deactivate own account
  if (userId === req.user.id) {
    return next(new AppError('Cannot change your own account status', 400));
  }

  // Update user status
  const result = await query(
    `UPDATE users SET is_active = $1, updated_at = NOW() 
     WHERE id = $2 
     RETURNING id, email, first_name, last_name, is_active`,
    [isActive, userId]
  );

  if (result.rows.length === 0) {
    return next(new AppError('User not found', 404));
  }

  logger.info(`User status updated: ${result.rows[0].email} -> ${isActive ? 'active' : 'inactive'} by ${req.user.email}`);

  res.status(200).json({
    status: 'success',
    data: {
      user: result.rows[0]
    }
  });
}));

// Get system statistics (admin only)
router.get('/stats', restrictTo('admin'), catchAsync(async (req, res, next) => {
  const { period = '30' } = req.query; // days

  // Get overall stats
  const overallStats = await query(
    `SELECT 
       COUNT(*) as total_expenses,
       COUNT(DISTINCT user_id) as active_users,
       COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_expenses,
       COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_expenses,
       COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_expenses,
       COUNT(CASE WHEN status = 'reimbursed' THEN 1 END) as reimbursed_expenses,
       COALESCE(SUM(amount), 0) as total_amount,
       COALESCE(AVG(amount), 0) as avg_amount
     FROM expenses 
     WHERE created_at > NOW() - INTERVAL '${period} days'`
  );

  // Get user stats
  const userStats = await query(
    `SELECT 
       COUNT(*) as total_users,
       COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
       COUNT(CASE WHEN role = 'employee' THEN 1 END) as employees,
       COUNT(CASE WHEN role = 'approver' THEN 1 END) as approvers,
       COUNT(CASE WHEN role = 'admin' THEN 1 END) as admins
     FROM users`
  );

  // Get category breakdown
  const categoryStats = await query(
    `SELECT 
       category,
       COUNT(*) as count,
       SUM(amount) as total_amount,
       AVG(amount) as avg_amount
     FROM expenses 
     WHERE created_at > NOW() - INTERVAL '${period} days'
     GROUP BY category
     ORDER BY total_amount DESC`
  );

  // Get daily trend
  const dailyTrend = await query(
    `SELECT 
       DATE(created_at) as date,
       COUNT(*) as expense_count,
       SUM(amount) as total_amount
     FROM expenses 
     WHERE created_at > NOW() - INTERVAL '${period} days'
     GROUP BY DATE(created_at)
     ORDER BY date`
  );

  res.status(200).json({
    status: 'success',
    data: {
      period: `${period} days`,
      overall: overallStats.rows[0],
      users: userStats.rows[0],
      categories: categoryStats.rows,
      dailyTrend: dailyTrend.rows
    }
  });
}));

// Get system settings (admin only)
router.get('/settings', restrictTo('admin'), catchAsync(async (req, res, next) => {
  const settingsResult = await query(
    'SELECT key, value, description, updated_at FROM system_settings ORDER BY key'
  );

  const settings = {};
  settingsResult.rows.forEach(row => {
    settings[row.key] = {
      value: row.value,
      description: row.description,
      updated_at: row.updated_at
    };
  });

  res.status(200).json({
    status: 'success',
    data: {
      settings
    }
  });
}));

// Update system settings (admin only)
router.put('/settings/:key', restrictTo('admin'), catchAsync(async (req, res, next) => {
  const { value, description } = req.body;
  const key = req.params.key;

  if (!value) {
    return next(new AppError('Setting value is required', 400));
  }

  // Update or insert setting
  const result = await query(
    `INSERT INTO system_settings (key, value, description, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (key) DO UPDATE SET
     value = EXCLUDED.value,
     description = COALESCE(EXCLUDED.description, system_settings.description),
     updated_by = EXCLUDED.updated_by,
     updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [key, JSON.stringify(value), description, req.user.id]
  );

  logger.info(`System setting updated: ${key} by ${req.user.email}`);

  res.status(200).json({
    status: 'success',
    data: {
      setting: result.rows[0]
    }
  });
}));

module.exports = router;
