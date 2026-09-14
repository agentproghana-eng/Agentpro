const { Pool } = require('pg');
const {
  performance,
} = require('perf_hooks');
const {
  createHash,
} = require('crypto');

const { logger } = require('../utils/logger');

const {
  recordDatabaseOperation,
  recordDatabaseTransaction,
  SLOW_QUERY_THRESHOLD_MS,
} = require(
  '../services/databaseTelemetryService'
);

const SLOW_QUERY_LOGS_PER_SECOND = 5;

let slowQueryLogSecond = null;
let slowQueryLogsThisSecond = 0;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL,

  min:
    parseInt(
      process.env.DB_POOL_MIN
    ) || 2,

  max:
    parseInt(
      process.env.DB_POOL_MAX
    ) || 20,

  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,

  ssl:
    process.env.NODE_ENV ===
    'production'
      ? {
          rejectUnauthorized: false,
        }
      : false,
});

pool.on('error', (err) => {
  logger.error(
    'PostgreSQL pool error:',
    err
  );
});

function normalizeSqlForFingerprint(
  text
) {
  if (typeof text !== 'string') {
    return '';
  }

  return text
    .replace(
      /'(?:''|[^'])*'/g,
      '?'
    )
    .replace(
      /\b\d+(?:\.\d+)?\b/g,
      '?'
    )
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function queryFingerprint(text) {
  const normalized =
    normalizeSqlForFingerprint(text);

  if (!normalized) {
    return null;
  }

  return (
    'q_' +
    createHash('sha256')
      .update(normalized)
      .digest('hex')
      .slice(0, 16)
  );
}

function safeQueryLabel(value) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 64
  ) {
    return null;
  }

  if (
    !/^[a-zA-Z0-9_.:-]+$/.test(value)
  ) {
    return null;
  }

  return value;
}

function extractQueryText(
  textOrConfig
) {
  if (
    typeof textOrConfig ===
    'string'
  ) {
    return textOrConfig;
  }

  if (
    textOrConfig &&
    typeof textOrConfig.text ===
      'string'
  ) {
    return textOrConfig.text;
  }

  return '';
}

function shouldEmitSlowQueryLog(
  nowMs = Date.now()
) {
  const second =
    Math.floor(nowMs / 1000);

  if (
    slowQueryLogSecond !== second
  ) {
    slowQueryLogSecond = second;
    slowQueryLogsThisSecond = 0;
  }

  if (
    slowQueryLogsThisSecond >=
    SLOW_QUERY_LOGS_PER_SECOND
  ) {
    return false;
  }

  slowQueryLogsThisSecond += 1;

  return true;
}

function maybeLogSlowQuery({
  fingerprint,
  label,
  executionMs,
  totalMs,
}) {
  if (
    executionMs === null ||
    executionMs <
      SLOW_QUERY_THRESHOLD_MS
  ) {
    return;
  }

  if (!shouldEmitSlowQueryLog()) {
    return;
  }

  logger.warn(
    'Slow database query',
    {
      fingerprint,
      label,
      executionMs:
        Number(
          executionMs.toFixed(3)
        ),
      totalMs:
        Number(
          totalMs.toFixed(3)
        ),
    }
  );
}

async function connectDB() {
  const client = await pool.connect();

  try {
    await client.query(
      'SELECT NOW()'
    );

    logger.info(
      'PostgreSQL pool established'
    );
  } finally {
    client.release();
  }
}

async function query(
  text,
  params,
  options = {}
) {
  const totalStartedAt =
    performance.now();

  const acquisitionStartedAt =
    performance.now();

  const fingerprint =
    queryFingerprint(text);

  const label =
    safeQueryLabel(
      options?.label
    );

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
      await client.query(
        text,
        params
      );

    executionMs =
      performance.now() -
      executionStartedAt;

    success = true;

    const totalMs =
      performance.now() -
      totalStartedAt;

    maybeLogSlowQuery({
      fingerprint,
      label,
      executionMs,
      totalMs,
    });

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

    const totalMs =
      performance.now() -
      totalStartedAt;

    logger.error(
      'Database query failed',
      {
        fingerprint,
        label,
        errorCode:
          error?.code,
        durationMs:
          Number(
            totalMs.toFixed(3)
          ),
      }
    );

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

      queryFingerprint:
        fingerprint,

      queryLabel:
        label,
    });

    if (client) {
      client.release();
    }
  }
}

function instrumentTransactionClient(
  client,
  transactionLabel = null
) {
  return new Proxy(
    client,
    {
      get(target, property) {
        if (property !== 'query') {
          const value =
            target[property];

          if (
            typeof value ===
            'function'
          ) {
            return value.bind(
              target
            );
          }

          return value;
        }

        return async (
          ...args
        ) => {
          const text =
            extractQueryText(
              args[0]
            );

          const fingerprint =
            queryFingerprint(text);

          const startedAt =
            performance.now();

          let success = false;
          let executionMs = null;

          try {
            const result =
              await target.query(
                ...args
              );

            executionMs =
              performance.now() -
              startedAt;

            success = true;

            maybeLogSlowQuery({
              fingerprint,
              label:
                transactionLabel,
              executionMs,
              totalMs:
                executionMs,
            });

            return result;
          } catch (error) {
            executionMs =
              performance.now() -
              startedAt;

            logger.error(
              'Database transaction query failed',
              {
                fingerprint,
                label:
                  transactionLabel,
                errorCode:
                  error?.code,
                durationMs:
                  Number(
                    executionMs
                      .toFixed(3)
                  ),
              }
            );

            throw error;
          } finally {
            recordDatabaseOperation({
              acquisitionMs: null,
              executionMs,
              totalMs:
                executionMs,
              success,

              queryFingerprint:
                fingerprint,

              queryLabel:
                transactionLabel,
            });
          }
        };
      },
    }
  );
}

async function withTransaction(
  callback,
  options = {}
) {
  const totalStartedAt =
    performance.now();

  const acquisitionStartedAt =
    performance.now();

  const label =
    safeQueryLabel(
      options?.label
    );

  let client = null;
  let acquisitionMs = null;
  let success = false;

  try {
    client = await pool.connect();

    acquisitionMs =
      performance.now() -
      acquisitionStartedAt;

    await client.query('BEGIN');

    const instrumentedClient =
      instrumentTransactionClient(
        client,
        label
      );

    const result =
      await callback(
        instrumentedClient
      );

    await client.query('COMMIT');

    success = true;

    return result;
  } catch (error) {
    if (client) {
      try {
        await client.query(
          'ROLLBACK'
        );
      } catch (rollbackError) {
        logger.error(
          'Database transaction rollback failed',
          {
            errorCode:
              rollbackError
                ?.code,
          }
        );
      }
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

    recordDatabaseTransaction({
      acquisitionMs,

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

let closePromise = null;

function closeDB() {
  if (!closePromise) {
    closePromise =
      pool.end();
  }

  return closePromise;
}

module.exports = {
  pool,
  query,
  withTransaction,
  connectDB,
  closeDB,

  normalizeSqlForFingerprint,
  queryFingerprint,
  safeQueryLabel,
};
