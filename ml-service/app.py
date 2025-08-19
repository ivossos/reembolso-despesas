#!/usr/bin/env python3
"""
ML Service for Reembolso de Despesas
Provides expense categorization using scikit-learn
"""

import os
import json
import pickle
import logging
from datetime import datetime
from typing import Dict, List, Optional

import pandas as pd
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
from sklearn.pipeline import Pipeline
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
from nltk.stem import PorterStemmer
import joblib
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Download required NLTK data
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt')

try:
    nltk.data.find('corpora/stopwords')
except LookupError:
    nltk.download('stopwords')

# Initialize text processing components
stemmer = PorterStemmer()
stop_words = set(stopwords.words('english'))

# Model storage path
MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models')
os.makedirs(MODEL_PATH, exist_ok=True)

# Category mapping
CATEGORIES = [
    'meals', 'transportation', 'accommodation', 'office_supplies',
    'software', 'training', 'marketing', 'travel', 'other'
]

class ExpenseCategorizer:
    """Machine learning model for expense categorization"""
    
    def __init__(self):
        self.model = None
        self.vectorizer = None
        self.pipeline = None
        self.model_version = "1.0"
        self.last_trained = None
        self.accuracy = None
        
        # Load existing model if available
        self.load_model()
    
    def preprocess_text(self, text: str) -> str:
        """Preprocess text for feature extraction"""
        if not text:
            return ""
        
        # Convert to lowercase
        text = text.lower()
        
        # Tokenize
        tokens = word_tokenize(text)
        
        # Remove stopwords and stem
        tokens = [
            stemmer.stem(token) 
            for token in tokens 
            if token.isalnum() and token not in stop_words
        ]
        
        return " ".join(tokens)
    
    def prepare_features(self, data: List[Dict]) -> pd.DataFrame:
        """Prepare features from expense data"""
        df = pd.DataFrame(data)
        
        # Combine text features
        df['combined_text'] = (
            df.get('title', '').fillna('') + ' ' +
            df.get('description', '').fillna('') + ' ' +
            df.get('vendor', '').fillna('')
        )
        
        # Preprocess text
        df['processed_text'] = df['combined_text'].apply(self.preprocess_text)
        
        # Add amount-based features
        df['amount'] = pd.to_numeric(df.get('amount', 0), errors='coerce').fillna(0)
        df['amount_log'] = np.log1p(df['amount'])
        df['amount_category'] = pd.cut(
            df['amount'], 
            bins=[0, 20, 100, 500, float('inf')], 
            labels=['low', 'medium', 'high', 'very_high']
        )
        
        return df
    
    def train(self, training_data: List[Dict]) -> Dict:
        """Train the categorization model"""
        logger.info(f"Training model with {len(training_data)} samples")
        
        # Prepare data
        df = self.prepare_features(training_data)
        
        if df.empty or 'category' not in df.columns:
            raise ValueError("No training data or missing category labels")
        
        # Filter valid categories
        df = df[df['category'].isin(CATEGORIES)]
        
        if len(df) < 10:
            raise ValueError("Insufficient training data (minimum 10 samples required)")
        
        # Prepare features and labels
        X = df[['processed_text', 'amount_log']]
        y = df['category']
        
        # Create pipeline
        self.pipeline = Pipeline([
            ('features', TfidfVectorizer(
                max_features=1000,
                ngram_range=(1, 2),
                min_df=2,
                max_df=0.8
            )),
            ('classifier', RandomForestClassifier(
                n_estimators=100,
                random_state=42,
                class_weight='balanced'
            ))
        ])
        
        # Train-test split
        X_train, X_test, y_train, y_test = train_test_split(
            X['processed_text'], y, 
            test_size=0.2, 
            random_state=42,
            stratify=y if len(y.unique()) > 1 else None
        )
        
        # Train model
        self.pipeline.fit(X_train, y_train)
        
        # Evaluate
        y_pred = self.pipeline.predict(X_test)
        self.accuracy = accuracy_score(y_test, y_pred)
        
        # Update metadata
        self.last_trained = datetime.now().isoformat()
        self.model_version = f"1.{len(training_data)}"
        
        # Save model
        self.save_model()
        
        logger.info(f"Model trained successfully. Accuracy: {self.accuracy:.3f}")
        
        return {
            'model_version': self.model_version,
            'accuracy': self.accuracy,
            'training_samples': len(training_data),
            'test_samples': len(X_test),
            'last_trained': self.last_trained,
            'classification_report': classification_report(y_test, y_pred, output_dict=True)
        }
    
    def predict(self, expense_data: Dict) -> Dict:
        """Predict category for a single expense"""
        if not self.pipeline:
            # Use rule-based fallback
            return self._rule_based_prediction(expense_data)
        
        # Prepare features
        df = self.prepare_features([expense_data])
        
        if df.empty:
            return {'category': 'other', 'confidence': 0.0, 'scores': {}}
        
        # Get prediction and probabilities
        text_features = df['processed_text'].iloc[0]
        
        try:
            prediction = self.pipeline.predict([text_features])[0]
            probabilities = self.pipeline.predict_proba([text_features])[0]
            
            # Create scores dictionary
            classes = self.pipeline.classes_
            scores = dict(zip(classes, probabilities))
            
            # Get confidence (max probability)
            confidence = max(probabilities)
            
            return {
                'category': prediction,
                'confidence': float(confidence),
                'scores': {k: float(v) for k, v in scores.items()}
            }
            
        except Exception as e:
            logger.error(f"Prediction error: {e}")
            return self._rule_based_prediction(expense_data)
    
    def _rule_based_prediction(self, expense_data: Dict) -> Dict:
        """Fallback rule-based prediction"""
        text = (
            str(expense_data.get('title', '')) + ' ' +
            str(expense_data.get('description', '')) + ' ' +
            str(expense_data.get('vendor', ''))
        ).lower()
        
        amount = float(expense_data.get('amount', 0))
        
        # Rule-based scoring
        scores = {}
        
        # Keywords for each category
        rules = {
            'meals': ['restaurant', 'food', 'lunch', 'dinner', 'cafe', 'pizza'],
            'transportation': ['uber', 'taxi', 'bus', 'flight', 'gas', 'parking'],
            'accommodation': ['hotel', 'airbnb', 'booking', 'room'],
            'office_supplies': ['office', 'supplies', 'paper', 'pen', 'printer'],
            'software': ['software', 'app', 'subscription', 'license'],
            'training': ['course', 'training', 'workshop', 'conference'],
            'marketing': ['advertising', 'marketing', 'promotion'],
            'travel': ['travel', 'trip', 'visa', 'luggage']
        }
        
        for category, keywords in rules.items():
            score = sum(1 for keyword in keywords if keyword in text)
            scores[category] = score / len(keywords)
        
        # Amount-based adjustments
        if amount < 20:
            scores['meals'] = scores.get('meals', 0) + 0.2
        elif amount > 500:
            scores['travel'] = scores.get('travel', 0) + 0.3
            scores['accommodation'] = scores.get('accommodation', 0) + 0.2
        
        # Find best category
        if scores:
            best_category = max(scores.keys(), key=lambda k: scores[k])
            confidence = scores[best_category]
        else:
            best_category = 'other'
            confidence = 0.1
            scores['other'] = 0.1
        
        return {
            'category': best_category,
            'confidence': confidence,
            'scores': scores
        }
    
    def save_model(self):
        """Save the trained model to disk"""
        if self.pipeline:
            model_file = os.path.join(MODEL_PATH, 'expense_categorizer.pkl')
            metadata_file = os.path.join(MODEL_PATH, 'model_metadata.json')
            
            # Save model
            joblib.dump(self.pipeline, model_file)
            
            # Save metadata
            metadata = {
                'model_version': self.model_version,
                'last_trained': self.last_trained,
                'accuracy': self.accuracy,
                'categories': CATEGORIES
            }
            
            with open(metadata_file, 'w') as f:
                json.dump(metadata, f, indent=2)
            
            logger.info(f"Model saved to {model_file}")
    
    def load_model(self):
        """Load existing model from disk"""
        model_file = os.path.join(MODEL_PATH, 'expense_categorizer.pkl')
        metadata_file = os.path.join(MODEL_PATH, 'model_metadata.json')
        
        try:
            if os.path.exists(model_file) and os.path.exists(metadata_file):
                # Load model
                self.pipeline = joblib.load(model_file)
                
                # Load metadata
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                
                self.model_version = metadata.get('model_version', '1.0')
                self.last_trained = metadata.get('last_trained')
                self.accuracy = metadata.get('accuracy')
                
                logger.info(f"Model loaded successfully. Version: {self.model_version}")
            else:
                logger.info("No existing model found. Will use rule-based predictions.")
                
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            self.pipeline = None

