-- Reembolso de Despesas Database Schema
-- PostgreSQL Schema for Expense Reimbursement System

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- User roles enum
CREATE TYPE user_role AS ENUM ('employee', 'approver', 'admin');

-- Expense status enum
CREATE TYPE expense_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'reimbursed', 'changes_requested');

-- Expense categories enum
CREATE TYPE expense_category AS ENUM (
  'meals', 'transportation', 'accommodation', 'office_supplies', 
  'software', 'training', 'marketing', 'travel', 'other'
);

-- OCR status enum
CREATE TYPE ocr_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role user_role DEFAULT 'employee',
  department VARCHAR(100),
  manager_id UUID REFERENCES users(id),
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret VARCHAR(32),
  avatar_url TEXT,
  notification_preferences JSONB DEFAULT '{"email": true, "in_app": true}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login TIMESTAMP WITH TIME ZONE
);

-- Password reset tokens table
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Email verification tokens table
CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Expenses table
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) DEFAULT 'BRL',
  expense_date DATE NOT NULL,
  vendor VARCHAR(255),
  category expense_category NOT NULL,
  status expense_status DEFAULT 'draft',
  receipt_url TEXT,
  receipt_filename VARCHAR(255),
  ocr_data JSONB,
  ocr_status ocr_status DEFAULT 'pending',
  ml_suggested_category expense_category,
  ml_confidence DECIMAL(3,2),
  approver_id UUID REFERENCES users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_at TIMESTAMP WITH TIME ZONE,
  reimbursed_at TIMESTAMP WITH TIME ZONE,
  approval_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Expense audit log table
CREATE TABLE expense_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES expenses(id),
  user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  old_status expense_status,
  new_status expense_status,
  notes TEXT,
  metadata JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Expense comments table
CREATE TABLE expense_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES expenses(id),
  user_id UUID NOT NULL REFERENCES users(id),
  comment TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL,
  related_expense_id UUID REFERENCES expenses(id),
  read BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- System settings table
CREATE TABLE system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- OCR processing queue table
CREATE TABLE ocr_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID NOT NULL REFERENCES expenses(id),
  receipt_url TEXT NOT NULL,
  status ocr_status DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 3,
  error_message TEXT,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX idx_expenses_approver_id ON expenses(approver_id);
CREATE INDEX idx_expenses_created_at ON expenses(created_at);

CREATE INDEX idx_expense_audit_log_expense_id ON expense_audit_log(expense_id);
CREATE INDEX idx_expense_audit_log_user_id ON expense_audit_log(user_id);
CREATE INDEX idx_expense_audit_log_created_at ON expense_audit_log(created_at);

CREATE INDEX idx_expense_comments_expense_id ON expense_comments(expense_id);
CREATE INDEX idx_expense_comments_user_id ON expense_comments(user_id);

CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_created_at ON notifications(created_at);

CREATE INDEX idx_ocr_queue_status ON ocr_queue(status);
CREATE INDEX idx_ocr_queue_created_at ON ocr_queue(created_at);

-- Create triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expense_comments_updated_at BEFORE UPDATE ON expense_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default system settings
INSERT INTO system_settings (key, value, description) VALUES
('expense_categories', '["meals", "transportation", "accommodation", "office_supplies", "software", "training", "marketing", "travel", "other"]', 'Available expense categories'),
('approval_thresholds', '{"auto_approve_limit": 100, "requires_manager": 500, "requires_admin": 1000}', 'Automatic approval thresholds in BRL'),
('email_templates', '{"approval_request": "Your expense has been submitted for approval", "approved": "Your expense has been approved", "rejected": "Your expense has been rejected"}', 'Email notification templates'),
('ocr_settings', '{"confidence_threshold": 0.8, "retry_attempts": 3, "timeout_seconds": 30}', 'OCR processing settings'),
('ml_settings', '{"categorization_threshold": 0.7, "retrain_interval_days": 30}', 'Machine learning settings');
