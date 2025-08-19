-- Seed data for Reembolso de Despesas
-- Insert sample data for development and testing

-- Insert admin user (password: admin123)
INSERT INTO users (email, password_hash, first_name, last_name, role, is_active, email_verified) VALUES
('admin@reembolso.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj0kEOmMy8lW', 'Admin', 'User', 'admin', true, true);

-- Insert approver user (password: approver123)
INSERT INTO users (email, password_hash, first_name, last_name, role, department, is_active, email_verified) VALUES
('approver@reembolso.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj0kEOmMy8lW', 'John', 'Approver', 'approver', 'Finance', true, true);

-- Insert employee users (password: employee123)
INSERT INTO users (email, password_hash, first_name, last_name, role, department, is_active, email_verified) VALUES
('employee1@reembolso.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj0kEOmMy8lW', 'Maria', 'Silva', 'employee', 'Marketing', true, true),
('employee2@reembolso.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj0kEOmMy8lW', 'João', 'Santos', 'employee', 'IT', true, true),
('employee3@reembolso.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj0kEOmMy8lW', 'Ana', 'Costa', 'employee', 'Sales', true, true);

-- Insert sample expenses
INSERT INTO expenses (user_id, title, description, amount, currency, expense_date, vendor, category, status, created_at) VALUES
-- Maria's expenses
((SELECT id FROM users WHERE email = 'employee1@reembolso.com'), 'Team Lunch Meeting', 'Lunch with client to discuss new campaign', 85.50, 'BRL', '2024-01-15', 'Restaurante Central', 'meals', 'approved', '2024-01-15 14:30:00'),
((SELECT id FROM users WHERE email = 'employee1@reembolso.com'), 'Uber to Client Office', 'Transportation to client meeting', 25.00, 'BRL', '2024-01-16', 'Uber', 'transportation', 'reimbursed', '2024-01-16 09:15:00'),
((SELECT id FROM users WHERE email = 'employee1@reembolso.com'), 'Adobe Creative Suite', 'Monthly subscription for design tools', 320.00, 'BRL', '2024-01-20', 'Adobe Systems', 'software', 'pending', '2024-01-20 10:00:00'),

-- João's expenses
((SELECT id FROM users WHERE email = 'employee2@reembolso.com'), 'AWS Cloud Services', 'Monthly cloud infrastructure costs', 450.00, 'BRL', '2024-01-18', 'Amazon Web Services', 'software', 'approved', '2024-01-18 11:00:00'),
((SELECT id FROM users WHERE email = 'employee2@reembolso.com'), 'Tech Conference Ticket', 'Annual developer conference registration', 850.00, 'BRL', '2024-01-22', 'TechConf Brazil', 'training', 'pending', '2024-01-22 16:45:00'),
((SELECT id FROM users WHERE email = 'employee2@reembolso.com'), 'Office Supplies', 'Notebooks and pens for team', 45.75, 'BRL', '2024-01-25', 'Papelaria Central', 'office_supplies', 'draft', '2024-01-25 13:20:00'),

-- Ana's expenses
((SELECT id FROM users WHERE email = 'employee3@reembolso.com'), 'Client Dinner', 'Dinner meeting with potential client', 180.00, 'BRL', '2024-01-17', 'Churrascaria Premium', 'meals', 'approved', '2024-01-17 20:30:00'),
((SELECT id FROM users WHERE email = 'employee3@reembolso.com'), 'Hotel Stay - Business Trip', 'Two nights in São Paulo for sales meeting', 420.00, 'BRL', '2024-01-19', 'Hotel Business Center', 'accommodation', 'reimbursed', '2024-01-19 22:00:00'),
((SELECT id FROM users WHERE email = 'employee3@reembolso.com'), 'Flight to São Paulo', 'Round trip flight for client meetings', 650.00, 'BRL', '2024-01-19', 'LATAM Airlines', 'travel', 'approved', '2024-01-19 06:30:00');

-- Update some expenses with approver information
UPDATE expenses SET 
    approver_id = (SELECT id FROM users WHERE email = 'approver@reembolso.com'),
    approved_at = created_at + INTERVAL '1 day'
WHERE status IN ('approved', 'reimbursed');

UPDATE expenses SET 
    reimbursed_at = approved_at + INTERVAL '3 days'
WHERE status = 'reimbursed';

-- Insert audit log entries for approved/reimbursed expenses
INSERT INTO expense_audit_log (expense_id, user_id, action, old_status, new_status, notes, created_at)
SELECT 
    e.id,
    e.user_id,
    'created',
    NULL,
    'draft',
    'Expense created',
    e.created_at
FROM expenses e;

INSERT INTO expense_audit_log (expense_id, user_id, action, old_status, new_status, notes, created_at)
SELECT 
    e.id,
    e.user_id,
    'submitted',
    'draft',
    'pending',
    'Expense submitted for approval',
    e.created_at + INTERVAL '5 minutes'
FROM expenses e
WHERE e.status IN ('approved', 'reimbursed', 'pending');

INSERT INTO expense_audit_log (expense_id, user_id, action, old_status, new_status, notes, created_at)
SELECT 
    e.id,
    e.approver_id,
    'approved',
    'pending',
    'approved',
    'Expense approved by approver',
    e.approved_at
