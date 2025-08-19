#!/bin/bash

# Google Cloud Run Deployment Script for Reembolso de Despesas
# Project: wdiscover-ai-2025

set -e

# Configuration
PROJECT_ID="wdiscover-ai-2025"
REGION="us-central1"
BACKEND_SERVICE="reembolso-backend"
FRONTEND_SERVICE="reembolso-frontend"
ML_SERVICE="reembolso-ml"

echo "🚀 Deploying Reembolso de Despesas to Google Cloud Run"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please install it first."
    exit 1
fi

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "🔐 Please authenticate with gcloud first:"
    echo "gcloud auth login"
    exit 1
fi

# Set the project
echo "📋 Setting project to $PROJECT_ID"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable redis.googleapis.com

# Build and deploy backend
echo "🏗️ Building and deploying backend..."
cd backend
gcloud run deploy $BACKEND_SERVICE \
    --source . \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --memory 1Gi \
    --cpu 1 \
    --max-instances 10 \
    --set-env-vars NODE_ENV=production

# Get backend URL
BACKEND_URL=$(gcloud run services describe $BACKEND_SERVICE --region $REGION --format="value(status.url)")
echo "✅ Backend deployed at: $BACKEND_URL"

# Build and deploy frontend
echo "🏗️ Building and deploying frontend..."
cd ../frontend
gcloud run deploy $FRONTEND_SERVICE \
    --source . \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --memory 512Mi \
    --cpu 1 \
    --max-instances 5 \
    --set-env-vars VITE_API_URL=$BACKEND_URL/api

# Get frontend URL
FRONTEND_URL=$(gcloud run services describe $FRONTEND_SERVICE --region $REGION --format="value(status.url)")
echo "✅ Frontend deployed at: $FRONTEND_URL"

# Build and deploy ML service
echo "🏗️ Building and deploying ML service..."
cd ../ml-service
gcloud run deploy $ML_SERVICE \
    --source . \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --max-instances 5

# Get ML service URL
ML_URL=$(gcloud run services describe $ML_SERVICE --region $REGION --format="value(status.url)")
echo "✅ ML service deployed at: $ML_URL"

echo ""
echo "🎉 Deployment completed successfully!"
echo ""
echo "📱 Frontend: $FRONTEND_URL"
echo "🔧 Backend: $BACKEND_URL"
echo "🤖 ML Service: $ML_URL"
echo ""
echo "⚠️  Note: You'll need to set up a PostgreSQL database and Redis instance separately."
echo "   Consider using Cloud SQL for PostgreSQL and Memorystore for Redis."
echo ""
echo "🔗 To view your services:"
echo "   gcloud run services list --region $REGION"