# Initialize categorizer
categorizer = ExpenseCategorizer()

# API Routes
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'ml-categorization',
        'version': categorizer.model_version,
        'last_trained': categorizer.last_trained,
        'accuracy': categorizer.accuracy
    })

@app.route('/categorize', methods=['POST'])
def categorize_expense():
    """Categorize a single expense"""
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        # Predict category
        result = categorizer.predict(data)
        
        return jsonify(result)
        
    except Exception as e:
        logger.error(f"Categorization error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/train', methods=['POST'])
def train_model():
    """Train the model with new data"""
    try:
        data = request.get_json()
        training_data = data.get('training_data', [])
        
        if not training_data:
            return jsonify({'error': 'No training data provided'}), 400
        
        # Train model
        result = categorizer.train(training_data)
        
        return jsonify({
            'status': 'success',
            'message': 'Model trained successfully',
            **result
        })
        
    except Exception as e:
        logger.error(f"Training error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/feedback', methods=['POST'])
def process_feedback():
    """Process user feedback for model improvement"""
    try:
        data = request.get_json()
        
        expense_data = data.get('expense_data', {})
        predicted_category = data.get('predicted_category')
        actual_category = data.get('actual_category')
        confidence = data.get('confidence', 0.0)
        
        # Log feedback for future training
        feedback_file = os.path.join(MODEL_PATH, 'feedback.jsonl')
        
        feedback_entry = {
            'timestamp': datetime.now().isoformat(),
            'expense_data': expense_data,
            'predicted_category': predicted_category,
            'actual_category': actual_category,
            'confidence': confidence
        }
        
        with open(feedback_file, 'a') as f:
            f.write(json.dumps(feedback_entry) + '\n')
        
        logger.info(f"Feedback recorded: {predicted_category} -> {actual_category}")
        
        return jsonify({
            'status': 'success',
            'message': 'Feedback recorded successfully'
        })
        
    except Exception as e:
        logger.error(f"Feedback processing error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/stats', methods=['GET'])
def get_model_stats():
    """Get model statistics"""
    try:
        feedback_file = os.path.join(MODEL_PATH, 'feedback.jsonl')
        feedback_count = 0
        
        if os.path.exists(feedback_file):
            with open(feedback_file, 'r') as f:
                feedback_count = sum(1 for line in f)
        
        return jsonify({
            'model_version': categorizer.model_version,
            'last_trained': categorizer.last_trained,
            'accuracy': categorizer.accuracy,
            'feedback_count': feedback_count,
            'categories': CATEGORIES,
            'has_trained_model': categorizer.pipeline is not None
        })
        
    except Exception as e:
        logger.error(f"Stats error: {e}")
        return jsonify({'error': str(e)}), 500

@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    debug = os.environ.get('DEBUG', 'False').lower() == 'true'
    
    logger.info(f"Starting ML service on port {port}")
    app.run(host='0.0.0.0', port=port, debug=debug)
