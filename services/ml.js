const axios = require('axios');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

// ML Service URL
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5000';

// Category mapping for rule-based classification
const categoryRules = {
  meals: [
    'restaurant', 'food', 'lunch', 'dinner', 'breakfast', 'cafe', 'coffee',
    'pizza', 'burger', 'sushi', 'delivery', 'takeout', 'meal', 'dining'
  ],
  transportation: [
    'uber', 'lyft', 'taxi', 'bus', 'train', 'subway', 'metro', 'airline',
    'flight', 'car rental', 'parking', 'toll', 'gas', 'fuel', 'mileage'
  ],
  accommodation: [
    'hotel', 'motel', 'inn', 'resort', 'airbnb', 'booking', 'lodging',
    'accommodation', 'stay', 'room', 'suite'
  ],
  office_supplies: [
    'staples', 'office', 'supplies', 'paper', 'pen', 'pencil', 'notebook',
    'folder', 'binder', 'printer', 'ink', 'toner', 'desk', 'chair'
  ],
  software: [
    'software', 'app', 'subscription', 'license', 'saas', 'cloud', 'microsoft',
    'adobe', 'google', 'zoom', 'slack', 'github', 'aws', 'digital'
  ],
  training: [
    'course', 'training', 'workshop', 'seminar', 'conference', 'education',
    'learning', 'certification', 'udemy', 'coursera', 'book', 'tutorial'
  ],
  marketing: [
    'advertising', 'marketing', 'promotion', 'social media', 'facebook',
    'google ads', 'linkedin', 'campaign', 'branding', 'design'
  ],
  travel: [
    'travel', 'trip', 'business trip', 'visa', 'passport', 'insurance',
    'luggage', 'baggage', 'airport', 'terminal'
  ]
};

// Rule-based categorization
const categorizeByRules = (expenseData) => {
  const { title = '', description = '', vendor = '' } = expenseData;
  const text = `${title} ${description} ${vendor}`.toLowerCase();
  
  const scores = {};
  
  // Calculate scores for each category
  Object.keys(categoryRules).forEach(category => {
    const keywords = categoryRules[category];
    let score = 0;
    
    keywords.forEach(keyword => {
      if (text.includes(keyword)) {
        score += 1;
      }
    });
    
    // Normalize score by number of keywords
    scores[category] = score / keywords.length;
  });
  
  // Find category with highest score
  const bestCategory = Object.keys(scores).reduce((a, b) => 
    scores[a] > scores[b] ? a : b
  );
  
  const confidence = scores[bestCategory];
  
  return {
    category: confidence > 0 ? bestCategory : 'other',
    confidence,
    method: 'rule-based',
    scores
  };
};

// Amount-based categorization hints
const categorizeByAmount = (amount) => {
  const hints = {};
  
  if (amount < 20) {
    hints.meals = 0.3;
    hints.office_supplies = 0.2;
  } else if (amount < 100) {
    hints.meals = 0.4;
    hints.transportation = 0.3;
    hints.office_supplies = 0.1;
  } else if (amount < 500) {
    hints.accommodation = 0.3;
    hints.software = 0.2;
    hints.training = 0.2;
  } else {
    hints.travel = 0.4;
    hints.accommodation = 0.3;
    hints.training = 0.2;
  }
  
  return hints;
};

