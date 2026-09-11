const { Pool } = require('pg');
const { performance } = require('perf_hooks');
const { logger } = require('../utils/logger');
const {
  recordDatabaseOperation,
} = require('../services/databaseTelemetryService');

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
  const totalStartedAt = performance.now();
  const acquisitionStartedAt = performance.now();

  let client = null;
  let acquisitionMs = null;
  let executionMs = null;
  let executionStartedAt = null;
  let success = false;

  try {
    client = await pool.connect();

    acquisitionMs =
      performance.now() -
      acquisitionStartedAt;

    executionStartedAt =
      performance.now();

    const result =
      await client.query(text, params);

    executionMs =
      performance.now() -
      executionStartedAt;

    success = true;

    const duration =
      performance.now() -
      totalStartedAt;

    if (
      process.env.NODE_ENV === 'development' &&
      duration > 1000
    ) {
      logger.warn(
        `Slow query (${Math.round(duration)}ms): ${text}`
      );
    }

    return result;
  } catch (error) {
    if (
      executionStartedAt !== null &&
      executionMs === null
    ) {
      executionMs =
        performance.now() -
        executionStartedAt;
    }

    const duration =
      performance.now() -
      totalStartedAt;

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
  } finally {
    if (
      acquisitionMs === null &&
      !client
    ) {
      acquisitionMs =
        performance.now() -
        acquisitionStartedAt;
    }

    recordDatabaseOperation({
      acquisitionMs,
      executionMs,
      totalMs:
        performance.now() -
        totalStartedAt,
      success,
    });

    if (client) {
      client.release();
    }
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

let closePromise = null;

function closeDB() {
  if (!closePromise) {
    closePromise = pool.end();
  }

  return closePromise;
}

module.exports = {
  pool,
  query,
  withTransaction,
  connectDB,
  closeDB,
};
