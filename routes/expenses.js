const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { body, query: queryValidator, validationResult } = require('express-validator');

const { query, transaction } = require('../config/database');
const { AppError, catchAsync } = require('../middleware/errorHandler');
const { protect, restrictTo, checkResourceOwnership } = require('../middleware/auth');
const { uploadToS3, processReceiptOCR } = require('../services/aws');
const { categorizeMachine } = require('../services/ml');
const { sendEmail } = require('../utils/email');
const { logger } = require('../utils/logger');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('Only JPEG, PNG, and PDF files are allowed', 400), false);
    }
  }
});

// Validation middleware
const validateExpense = [
  body('title').trim().isLength({ min: 1, max: 255 }).withMessage('Title is required and must be less than 255 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description must be less than 1000 characters'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('currency').optional().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('expenseDate').isDate().withMessage('Valid expense date is required'),
  body('vendor').optional().trim().isLength({ max: 255 }).withMessage('Vendor name must be less than 255 characters'),
  body('category').isIn(['meals', 'transportation', 'accommodation', 'office_supplies', 'software', 'training', 'marketing', 'travel', 'other']).withMessage('Invalid category')
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

// Get all expenses for current user with filtering and pagination
router.get('/', catchAsync(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    status,
    category,
    startDate,
    endDate,
    minAmount,
    maxAmount,
    sortBy = 'created_at',
    sortOrder = 'desc'
  } = req.query;

  // Build WHERE clause
  let whereConditions = ['user_id = $1'];
  let queryParams = [req.user.id];
  let paramIndex = 2;

  if (status) {
    whereConditions.push(`status = $${paramIndex}`);
    queryParams.push(status);
    paramIndex++;
  }

  if (category) {
    whereConditions.push(`category = $${paramIndex}`);
    queryParams.push(category);
    paramIndex++;
  }

  if (startDate) {
    whereConditions.push(`expense_date >= $${paramIndex}`);
    queryParams.push(startDate);
    paramIndex++;
  }

  if (endDate) {
    whereConditions.push(`expense_date <= $${paramIndex}`);
    queryParams.push(endDate);
    paramIndex++;
  }

  if (minAmount) {
    whereConditions.push(`amount >= $${paramIndex}`);
    queryParams.push(minAmount);
    paramIndex++;
  }

  if (maxAmount) {
    whereConditions.push(`amount <= $${paramIndex}`);
    queryParams.push(maxAmount);
    paramIndex++;
  }

  const whereClause = whereConditions.join(' AND ');

  // Validate sort parameters
  const allowedSortFields = ['created_at', 'expense_date', 'amount', 'status', 'title'];
  const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'created_at';
  const sortDirection = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  // Calculate offset
  const offset = (page - 1) * limit;

  // Get total count
  const countResult = await query(
    `SELECT COUNT(*) as total FROM expenses WHERE ${whereClause}`,
    queryParams
  );
  const total = parseInt(countResult.rows[0].total);

  // Get expenses
  const expensesResult = await query(
    `SELECT e.*, 
            CONCAT(a.first_name, ' ', a.last_name) as approver_name
     FROM expenses e
     LEFT JOIN users a ON e.approver_id = a.id
     WHERE ${whereClause}
     ORDER BY e.${sortField} ${sortDirection}
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...queryParams, limit, offset]
  );

  res.status(200).json({
    status: 'success',
    data: {
      expenses: expensesResult.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
}));

// Get expense summary/statistics
router.get('/summary', catchAsync(async (req, res, next) => {
  const summaryResult = await query(
    `SELECT 
       COUNT(*) as total_expenses,
       COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
       COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
       COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
       COUNT(CASE WHEN status = 'reimbursed' THEN 1 END) as reimbursed_count,
       COALESCE(SUM(amount), 0) as total_amount,
       COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_amount,
       COALESCE(SUM(CASE WHEN status = 'approved' OR status = 'reimbursed' THEN amount ELSE 0 END), 0) as approved_amount
     FROM expenses 
     WHERE user_id = $1`,
    [req.user.id]
  );

  // Get monthly breakdown for current year
  const monthlyResult = await query(
    `SELECT 
       DATE_TRUNC('month', expense_date) as month,
       COUNT(*) as count,
       SUM(amount) as total_amount
     FROM expenses 
     WHERE user_id = $1 AND EXTRACT(YEAR FROM expense_date) = EXTRACT(YEAR FROM CURRENT_DATE)
     GROUP BY DATE_TRUNC('month', expense_date)
     ORDER BY month`,
    [req.user.id]
  );

  // Get category breakdown
  const categoryResult = await query(
    `SELECT 
       category,
       COUNT(*) as count,
       SUM(amount) as total_amount
     FROM expenses 
     WHERE user_id = $1
     GROUP BY category
     ORDER BY total_amount DESC`,
    [req.user.id]
  );

  res.status(200).json({
    status: 'success',
    data: {
      summary: summaryResult.rows[0],
      monthlyBreakdown: monthlyResult.rows,
      categoryBreakdown: categoryResult.rows
    }
  });
}));

// Get single expense
router.get('/:id', catchAsync(async (req, res, next) => {
  const expenseResult = await query(
    `SELECT e.*, 
            CONCAT(u.first_name, ' ', u.last_name) as user_name,
            u.email as user_email,
            CONCAT(a.first_name, ' ', a.last_name) as approver_name,
            a.email as approver_email
     FROM expenses e
     JOIN users u ON e.user_id = u.id
     LEFT JOIN users a ON e.approver_id = a.id
     WHERE e.id = $1`,
    [req.params.id]
  );

  if (expenseResult.rows.length === 0) {
    return next(new AppError('Expense not found', 404));
  }

  const expense = expenseResult.rows[0];

  // Check if user can access this expense
  if (req.user.role !== 'admin' && 
      req.user.role !== 'approver' && 
      expense.user_id !== req.user.id) {
    return next(new AppError('You can only access your own expenses', 403));
  }

  // Get comments
  const commentsResult = await query(
    `SELECT c.*, CONCAT(u.first_name, ' ', u.last_name) as user_name
     FROM expense_comments c
     JOIN users u ON c.user_id = u.id
     WHERE c.expense_id = $1
     ORDER BY c.created_at ASC`,
    [req.params.id]
  );

  // Get audit log
  const auditResult = await query(
    `SELECT a.*, CONCAT(u.first_name, ' ', u.last_name) as user_name
     FROM expense_audit_log a
     JOIN users u ON a.user_id = u.id
     WHERE a.expense_id = $1
     ORDER BY a.created_at DESC`,
    [req.params.id]
  );

  res.status(200).json({
    status: 'success',
    data: {
      expense,
      comments: commentsResult.rows,
      auditLog: auditResult.rows
    }
  });
}));

// Create new expense
router.post('/', upload.single('receipt'), validateExpense, checkValidation, catchAsync(async (req, res, next) => {
  const { title, description, amount, currency = 'BRL', expenseDate, vendor, category } = req.body;
  const file = req.file;

  let receiptUrl = null;
  let receiptFilename = null;

  // Upload receipt if provided
  if (file) {
    const fileExtension = path.extname(file.originalname);
    const fileName = `receipts/${req.user.id}/${uuidv4()}${fileExtension}`;
    
    receiptUrl = await uploadToS3(file.buffer, fileName, file.mimetype);
    receiptFilename = file.originalname;
  }

  // Create expense in transaction
  const expense = await transaction(async (client) => {
    // Insert expense
    const expenseResult = await client.query(
      `INSERT INTO expenses (
         user_id, title, description, amount, currency, expense_date, 
         vendor, category, receipt_url, receipt_filename, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        req.user.id, title, description, amount, currency, expenseDate,
        vendor, category, receiptUrl, receiptFilename, 'draft'
      ]
    );

    const newExpense = expenseResult.rows[0];

    // Log creation
    await client.query(
      `INSERT INTO expense_audit_log (expense_id, user_id, action, new_status, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [newExpense.id, req.user.id, 'created', 'draft', 'Expense created']
    );

    // Queue OCR processing if receipt was uploaded
    if (receiptUrl) {
      await client.query(
        `INSERT INTO ocr_queue (expense_id, receipt_url, status)
         VALUES ($1, $2, $3)`,
        [newExpense.id, receiptUrl, 'pending']
      );
    }

    return newExpense;
  });

  // Start asynchronous OCR processing
  if (receiptUrl) {
    processReceiptOCR(expense.id, receiptUrl).catch(error => {
      logger.error('OCR processing failed:', error);
    });
  }

  // Start ML categorization
  categorizeMachine(expense.id, { title, description, vendor, amount }).catch(error => {
    logger.error('ML categorization failed:', error);
  });

  logger.info(`Expense created: ${expense.id} by user ${req.user.id}`);

  res.status(201).json({
    status: 'success',
    data: {
      expense
    }
  });
}));

// Update expense (only if in draft status)
router.put('/:id', upload.single('receipt'), validateExpense, checkValidation, catchAsync(async (req, res, next) => {
  const { title, description, amount, currency = 'BRL', expenseDate, vendor, category } = req.body;
  const file = req.file;

  // Get current expense
  const currentResult = await query(
    'SELECT * FROM expenses WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );

  if (currentResult.rows.length === 0) {
    return next(new AppError('Expense not found', 404));
  }

  const currentExpense = currentResult.rows[0];

  // Only allow updates if expense is in draft status
  if (currentExpense.status !== 'draft') {
    return next(new AppError('Can only update expenses in draft status', 400));
  }

  let receiptUrl = currentExpense.receipt_url;
  let receiptFilename = currentExpense.receipt_filename;

  // Upload new receipt if provided
  if (file) {
    const fileExtension = path.extname(file.originalname);
    const fileName = `receipts/${req.user.id}/${uuidv4()}${fileExtension}`;
    
    receiptUrl = await uploadToS3(file.buffer, fileName, file.mimetype);
    receiptFilename = file.originalname;
  }

  // Update expense
  const updatedExpense = await transaction(async (client) => {
    const updateResult = await client.query(
      `UPDATE expenses SET
         title = $1, description = $2, amount = $3, currency = $4,
         expense_date = $5, vendor = $6, category = $7,
         receipt_url = $8, receipt_filename = $9, updated_at = NOW()
       WHERE id = $10 AND user_id = $11
       RETURNING *`,
      [
        title, description, amount, currency, expenseDate, vendor, category,
        receiptUrl, receiptFilename, req.params.id, req.user.id
      ]
    );

    // Log update
    await client.query(
      `INSERT INTO expense_audit_log (expense_id, user_id, action, notes)
       VALUES ($1, $2, $3, $4)`,
      [req.params.id, req.user.id, 'updated', 'Expense details updated']
    );

    // Queue OCR processing if new receipt was uploaded
    if (file) {
      await client.query(
        `INSERT INTO ocr_queue (expense_id, receipt_url, status)
         VALUES ($1, $2, $3)
         ON CONFLICT (expense_id) DO UPDATE SET
         receipt_url = EXCLUDED.receipt_url,
         status = EXCLUDED.status,
         attempts = 0,
         created_at = NOW()`,
        [req.params.id, receiptUrl, 'pending']
      );
    }

    return updateResult.rows[0];
  });

  // Start asynchronous processing if new receipt
  if (file) {
    processReceiptOCR(req.params.id, receiptUrl).catch(error => {
      logger.error('OCR processing failed:', error);
    });
  }

  logger.info(`Expense updated: ${req.params.id} by user ${req.user.id}`);

  res.status(200).json({
    status: 'success',
    data: {
      expense: updatedExpense
    }
  });
}));

// Submit expense for approval
router.post('/:id/submit', catchAsync(async (req, res, next) => {
  const expenseResult = await query(
    'SELECT * FROM expenses WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );

  if (expenseResult.rows.length === 0) {
    return next(new AppError('Expense not found', 404));
  }

  const expense = expenseResult.rows[0];

  if (expense.status !== 'draft') {
    return next(new AppError('Can only submit expenses in draft status', 400));
  }

  // Find approver (for now, find any user with approver role)
  const approverResult = await query(
    `SELECT id, first_name, last_name, email FROM users 
     WHERE role IN ('approver', 'admin') AND is_active = true 
     ORDER BY RANDOM() LIMIT 1`
  );

  if (approverResult.rows.length === 0) {
    return next(new AppError('No approvers available', 500));
  }

  const approver = approverResult.rows[0];

  // Update expense status and assign approver
  const updatedExpense = await transaction(async (client) => {
    const updateResult = await client.query(
      `UPDATE expenses SET
         status = 'pending',
         approver_id = $1,
         updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [approver.id, req.params.id]
    );

    // Log submission
    await client.query(
      `INSERT INTO expense_audit_log (expense_id, user_id, action, old_status, new_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [req.params.id, req.user.id, 'submitted', 'draft', 'pending', 'Expense submitted for approval']
    );

    // Create notification for approver
    await client.query(
      `INSERT INTO notifications (user_id, title, message, type, related_expense_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        approver.id,
        'New expense requires approval',
        `${req.user.first_name} ${req.user.last_name} submitted an expense for ${expense.currency} ${expense.amount}`,
        'approval_request',
        req.params.id
      ]
    );

    return updateResult.rows[0];
  });

  // Send email notifications
  try {
    // Email to employee
    await sendEmail({
      to: req.user.email,
      template: 'expense-submitted',
      data: {
        firstName: req.user.first_name,
        expenseTitle: expense.title,
        amount: expense.amount,
        currency: expense.currency,
        expenseDate: expense.expense_date,
        category: expense.category,
        vendor: expense.vendor,
        expenseUrl: `${process.env.FRONTEND_URL}/expenses/${expense.id}`
      }
    });

    // Email to approver
    await sendEmail({
      to: approver.email,
      template: 'approval-request',
      data: {
        approverName: `${approver.first_name} ${approver.last_name}`,
        submitterName: `${req.user.first_name} ${req.user.last_name}`,
        expenseTitle: expense.title,
        amount: expense.amount,
        currency: expense.currency,
        expenseDate: expense.expense_date,
        category: expense.category,
        vendor: expense.vendor,
        submissionDate: new Date().toLocaleDateString(),
        approvalUrl: `${process.env.FRONTEND_URL}/approvals/${expense.id}`
      }
    });
  } catch (error) {
    logger.error('Failed to send submission emails:', error);
    // Don't fail the submission if email fails
  }

  logger.info(`Expense submitted: ${req.params.id} by user ${req.user.id}`);

  res.status(200).json({
    status: 'success',
    message: 'Expense submitted for approval',
    data: {
      expense: updatedExpense
    }
  });
}));

