const { Pool } = require('pg');
const { logger } = require('../utils/logger');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

pool.on('error', (err) => {
  logger.error('PostgreSQL pool error:', err);
});

async function connectDB() {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
    logger.info('PostgreSQL pool established');
  } finally {
    client.release();
  }
}

/**
 * Execute a query
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === 'development' && duration > 1000) {
      logger.warn(`Slow query (${duration}ms): ${text}`);
    }
    return result;
  } catch (error) {
    const duration = Date.now() - start;

    if (process.env.NODE_ENV === 'development') {
      logger.error('Query error:', {
        text,
        error: error.message,
      });
    } else {
      logger.error('Database query failed', {
        errorCode: error?.code,
        durationMs: duration,
      });
    }

    throw error;
  }
}

/**
 * Execute within a transaction
 */
async function withTransaction(callback) {
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
}

module.exports = { pool, query, withTransaction, connectDB };