FROM expenses e
WHERE e.status IN ('approved', 'reimbursed') AND e.approver_id IS NOT NULL;

INSERT INTO expense_audit_log (expense_id, user_id, action, old_status, new_status, notes, created_at)
SELECT 
    e.id,
    (SELECT id FROM users WHERE role = 'admin' LIMIT 1),
    'reimbursed',
    'approved',
    'reimbursed',
    'Expense reimbursed',
    e.reimbursed_at
FROM expenses e
WHERE e.status = 'reimbursed' AND e.reimbursed_at IS NOT NULL;

-- Insert sample notifications
INSERT INTO notifications (user_id, title, message, type, related_expense_id, read, created_at) VALUES
-- Notifications for Maria
((SELECT id FROM users WHERE email = 'employee1@reembolso.com'), 'Expense Approved', 'Your expense "Team Lunch Meeting" has been approved', 'expense_approved', (SELECT id FROM expenses WHERE title = 'Team Lunch Meeting'), true, '2024-01-16 10:00:00'),
((SELECT id FROM users WHERE email = 'employee1@reembolso.com'), 'Expense Reimbursed', 'Your expense "Uber to Client Office" has been reimbursed', 'expense_reimbursed', (SELECT id FROM expenses WHERE title = 'Uber to Client Office'), true, '2024-01-19 14:30:00'),
((SELECT id FROM users WHERE email = 'employee1@reembolso.com'), 'Expense Pending', 'Your expense "Adobe Creative Suite" is pending approval', 'expense_submitted', (SELECT id FROM expenses WHERE title = 'Adobe Creative Suite'), false, '2024-01-20 10:05:00'),

-- Notifications for João
((SELECT id FROM users WHERE email = 'employee2@reembolso.com'), 'Expense Approved', 'Your expense "AWS Cloud Services" has been approved', 'expense_approved', (SELECT id FROM expenses WHERE title = 'AWS Cloud Services'), false, '2024-01-19 09:15:00'),
((SELECT id FROM users WHERE email = 'employee2@reembolso.com'), 'Expense Pending', 'Your expense "Tech Conference Ticket" is pending approval', 'expense_submitted', (SELECT id FROM expenses WHERE title = 'Tech Conference Ticket'), false, '2024-01-22 16:50:00'),

-- Notifications for Ana
((SELECT id FROM users WHERE email = 'employee3@reembolso.com'), 'Expense Approved', 'Your expense "Client Dinner" has been approved', 'expense_approved', (SELECT id FROM expenses WHERE title = 'Client Dinner'), true, '2024-01-18 11:00:00'),
((SELECT id FROM users WHERE email = 'employee3@reembolso.com'), 'Expense Reimbursed', 'Your expense "Hotel Stay - Business Trip" has been reimbursed', 'expense_reimbursed', (SELECT id FROM expenses WHERE title = 'Hotel Stay - Business Trip'), false, '2024-01-22 16:00:00'),

-- Notifications for approver
((SELECT id FROM users WHERE email = 'approver@reembolso.com'), 'New Expense for Approval', 'Maria Silva submitted an expense for approval', 'approval_request', (SELECT id FROM expenses WHERE title = 'Adobe Creative Suite'), false, '2024-01-20 10:05:00'),
((SELECT id FROM users WHERE email = 'approver@reembolso.com'), 'New Expense for Approval', 'João Santos submitted an expense for approval', 'approval_request', (SELECT id FROM expenses WHERE title = 'Tech Conference Ticket'), false, '2024-01-22 16:50:00');

-- Insert sample comments
INSERT INTO expense_comments (expense_id, user_id, comment, is_internal, created_at) VALUES
((SELECT id FROM expenses WHERE title = 'Team Lunch Meeting'), (SELECT id FROM users WHERE email = 'employee1@reembolso.com'), 'This was a productive meeting with our biggest client. We discussed the Q2 marketing campaign.', false, '2024-01-15 14:35:00'),
((SELECT id FROM expenses WHERE title = 'Team Lunch Meeting'), (SELECT id FROM users WHERE email = 'approver@reembolso.com'), 'Approved. Client meetings are essential for business development.', false, '2024-01-16 09:30:00'),
((SELECT id FROM expenses WHERE title = 'Tech Conference Ticket'), (SELECT id FROM users WHERE email = 'employee2@reembolso.com'), 'This conference covers the latest trends in cloud computing and AI, directly relevant to our current projects.', false, '2024-01-22 16:47:00'),
((SELECT id FROM expenses WHERE title = 'Adobe Creative Suite'), (SELECT id FROM users WHERE email = 'employee1@reembolso.com'), 'This subscription is essential for creating marketing materials and client presentations.', false, '2024-01-20 10:02:00');

-- Update system settings with initial values
UPDATE system_settings SET 
    value = '{"auto_approve_limit": 50, "requires_manager": 500, "requires_admin": 1000}',
    updated_at = NOW()
WHERE key = 'approval_thresholds';

UPDATE system_settings SET 
    value = '{"confidence_threshold": 0.8, "retry_attempts": 3, "timeout_seconds": 30}',
    updated_at = NOW()
WHERE key = 'ocr_settings';

UPDATE system_settings SET 
    value = '{"categorization_threshold": 0.7, "retrain_interval_days": 30}',
    updated_at = NOW()
WHERE key = 'ml_settings';