// Delete expense (only if in draft status)
router.delete('/:id', catchAsync(async (req, res, next) => {
  const expenseResult = await query(
    'SELECT * FROM expenses WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );

  if (expenseResult.rows.length === 0) {
    return next(new AppError('Expense not found', 404));
  }

  const expense = expenseResult.rows[0];

  if (expense.status !== 'draft') {
    return next(new AppError('Can only delete expenses in draft status', 400));
  }

  // Delete expense and related records
  await transaction(async (client) => {
    // Delete related records first
    await client.query('DELETE FROM expense_comments WHERE expense_id = $1', [req.params.id]);
    await client.query('DELETE FROM expense_audit_log WHERE expense_id = $1', [req.params.id]);
    await client.query('DELETE FROM ocr_queue WHERE expense_id = $1', [req.params.id]);
    await client.query('DELETE FROM notifications WHERE related_expense_id = $1', [req.params.id]);

    // Delete the expense
    await client.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
  });

  logger.info(`Expense deleted: ${req.params.id} by user ${req.user.id}`);

  res.status(204).json({
    status: 'success',
    data: null
  });
}));

// Add comment to expense
router.post('/:id/comments', catchAsync(async (req, res, next) => {
  const { comment, isInternal = false } = req.body;

  if (!comment || comment.trim().length === 0) {
    return next(new AppError('Comment cannot be empty', 400));
  }

  // Check if expense exists and user has access
  const expenseResult = await query(
    'SELECT * FROM expenses WHERE id = $1',
    [req.params.id]
  );

  if (expenseResult.rows.length === 0) {
    return next(new AppError('Expense not found', 404));
  }

  const expense = expenseResult.rows[0];

  // Check access permissions
  if (req.user.role !== 'admin' && 
      req.user.role !== 'approver' && 
      expense.user_id !== req.user.id) {
    return next(new AppError('You can only comment on your own expenses or expenses you can approve', 403));
  }

  // Add comment
  const commentResult = await query(
    `INSERT INTO expense_comments (expense_id, user_id, comment, is_internal)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [req.params.id, req.user.id, comment.trim(), isInternal]
  );

  // Log comment addition
  await query(
    `INSERT INTO expense_audit_log (expense_id, user_id, action, notes)
     VALUES ($1, $2, $3, $4)`,
    [req.params.id, req.user.id, 'commented', `Added ${isInternal ? 'internal ' : ''}comment`]
  );

  logger.info(`Comment added to expense ${req.params.id} by user ${req.user.id}`);

  res.status(201).json({
    status: 'success',
    data: {
      comment: commentResult.rows[0]
    }
  });
}));

// OCR Processing endpoint for immediate processing
router.post('/ocr-process', upload.single('receipt'), catchAsync(async (req, res, next) => {
  const file = req.file;
  
  if (!file) {
    return next(new AppError('Receipt file is required', 400));
  }

  try {
    // For immediate OCR processing, we'll simulate the result
    // In production, this would call the actual OCR service
    const ocrResult = {
      fullText: "SAMPLE RECEIPT TEXT - OCR PROCESSING SIMULATED",
      keyValuePairs: {
        "vendor": "Sample Vendor",
        "amount": "25.00",
        "date": "2025-01-20"
      },
      confidence: 0.85
    };
    
    // Get ML categorization suggestion
    const mlResult = await categorizeMachine(null, {
      title: ocrResult.keyValuePairs.vendor || '',
      description: ocrResult.fullText || '',
      vendor: ocrResult.keyValuePairs.vendor || '',
      amount: ocrResult.keyValuePairs.amount || 0
    });

    res.status(200).json({
      status: 'success',
      data: {
        ...ocrResult,
        suggestedCategory: mlResult.category,
        confidence: mlResult.confidence
      }
    });
  } catch (error) {
    logger.error('OCR processing failed:', error);
    return next(new AppError('Failed to process receipt with OCR', 500));
  }
}));

module.exports = router;
