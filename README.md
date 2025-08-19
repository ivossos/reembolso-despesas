# Reembolso de Despesas (Expense Reimbursement System)

A comprehensive digital platform designed to streamline employee expense reimbursements with OCR receipt processing, ML-powered categorization, and multi-step approval workflows.

## 🚀 Features

### Core Functionality
- **Employee Expense Submission**: Easy form-based expense entry with receipt upload
- **OCR Processing**: Automatic data extraction from receipt images using AWS Textract
- **ML Categorization**: Intelligent expense categorization using scikit-learn
- **Approval Workflow**: Multi-step approval process (submit → approve/reject → reimburse)
- **Real-time Notifications**: In-app and email notifications for all stakeholders

### Security & Authentication
- **JWT-based Authentication**: Secure token-based authentication system
- **Role-based Access Control**: Employee, Approver, and Admin roles
- **Two-Factor Authentication**: Optional 2FA for enhanced security
- **Password Reset**: Secure email-based password recovery

### Advanced Features
- **Dashboard Analytics**: Comprehensive expense tracking and reporting
- **Audit Logging**: Complete audit trail of all expense actions
- **File Management**: Secure receipt storage with AWS S3
- **Responsive Design**: Mobile-first Material-UI interface
- **Export Functionality**: CSV export for expense reports

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Web     │    │   Node.js API   │    │  PostgreSQL DB  │
│   Frontend      │◄──►│    Backend      │◄──►│    Database     │
│  (Port 3001)    │    │  (Port 3000)    │    │  (Port 5432)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                         │
                              ▼                         ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Python ML     │    │   AWS Textract  │    │   Redis Cache   │
│   Service       │    │   OCR Service   │    │  (Port 6379)    │
│  (Port 5000)    │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- **Docker & Docker Compose**: For containerized deployment
- **Node.js 18+**: For local development
- **Python 3.11+**: For ML service
- **PostgreSQL 15+**: Database
- **Redis 7+**: Caching and sessions
- **AWS Account**: For S3 storage and Textract OCR

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone <repository-url>
cd reembolso-de-despesas
```

### 2. Environment Configuration
```bash
# Copy environment template
cp env.example .env

# Edit .env file with your configuration
nano .env
```

### 3. Start with Docker Compose
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

### 4. Access the Application
- **Frontend**: http://localhost:3001
- **Backend API**: http://localhost:3000
- **ML Service**: http://localhost:5000

### 5. Default Login Credentials
```
Admin User:
- Email: admin@reembolso.com
- Password: admin123

Employee User:
- Email: employee1@reembolso.com
- Password: employee123

Approver User:
- Email: approver@reembolso.com
- Password: approver123
```

## 🛠️ Development Setup

### Backend Development
```bash
# Install dependencies
npm install

# Set up environment variables
cp env.example .env

# Start PostgreSQL and Redis
docker-compose up -d db redis

# Run database migrations
npm run migrate

# Seed sample data
npm run seed

# Start development server
npm run dev
```

### Frontend Development
```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

### ML Service Development
```bash
cd ml-service

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start ML service
python app.py
```

## 📊 Database Schema

The system uses PostgreSQL with the following main entities:

- **users**: User accounts with roles and authentication
- **expenses**: Expense records with status tracking
- **expense_audit_log**: Complete audit trail
- **expense_comments**: Comments and notes
- **notifications**: User notifications
- **system_settings**: Configurable system parameters

## 🔧 Configuration

### Environment Variables

#### Backend Configuration
```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/reembolso_db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=reembolso_db
DB_USER=username
DB_PASSWORD=password

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=24h

# AWS Services
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=your-s3-bucket

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@company.com
SMTP_PASSWORD=your-email-password
```

### System Settings
The application includes configurable system settings accessible via the admin panel:

- **Approval Thresholds**: Auto-approval limits by amount
- **OCR Settings**: Textract processing parameters
- **ML Settings**: Machine learning model configuration
- **Email Templates**: Customizable notification templates

## 🧪 Testing

### Backend Tests
```bash
npm test
```

### Frontend Tests
```bash
cd frontend
npm test
```

### ML Service Tests
```bash
cd ml-service
python -m pytest tests/
```

## 📈 Monitoring & Logging

### Application Logs
- Backend logs: `logs/combined.log`, `logs/error.log`
- ML service logs: Console output with structured logging
- Database logs: PostgreSQL container logs

### Health Checks
- Backend: `GET /health`
- ML Service: `GET /health`
- Database: Built-in PostgreSQL health checks

### Performance Monitoring
- API response times logged
- Database query performance tracking
- OCR processing time monitoring

## 🔒 Security Features

### Authentication & Authorization
- JWT token-based authentication
- Role-based access control (RBAC)
- Optional two-factor authentication
- Secure password hashing with bcrypt

### Data Protection
- TLS encryption for all communications
- AES-256 encryption for file storage
- SQL injection prevention
- XSS protection with helmet.js
- CORS configuration

### Audit & Compliance
- Complete audit trail of all actions
- Immutable expense logs
- User activity tracking
- GDPR-compliant data handling

## 🚀 Deployment

### Production Deployment
```bash
# Build production images
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Environment-Specific Configurations
- **Development**: Full logging, hot-reload enabled
- **Staging**: Production-like with debug features
- **Production**: Optimized builds, minimal logging

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/forgot-password` - Password reset request
- `POST /api/auth/reset-password` - Password reset confirmation

### Expense Endpoints
- `GET /api/expenses` - List user expenses
- `POST /api/expenses` - Create new expense
- `GET /api/expenses/:id` - Get expense details
- `PUT /api/expenses/:id` - Update expense
- `DELETE /api/expenses/:id` - Delete expense
- `POST /api/expenses/:id/submit` - Submit for approval

### Admin Endpoints
- `GET /api/admin/expenses/pending` - List pending approvals
- `POST /api/admin/expenses/:id/approve` - Approve expense
- `POST /api/admin/expenses/:id/reject` - Reject expense
- `GET /api/admin/users` - List all users
- `GET /api/admin/stats` - System statistics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation wiki

## 🎯 Roadmap

### Version 1.1
- [ ] Mobile app (React Native)
- [ ] Advanced reporting dashboard
- [ ] Bulk expense import
- [ ] Integration with accounting systems

### Version 1.2
- [ ] Multi-currency support
- [ ] Custom approval workflows
- [ ] SSO integration
- [ ] Advanced ML features

### Version 1.3
- [ ] Offline mobile support
- [ ] Real-time collaboration
- [ ] Advanced analytics
- [ ] API marketplace integration
