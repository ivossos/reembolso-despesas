const nodemailer = require('nodemailer');
const { logger } = require('./logger');

// Email templates
const emailTemplates = {
  'email-verification': {
    subject: 'Verify your Reembolso account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Welcome to Reembolso de Despesas!</h2>
        <p>Hello {{firstName}},</p>
        <p>Thank you for registering with Reembolso. Please verify your email address to complete your account setup.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{verificationUrl}}" 
             style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p><a href="{{verificationUrl}}">{{verificationUrl}}</a></p>
        <p>This link will expire in 24 hours.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">
          If you didn't create an account with Reembolso, please ignore this email.
        </p>
      </div>
    `
  },
  'password-reset': {
    subject: 'Reset your Reembolso password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Password Reset Request</h2>
        <p>Hello {{firstName}},</p>
        <p>We received a request to reset your password for your Reembolso account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{resetUrl}}" 
             style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
        <p><a href="{{resetUrl}}">{{resetUrl}}</a></p>
        <p><strong>This link will expire in 10 minutes for security reasons.</strong></p>
        <hr>
        <p style="color: #666; font-size: 12px;">
          If you didn't request a password reset, please ignore this email. Your password will not be changed.
        </p>
      </div>
    `
  },
  'expense-submitted': {
    subject: 'Expense submitted for approval',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Expense Submitted Successfully</h2>
        <p>Hello {{firstName}},</p>
        <p>Your expense has been successfully submitted and is now pending approval.</p>
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 4px; margin: 20px 0;">
          <h3>Expense Details:</h3>
          <p><strong>Title:</strong> {{expenseTitle}}</p>
          <p><strong>Amount:</strong> {{currency}} {{amount}}</p>
          <p><strong>Date:</strong> {{expenseDate}}</p>
          <p><strong>Category:</strong> {{category}}</p>
          <p><strong>Vendor:</strong> {{vendor}}</p>
        </div>
        <p>You will receive another email once your expense has been reviewed.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{expenseUrl}}" 
             style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            View Expense
          </a>
        </div>
      </div>
    `
  },
  'expense-approved': {
    subject: 'Expense approved',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #28a745;">Expense Approved ✓</h2>
        <p>Hello {{firstName}},</p>
        <p>Great news! Your expense has been approved and will be processed for reimbursement.</p>
        <div style="background-color: #d4edda; padding: 20px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #28a745;">
          <h3>Approved Expense:</h3>
          <p><strong>Title:</strong> {{expenseTitle}}</p>
          <p><strong>Amount:</strong> {{currency}} {{amount}}</p>
          <p><strong>Approved by:</strong> {{approverName}}</p>
          <p><strong>Approval Date:</strong> {{approvalDate}}</p>
          {{#if approvalNotes}}
          <p><strong>Notes:</strong> {{approvalNotes}}</p>
          {{/if}}
        </div>
        <p>Your reimbursement will be processed according to company policy.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{expenseUrl}}" 
             style="background-color: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            View Expense
          </a>
        </div>
      </div>
    `
  },
  'expense-rejected': {
    subject: 'Expense rejected',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">Expense Rejected</h2>
        <p>Hello {{firstName}},</p>
        <p>Unfortunately, your expense has been rejected. Please review the details below.</p>
        <div style="background-color: #f8d7da; padding: 20px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #dc3545;">
          <h3>Rejected Expense:</h3>
          <p><strong>Title:</strong> {{expenseTitle}}</p>
          <p><strong>Amount:</strong> {{currency}} {{amount}}</p>
          <p><strong>Rejected by:</strong> {{approverName}}</p>
          <p><strong>Rejection Date:</strong> {{rejectionDate}}</p>
          {{#if rejectionReason}}
          <p><strong>Reason:</strong> {{rejectionReason}}</p>
          {{/if}}
        </div>
        <p>If you believe this rejection was in error, please contact your approver or submit a new expense with additional documentation.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{expenseUrl}}" 
             style="background-color: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            View Expense
          </a>
        </div>
      </div>
    `
  },
  'approval-request': {
    subject: 'New expense requires your approval',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>Expense Approval Request</h2>
        <p>Hello {{approverName}},</p>
        <p>A new expense has been submitted and requires your approval.</p>
        <div style="background-color: #fff3cd; padding: 20px; border-radius: 4px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <h3>Expense Details:</h3>
          <p><strong>Submitted by:</strong> {{submitterName}}</p>
          <p><strong>Title:</strong> {{expenseTitle}}</p>
          <p><strong>Amount:</strong> {{currency}} {{amount}}</p>
          <p><strong>Date:</strong> {{expenseDate}}</p>
          <p><strong>Category:</strong> {{category}}</p>
          <p><strong>Vendor:</strong> {{vendor}}</p>
          <p><strong>Submitted on:</strong> {{submissionDate}}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="{{approvalUrl}}" 
             style="background-color: #ffc107; color: #212529; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin-right: 10px;">
            Review & Approve
          </a>
        </div>
      </div>
    `
  }
};

// Create transporter
const createTransporter = () => {
  const config = {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    }
  };

  // For development, use ethereal email
  if (process.env.NODE_ENV === 'development' && !process.env.SMTP_HOST) {
    logger.warn('No SMTP configuration found, emails will be logged instead of sent');
    return null;
  }

  return nodemailer.createTransporter(config);
};

// Replace template variables
const replaceTemplateVariables = (template, data) => {
  let result = template;
  
  // Simple template replacement (supports {{variable}} syntax)
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, data[key] || '');
  });

  // Handle conditional blocks {{#if variable}}...{{/if}}
  result = result.replace(/{{#if (\w+)}}(.*?){{\/if}}/gs, (match, variable, content) => {
    return data[variable] ? content : '';
  });

  return result;
};

// Send email function
const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();
    
    if (!transporter) {
      // Log email in development
      logger.info('Email would be sent:', {
        to: options.to,
        subject: options.subject,
        template: options.template,
        data: options.data
      });
      return true;
    }

    let htmlContent = options.html;
    let subject = options.subject;

    // Use template if specified
    if (options.template && emailTemplates[options.template]) {
      const template = emailTemplates[options.template];
      htmlContent = replaceTemplateVariables(template.html, options.data || {});
      subject = options.customSubject || template.subject;
    }

    const mailOptions = {
      from: process.env.FROM_EMAIL || process.env.SMTP_USER,
      to: options.to,
      subject: subject,
      html: htmlContent,
      text: options.text // Optional plain text version
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info(`Email sent successfully to ${options.to}:`, result.messageId);
    
    return result;
  } catch (error) {
    logger.error('Failed to send email:', {
      error: error.message,
      to: options.to,
      template: options.template
    });
    throw error;
  }
};

// Send bulk emails (for notifications)
const sendBulkEmails = async (emails) => {
  const results = [];
  
  for (const email of emails) {
    try {
      const result = await sendEmail(email);
      results.push({ success: true, email: email.to, result });
    } catch (error) {
      results.push({ success: false, email: email.to, error: error.message });
    }
  }

  return results;
};

module.exports = {
  sendEmail,
  sendBulkEmails,
  emailTemplates
};