// Call ML service for categorization
const callMLService = async (expenseData) => {
  try {
    const response = await axios.post(`${ML_SERVICE_URL}/categorize`, {
      title: expenseData.title || '',
      description: expenseData.description || '',
      vendor: expenseData.vendor || '',
      amount: expenseData.amount || 0
    }, {
      timeout: 10000, // 10 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return {
      category: response.data.category,
      confidence: response.data.confidence,
      method: 'machine-learning',
      scores: response.data.scores || {}
    };
  } catch (error) {
    logger.error('ML service call failed:', error.message);
    
    // Return null to fall back to rule-based
    return null;
  }
};

// Main categorization function
const categorizeMachine = async (expenseId, expenseData) => {
  try {
    logger.info(`Starting ML categorization for expense ${expenseId}`);

    // Try ML service first
    let mlResult = await callMLService(expenseData);
    
    // Fall back to rule-based if ML service fails
    if (!mlResult) {
      logger.info(`ML service unavailable, using rule-based categorization for expense ${expenseId}`);
      mlResult = categorizeByRules(expenseData);
    }

    // Get amount-based hints
    const amountHints = categorizeByAmount(expenseData.amount || 0);
    
    // Combine ML/rule-based result with amount hints
    const combinedScores = { ...mlResult.scores };
    Object.keys(amountHints).forEach(category => {
      if (combinedScores[category]) {
        combinedScores[category] = (combinedScores[category] + amountHints[category]) / 2;
      } else {
        combinedScores[category] = amountHints[category] * 0.5;
      }
    });

    // Find best category from combined scores
    const bestCategory = Object.keys(combinedScores).reduce((a, b) => 
      combinedScores[a] > combinedScores[b] ? a : b
    );

    const finalConfidence = combinedScores[bestCategory] || mlResult.confidence;
    const finalCategory = finalConfidence > 0.3 ? bestCategory : mlResult.category;

    // Update expense with ML suggestion
    await query(
      `UPDATE expenses SET 
         ml_suggested_category = $1,
         ml_confidence = $2,
         updated_at = NOW()
       WHERE id = $3`,
      [finalCategory, finalConfidence, expenseId]
    );

    // Log categorization
    await query(
      `INSERT INTO expense_audit_log (expense_id, user_id, action, notes, metadata)
       SELECT $1, user_id, $2, $3, $4 FROM expenses WHERE id = $1`,
      [
        expenseId,
        'ml_categorized',
        `ML categorization suggested: ${finalCategory} (${(finalConfidence * 100).toFixed(1)}% confidence)`,
        JSON.stringify({
          suggested_category: finalCategory,
          confidence: finalConfidence,
          method: mlResult.method,
          all_scores: combinedScores
        })
      ]
    );

    logger.info(`ML categorization completed for expense ${expenseId}: ${finalCategory} (${finalConfidence})`);

    return {
      success: true,
      category: finalCategory,
      confidence: finalConfidence,
      method: mlResult.method,
      scores: combinedScores
    };

  } catch (error) {
    logger.error(`ML categorization failed for expense ${expenseId}:`, error);

    // Log the failure
    await query(
      `INSERT INTO expense_audit_log (expense_id, user_id, action, notes, metadata)
       SELECT $1, user_id, $2, $3, $4 FROM expenses WHERE id = $1`,
      [
        expenseId,
        'ml_categorization_failed',
        `ML categorization failed: ${error.message}`,
        JSON.stringify({ error: error.message })
      ]
    );

    throw error;
  }
};

// Train ML model with new data (called periodically)
const trainMLModel = async () => {
  try {
    logger.info('Starting ML model training');

    // Get training data from approved expenses
    const trainingData = await query(
      `SELECT title, description, vendor, amount, category
       FROM expenses 
       WHERE status IN ('approved', 'reimbursed')
       AND created_at > NOW() - INTERVAL '6 months'
       ORDER BY created_at DESC
       LIMIT 1000`
    );

    if (trainingData.rows.length < 50) {
      logger.info('Insufficient training data, skipping ML model training');
      return;
    }

    // Send training data to ML service
    const response = await axios.post(`${ML_SERVICE_URL}/train`, {
      training_data: trainingData.rows
    }, {
      timeout: 60000, // 1 minute timeout for training
      headers: {
        'Content-Type': 'application/json'
      }
    });

    logger.info('ML model training completed:', response.data);

    // Update system settings with training info
    await query(
      `INSERT INTO system_settings (key, value, description, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_at = EXCLUDED.updated_at`,
      [
        'ml_last_training',
        JSON.stringify({
          timestamp: new Date().toISOString(),
          training_samples: trainingData.rows.length,
          model_version: response.data.model_version || '1.0',
          accuracy: response.data.accuracy || null
        }),
        'Last ML model training information'
      ]
    );

    return response.data;

  } catch (error) {
    logger.error('ML model training failed:', error);
    throw error;
  }
};

// Get categorization statistics
const getCategorizationStats = async () => {
  try {
    const stats = await query(
      `SELECT 
         COUNT(*) as total_expenses,
         COUNT(CASE WHEN ml_suggested_category IS NOT NULL THEN 1 END) as ml_categorized,
         COUNT(CASE WHEN ml_suggested_category = category THEN 1 END) as ml_correct,
         AVG(ml_confidence) as avg_confidence,
         category,
         COUNT(*) as category_count
       FROM expenses 
       WHERE created_at > NOW() - INTERVAL '30 days'
       GROUP BY category
       ORDER BY category_count DESC`
    );

    const overallStats = await query(
      `SELECT 
         COUNT(*) as total_expenses,
         COUNT(CASE WHEN ml_suggested_category IS NOT NULL THEN 1 END) as ml_categorized,
         COUNT(CASE WHEN ml_suggested_category = category THEN 1 END) as ml_correct,
         AVG(ml_confidence) as avg_confidence
       FROM expenses 
       WHERE created_at > NOW() - INTERVAL '30 days'`
    );

    return {
      overall: overallStats.rows[0],
      by_category: stats.rows
    };

  } catch (error) {
    logger.error('Failed to get categorization stats:', error);
    throw error;
  }
};

// Feedback learning - update model based on user corrections
const feedbackLearning = async (expenseId, userCorrectedCategory) => {
  try {
    // Get expense data
    const expenseResult = await query(
      `SELECT title, description, vendor, amount, ml_suggested_category, ml_confidence
       FROM expenses WHERE id = $1`,
      [expenseId]
    );

    if (expenseResult.rows.length === 0) {
      throw new Error('Expense not found');
    }

    const expense = expenseResult.rows[0];

    // Only process if ML had suggested a different category
    if (expense.ml_suggested_category && 
        expense.ml_suggested_category !== userCorrectedCategory) {
      
      // Send feedback to ML service
      await axios.post(`${ML_SERVICE_URL}/feedback`, {
        expense_data: {
          title: expense.title,
          description: expense.description,
          vendor: expense.vendor,
          amount: expense.amount
        },
        predicted_category: expense.ml_suggested_category,
        actual_category: userCorrectedCategory,
        confidence: expense.ml_confidence
      }, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      // Log feedback
      await query(
        `INSERT INTO expense_audit_log (expense_id, user_id, action, notes, metadata)
         SELECT $1, user_id, $2, $3, $4 FROM expenses WHERE id = $1`,
        [
          expenseId,
          'ml_feedback',
          `User corrected ML suggestion from ${expense.ml_suggested_category} to ${userCorrectedCategory}`,
          JSON.stringify({
            ml_suggested: expense.ml_suggested_category,
            user_corrected: userCorrectedCategory,
            ml_confidence: expense.ml_confidence
          })
        ]
      );

      logger.info(`ML feedback recorded for expense ${expenseId}`);
    }

  } catch (error) {
    logger.error(`ML feedback failed for expense ${expenseId}:`, error);
    // Don't throw error as this is not critical
  }
};

module.exports = {
  categorizeMachine,
  categorizeByRules,
  trainMLModel,
  getCategorizationStats,
  feedbackLearning
};
