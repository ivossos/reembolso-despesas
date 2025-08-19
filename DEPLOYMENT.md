# 🚀 Google Cloud Run Deployment Guide

## Overview
This guide will help you deploy the Reembolso de Despesas system to Google Cloud Run on the `wdiscover-ai-2025` project.

## Prerequisites

### 1. Install Google Cloud CLI
```bash
# macOS (using Homebrew)
brew install google-cloud-sdk

# Or download from: https://cloud.google.com/sdk/docs/install
```

### 2. Authenticate and Set Project
```bash
# Login to Google Cloud
gcloud auth login

# Set the project
gcloud config set project wdiscover-ai-2025

# Verify current configuration
gcloud config list
```

### 3. Enable Required APIs
```bash
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable redis.googleapis.com
```

## 🗄️ Database Setup (Cloud SQL)

### 1. Create PostgreSQL Instance
```bash
gcloud sql instances create reembolso-postgres \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --storage-type=SSD \
    --storage-size=10GB \
    --backup-start-time=23:00 \
    --maintenance-window-day=SUN \
    --maintenance-window-hour=00
```

### 2. Create Database and User
```bash
# Create database
gcloud sql databases create reembolso_db \
    --instance=reembolso-postgres

# Create user
gcloud sql users create reembolso_user \
    --instance=reembolso-postgres \
    --password=your-secure-password
```

### 3. Get Connection Details
```bash
# Get instance IP
gcloud sql instances describe reembolso-postgres \
    --format="value(ipAddresses[0].ipAddress)"
```

## 🔴 Redis Setup (Memorystore)

### 1. Create Redis Instance
```bash
gcloud redis instances create reembolso-redis \
    --size=1 \
    --region=us-central1 \
    --redis-version=redis_7_0
```

### 2. Get Connection Details
```bash
# Get instance IP
gcloud redis instances describe reembolso-redis \
    --region=us-central1 \
    --format="value(host)"
```

## 🔐 Service Account Setup

### 1. Create Service Account
```bash
gcloud iam service-accounts create reembolso-service-account \
    --display-name="Reembolso Service Account"
```

### 2. Grant Required Permissions
```bash
# Get the service account email
SA_EMAIL=$(gcloud iam service-accounts list \
    --filter="displayName:Reembolso Service Account" \
    --format="value(email)")

# Grant Cloud Run Admin role
gcloud projects add-iam-policy-binding wdiscover-ai-2025 \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/run.admin"

# Grant Service Account User role
gcloud projects add-iam-policy-binding wdiscover-ai-2025 \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/iam.serviceAccountUser"
```

## 🚀 Deploy Services

### Option 1: Use Deployment Script (Recommended)
```bash
# Make script executable
chmod +x cloud-run-deploy.sh

# Run deployment
./cloud-run-deploy.sh
```

### Option 2: Manual Deployment

#### 1. Deploy Backend
```bash
cd backend
gcloud run deploy reembolso-backend \
    --source . \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --max-instances 10 \
    --set-env-vars NODE_ENV=production,PORT=8080
```

#### 2. Deploy Frontend
```bash
cd frontend
gcloud run deploy reembolso-frontend \
    --source . \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --memory 512Mi \
    --cpu 1 \
    --max-instances 5 \
    --set-env-vars VITE_API_URL=https://your-backend-url/api
```

#### 3. Deploy ML Service
```bash
cd ml-service
gcloud run deploy reembolso-ml \
    --source . \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --max-instances 5
```

## 🔧 Environment Configuration

### 1. Update Environment Variables
After deployment, update the environment variables with your actual values:

```bash
# Backend
gcloud run services update reembolso-backend \
    --region us-central1 \
    --set-env-vars \
    DB_HOST=your-cloud-sql-ip,\
    DB_PASSWORD=your-password,\
    JWT_SECRET=your-secret,\
    ML_SERVICE_URL=https://your-ml-service-url

# Frontend
gcloud run services update reembolso-frontend \
    --region us-central1 \
    --set-env-vars \
    VITE_API_URL=https://your-backend-url/api
```

### 2. Database Migration
```bash
# Get backend service URL
BACKEND_URL=$(gcloud run services describe reembolso-backend \
    --region us-central1 \
    --format="value(status.url)")

# Run database schema (you'll need to implement this)
curl -X POST $BACKEND_URL/api/admin/setup-database
```

## 🌐 Custom Domain (Optional)

### 1. Map Custom Domain
```bash
gcloud run domain-mappings create \
    --service reembolso-frontend \
    --domain yourdomain.com \
    --region us-central1
```

### 2. Update DNS
Add a CNAME record pointing to the Cloud Run service URL.

## 📊 Monitoring and Logs

### 1. View Service Logs
```bash
# Backend logs
gcloud logs read "resource.type=cloud_run_revision AND resource.labels.service_name=reembolso-backend" --limit=50

# Frontend logs
gcloud logs read "resource.type=cloud_run_revision AND resource.labels.service_name=reembolso-frontend" --limit=50
```

### 2. Monitor Performance
```bash
# View service metrics
gcloud run services describe reembolso-backend \
    --region us-central1 \
    --format="value(status.url)"
```

## 🔄 Updating Services

### 1. Update Backend
```bash
cd backend
gcloud run deploy reembolso-backend \
    --source . \
    --region us-central1
```

### 2. Update Frontend
```bash
cd frontend
gcloud run deploy reembolso-frontend \
    --source . \
    --region us-central1
```

## 🧹 Cleanup (if needed)

### 1. Delete Services
```bash
gcloud run services delete reembolso-backend --region us-central1
gcloud run services delete reembolso-frontend --region us-central1
gcloud run services delete reembolso-ml --region us-central1
```

### 2. Delete Database
```bash
gcloud sql instances delete reembolso-postgres
```

### 3. Delete Redis
```bash
gcloud redis instances delete reembolso-redis --region us-central1
```

## 🚨 Important Notes

1. **Security**: Never commit sensitive information like passwords or API keys
2. **Scaling**: Cloud Run automatically scales to zero when not in use
3. **Costs**: Monitor your usage to avoid unexpected charges
4. **Backup**: Ensure your database has proper backup policies
5. **Monitoring**: Set up alerts for errors and performance issues

## 📞 Support

If you encounter issues:
1. Check the Cloud Run logs
2. Verify environment variables are set correctly
3. Ensure all required APIs are enabled
4. Check service account permissions

## 🎉 Success!

After successful deployment, you'll have:
- **Frontend**: Accessible via Cloud Run URL
- **Backend API**: RESTful API endpoints
- **ML Service**: Machine learning capabilities
- **Database**: PostgreSQL with your data
- **Cache**: Redis for performance
- **Auto-scaling**: Based on demand
- **HTTPS**: Secure by default
