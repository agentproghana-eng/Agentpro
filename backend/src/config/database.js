const { Pool } = require('pg');
const Cursor = require('pg-cursor');
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
    logger.error('Query error:', { text, error: error.message });
    throw error;
  }
}

/**
 * Stream a SELECT query in bounded batches using a PostgreSQL cursor.
 *
 * `onRows` is awaited before the next batch is read, so callers can
 * respect downstream backpressure (HTTP, files, etc.) without loading
 * the complete result set into Node.js memory.
 */
async function streamQueryBatches(
  text,
  params,
  {
    batchSize = 500,
    onRows,
  } = {}
) {
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > 5000
  ) {
    throw new TypeError(
      'batchSize must be an integer between 1 and 5000'
    );
  }

  if (typeof onRows !== 'function') {
    throw new TypeError(
      'streamQueryBatches requires an onRows callback'
    );
  }

  const client = await pool.connect();
  let cursor;

  try {
    cursor = client.query(
      new Cursor(text, params)
    );

    while (true) {
      const rows = await cursor.read(batchSize);

      if (rows.length === 0) {
        break;
      }

      await onRows(rows);

      if (rows.length < batchSize) {
        break;
      }
    }
  } finally {
    if (cursor) {
      try {
        await cursor.close();
      } catch (error) {
        logger.warn(
          'Failed to close PostgreSQL cursor cleanly:',
          error.message
        );
      }
    }

    client.release();
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

module.exports = {
  pool,
  query,
  streamQueryBatches,
  withTransaction,
  connectDB,
};
