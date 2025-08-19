const AWS = require('aws-sdk');
const fs = require('fs');
const path = require('path');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');

// Check if AWS is configured
const isAWSConfigured = process.env.AWS_ACCESS_KEY_ID && 
                        process.env.AWS_ACCESS_KEY_ID !== 'your-aws-access-key' &&
                        process.env.AWS_SECRET_ACCESS_KEY && 
                        process.env.AWS_SECRET_ACCESS_KEY !== 'your-aws-secret-key' &&
                        process.env.S3_BUCKET_NAME;

// Configure AWS only if credentials are provided
if (isAWSConfigured) {
  AWS.config.update({
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  });
}

const s3 = isAWSConfigured ? new AWS.S3() : null;
const textract = isAWSConfigured ? new AWS.Textract() : null;

// Upload file to S3 or local storage
const uploadToS3 = async (buffer, key, contentType) => {
  try {
    if (isAWSConfigured) {
      // Use AWS S3
      const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: 'AES256',
        Metadata: {
          uploadedAt: new Date().toISOString()
        }
      };

      const result = await s3.upload(params).promise();
      logger.info(`File uploaded to S3: ${key}`);
      return result.Location;
    } else {
      // Local development mode - save to local storage
      const localDir = path.join(__dirname, '../uploads');
      if (!fs.existsSync(localDir)) {
        fs.mkdirSync(localDir, { recursive: true });
      }
      
      const localPath = path.join(localDir, key);
      const localDirPath = path.dirname(localPath);
      if (!fs.existsSync(localDirPath)) {
        fs.mkdirSync(localDirPath, { recursive: true });
      }
      
      fs.writeFileSync(localPath, buffer);
      logger.info(`File saved locally: ${localPath}`);
      
      // Return a local file URL for development
      return `file://${localPath}`;
    }
  } catch (error) {
    logger.error('File upload failed:', error);
    throw new Error('Failed to upload file');
  }
};

// Get signed URL for file access
const getSignedUrl = (key, expiresIn = 3600) => {
  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Expires: expiresIn
    };

    return s3.getSignedUrl('getObject', params);
  } catch (error) {
    logger.error('Failed to generate signed URL:', error);
    throw new Error('Failed to generate file access URL');
  }
};

// Delete file from S3
const deleteFromS3 = async (key) => {
  try {
    const params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key
    };

    await s3.deleteObject(params).promise();
    logger.info(`File deleted from S3: ${key}`);
  } catch (error) {
    logger.error('S3 delete failed:', error);
    throw new Error('Failed to delete file from S3');
  }
};

// Extract text from image using Textract or local processing
const extractTextFromImage = async (s3Key) => {
  try {
    if (isAWSConfigured && textract) {
      // Use AWS Textract
      const params = {
        Document: {
          S3Object: {
            Bucket: process.env.S3_BUCKET_NAME,
            Name: s3Key
          }
        }
      };

      const result = await textract.detectDocumentText(params).promise();
      
      // Extract text blocks
      const textBlocks = result.Blocks
        .filter(block => block.BlockType === 'LINE')
        .map(block => block.Text)
        .join('\n');

      // Extract key-value pairs
      const keyValuePairs = {};
      const kvBlocks = result.Blocks.filter(block => block.BlockType === 'KEY_VALUE_SET');
      
      kvBlocks.forEach(block => {
        if (block.EntityTypes && block.EntityTypes.includes('KEY')) {
          const keyText = extractTextFromBlock(block, result.Blocks);
          const valueBlocks = block.Relationships
            ?.find(rel => rel.Type === 'VALUE')
            ?.Ids?.map(id => result.Blocks.find(b => b.Id === id))
            .filter(Boolean) || [];
          
          const valueText = valueBlocks
            .map(vBlock => extractTextFromBlock(vBlock, result.Blocks))
            .join(' ');

          if (keyText && valueText) {
            keyValuePairs[keyText.toLowerCase()] = valueText;
          }
        }
      });

      return {
        fullText: textBlocks,
        keyValuePairs,
        confidence: calculateAverageConfidence(result.Blocks)
      };
    } else {
      // Local development mode - simulate OCR processing
      logger.info('Running in local mode - simulating OCR processing');
      
      // For local testing, return a simulated OCR result
      return {
        fullText: "SAMPLE RECEIPT TEXT - OCR PROCESSING SIMULATED",
        keyValuePairs: {
          "vendor": "Sample Vendor",
          "amount": "25.00",
          "date": "2025-01-20"
        },
        confidence: 0.85
      };
    }
  } catch (error) {
    logger.error('Text extraction failed:', error);
    throw new Error('Failed to extract text from receipt');
  }
};

// Helper function to extract text from a block
const extractTextFromBlock = (block, allBlocks) => {
  if (block.Text) return block.Text;
  
  if (block.Relationships) {
    const childRelation = block.Relationships.find(rel => rel.Type === 'CHILD');
    if (childRelation) {
      return childRelation.Ids
        .map(id => allBlocks.find(b => b.Id === id))
        .filter(childBlock => childBlock && childBlock.Text)
        .map(childBlock => childBlock.Text)
        .join(' ');
    }
  }
  
  return '';
};

// Calculate average confidence score
const calculateAverageConfidence = (blocks) => {
  const textBlocks = blocks.filter(block => 
    block.BlockType === 'LINE' && block.Confidence !== undefined
  );
  
  if (textBlocks.length === 0) return 0;
  
  const totalConfidence = textBlocks.reduce((sum, block) => sum + block.Confidence, 0);
  return totalConfidence / textBlocks.length / 100; // Convert to 0-1 scale
};

