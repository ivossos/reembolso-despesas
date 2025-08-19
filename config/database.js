const { Pool } = require('pg');
const { logger } = require('../utils/logger');

// Database connection configuration
const config = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'reembolso_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle
  connectionTimeoutMillis: 10000, // Increased timeout for Cloud Run
  ssl: false // Temporarily disable SSL for testing
};

// For Cloud SQL Unix socket connections
if (process.env.NODE_ENV === 'production' && process.env.DB_HOST && process.env.DB_HOST.startsWith('/cloudsql/')) {
  config.host = process.env.DB_HOST;
  config.port = undefined; // Unix socket doesn't use port
}

// Create connection pool
const pool = new Pool(config);

// Handle pool events
pool.on('connect', (client) => {
  logger.info('New database client connected');
});

pool.on('error', (err, client) => {
  logger.error('Database pool error:', err);
  process.exit(-1);
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info('Database connection successful:', result.rows[0].now);
    return true;
  } catch (error) {
    logger.error('Database connection failed:', error.message);
    return false;
  }
};

// Query helper function
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    logger.debug(`Query executed in ${duration}ms:`, { text, duration, rows: result.rowCount });
    return result;
  } catch (error) {
    logger.error('Database query error:', { error: error.message, query: text, params });
    throw error;
  }
};

// Transaction helper
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

// Graceful shutdown
const shutdown = async () => {
  try {
    await pool.end();
    logger.info('Database pool closed');
  } catch (error) {
    logger.error('Error closing database pool:', error);
  }
};

module.exports = {
  pool,
  query,
  transaction,
  testConnection,
  shutdown
};
