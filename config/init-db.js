const fs = require('fs').promises;
const path = require('path');
const { query, testConnection } = require('./database');
const { logger } = require('../utils/logger');

const initializeDatabase = async () => {
  try {
    // Test connection first
    const isConnected = await testConnection();
    if (!isConnected) {
      logger.error('Cannot initialize database: connection failed');
      return false;
    }

    logger.info('Starting database initialization...');

    // Read and execute schema
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schemaSQL = await fs.readFile(schemaPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = schemaSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await query(statement);
          logger.debug('Executed schema statement');
        } catch (error) {
          // Ignore "already exists" errors
          if (!error.message.includes('already exists')) {
            logger.warn('Schema statement failed (may already exist):', error.message);
          }
        }
      }
    }

    // Check if we need to seed data
    const userCount = await query('SELECT COUNT(*) FROM users');
    if (userCount.rows[0].count === '0') {
      logger.info('Seeding initial data...');
      
      // Create default admin user
      const adminPassword = '$2b$10$rQZ8K9vX8K9vX8K9vX8K9O.8K9vX8K9vX8K9vX8K9vX8K9vX8K9vX8K';
      await query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active, created_at)
        VALUES (
          gen_random_uuid(),
          'admin@reembolso.com',
          $1,
          'Admin',
          'User',
          'admin',
          true,
          NOW()
        ) ON CONFLICT (email) DO NOTHING
      `, [adminPassword]);

      // Create default approver user
      await query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active, created_at)
        VALUES (
          gen_random_uuid(),
          'approver@reembolso.com',
          $1,
          'Approver',
          'User',
          'approver',
          true,
          NOW()
        ) ON CONFLICT (email) DO NOTHING
      `, [adminPassword]);

      // Create default employee user
      await query(`
        INSERT INTO users (id, email, password_hash, first_name, last_name, role, is_active, created_at)
        VALUES (
          gen_random_uuid(),
          'employee@reembolso.com',
          $1,
          'Employee',
          'User',
          'employee',
          true,
          NOW()
        ) ON CONFLICT (email) DO NOTHING
      `, [adminPassword]);

      logger.info('Initial data seeded successfully');
    } else {
      logger.info('Database already has data, skipping seed');
    }

    logger.info('Database initialization completed successfully');
    return true;

  } catch (error) {
    logger.error('Database initialization failed:', error);
    return false;
  }
};

module.exports = { initializeDatabase };