// Parse receipt data from OCR results
const parseReceiptData = (ocrResult) => {
  const { fullText, keyValuePairs } = ocrResult;
  
  const parsedData = {
    vendor: null,
    amount: null,
    date: null,
    items: [],
    total: null
  };

  // Extract vendor name (usually first line or company name)
  const lines = fullText.split('\n').filter(line => line.trim());
  if (lines.length > 0) {
    parsedData.vendor = lines[0].trim();
  }

  // Extract amount using various patterns
  const amountPatterns = [
    /total[:\s]*[\$]?(\d+[.,]\d{2})/i,
    /amount[:\s]*[\$]?(\d+[.,]\d{2})/i,
    /[\$]?(\d+[.,]\d{2})\s*total/i,
    /[\$]?(\d+[.,]\d{2})$/m
  ];

  for (const pattern of amountPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      parsedData.amount = parseFloat(match[1].replace(',', '.'));
      break;
    }
  }

  // Extract date
  const datePatterns = [
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
    /(\d{2,4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,
    /(\d{1,2}\s+\w+\s+\d{2,4})/
  ];

  for (const pattern of datePatterns) {
    const match = fullText.match(pattern);
    if (match) {
      const dateStr = match[1];
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime())) {
        parsedData.date = parsedDate.toISOString().split('T')[0];
        break;
      }
    }
  }

  // Extract from key-value pairs
  Object.keys(keyValuePairs).forEach(key => {
    if (key.includes('total') || key.includes('amount')) {
      const amount = parseFloat(keyValuePairs[key].replace(/[^\d.,]/g, '').replace(',', '.'));
      if (!isNaN(amount)) {
        parsedData.total = amount;
      }
    }
    
    if (key.includes('date') || key.includes('time')) {
      const dateStr = keyValuePairs[key];
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime())) {
        parsedData.date = parsedDate.toISOString().split('T')[0];
      }
    }
  });

  return parsedData;
};

// Process receipt OCR (main function)
const processReceiptOCR = async (expenseId, receiptUrl) => {
  try {
    // Update OCR status to processing
    await query(
      'UPDATE expenses SET ocr_status = $1 WHERE id = $2',
      ['processing', expenseId]
    );

    await query(
      'UPDATE ocr_queue SET status = $1, processed_at = NOW() WHERE expense_id = $2',
      ['processing', expenseId]
    );

    // Extract S3 key from URL
    const s3Key = receiptUrl.split('/').slice(-2).join('/'); // Get last two parts of path

    // Extract text using Textract
    const ocrResult = await extractTextFromImage(s3Key);
    
    // Parse receipt data
    const parsedData = parseReceiptData(ocrResult);

    // Update expense with OCR data
    await query(
      `UPDATE expenses SET 
         ocr_data = $1,
         ocr_status = $2,
         updated_at = NOW()
       WHERE id = $3`,
      [JSON.stringify({ ...ocrResult, parsed: parsedData }), 'completed', expenseId]
    );

    // Update OCR queue
    await query(
      'UPDATE ocr_queue SET status = $1, processed_at = NOW() WHERE expense_id = $2',
      ['completed', expenseId]
    );

    // Log OCR completion
    await query(
      `INSERT INTO expense_audit_log (expense_id, user_id, action, notes, metadata)
       SELECT $1, user_id, $2, $3, $4 FROM expenses WHERE id = $1`,
      [
        expenseId,
        'ocr_processed',
        `OCR processing completed with ${(ocrResult.confidence * 100).toFixed(1)}% confidence`,
        JSON.stringify({ confidence: ocrResult.confidence, parsedData })
      ]
    );

    logger.info(`OCR processing completed for expense ${expenseId}`);
    return { success: true, data: parsedData };

  } catch (error) {
    logger.error(`OCR processing failed for expense ${expenseId}:`, error);

    // Update status to failed
    await query(
      'UPDATE expenses SET ocr_status = $1 WHERE id = $2',
      ['failed', expenseId]
    );

    // Update OCR queue with error
    await query(
      `UPDATE ocr_queue SET 
         status = $1, 
         error_message = $2, 
         attempts = attempts + 1,
         processed_at = NOW() 
       WHERE expense_id = $3`,
      ['failed', error.message, expenseId]
    );

    throw error;
  }
};

// Retry failed OCR processing
const retryOCRProcessing = async () => {
  try {
    // Get failed OCR jobs that haven't exceeded max attempts
    const failedJobs = await query(
      `SELECT * FROM ocr_queue 
       WHERE status = 'failed' 
       AND attempts < max_attempts 
       AND created_at > NOW() - INTERVAL '24 hours'
       ORDER BY created_at ASC
       LIMIT 10`
    );

    for (const job of failedJobs.rows) {
      logger.info(`Retrying OCR for expense ${job.expense_id}`);
      
      try {
        // Get receipt URL
        const expenseResult = await query(
          'SELECT receipt_url FROM expenses WHERE id = $1',
          [job.expense_id]
        );

        if (expenseResult.rows.length > 0) {
          await processReceiptOCR(job.expense_id, expenseResult.rows[0].receipt_url);
        }
      } catch (error) {
        logger.error(`Retry failed for expense ${job.expense_id}:`, error);
      }
    }
  } catch (error) {
    logger.error('OCR retry process failed:', error);
  }
};

module.exports = {
  uploadToS3,
  getSignedUrl,
  deleteFromS3,
  extractTextFromImage,
  parseReceiptData,
  processReceiptOCR,
  retryOCRProcessing
};
