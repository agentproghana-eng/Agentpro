'use strict';

const {
  monitorEventLoopDelay,
  performance,
} = require('perf_hooks');

const { pool, query } = require('../config/database');
const redisConfig = require('../config/redis');
const {
  providerHealthSnapshot,
} = require('./providerHealthService');
const {
  startApiRequestTelemetry,
  stopApiRequestTelemetry,
  apiRequestSnapshot,
} = require('./apiRequestTelemetryService');
const {
  startAuthPaystackTelemetry,
  stopAuthPaystackTelemetry,
  authTelemetrySnapshot,
  paystackWebhookTelemetrySnapshot,
} = require('./authPaystackTelemetryService');
const {
  startTransactionTelemetry,
  stopTransactionTelemetry,
  transactionTelemetrySnapshot,
} = require('./transactionTelemetryService');

const histogram = monitorEventLoopDelay({
  resolution: 20,
});

let started = false;

function startPerformanceTelemetry() {
  if (started) {
    return;
  }

  histogram.enable();
  startApiRequestTelemetry();
  startAuthPaystackTelemetry();
  startTransactionTelemetry();
  started = true;
}

function stopPerformanceTelemetry() {
  if (!started) {
    return;
  }

  histogram.disable();
  stopApiRequestTelemetry();
  stopAuthPaystackTelemetry();
  stopTransactionTelemetry();
  started = false;
}

function nanosecondsToMilliseconds(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Number((value / 1e6).toFixed(3));
}

function eventLoopSnapshot() {
  if (!started) {
    return {
      enabled: false,
    };
  }

  const snapshot = {
    enabled: true,
    mean_ms: nanosecondsToMilliseconds(histogram.mean),
    p95_ms: nanosecondsToMilliseconds(histogram.percentile(95)),
    p99_ms: nanosecondsToMilliseconds(histogram.percentile(99)),
    max_ms: nanosecondsToMilliseconds(histogram.max),
  };

  histogram.reset();

  return snapshot;
}

async function redisSnapshot() {
  const client = redisConfig.redisClient;

  if (!client) {
    return {
      status: 'unavailable',
      ping_ms: null,
    };
  }

  if (client.status !== 'ready') {
    return {
      status: client.status || 'unknown',
      ping_ms: null,
    };
  }

  const startedAt = performance.now();

  try {
    await client.ping();

    return {
      status: 'ready',
      ping_ms: Number(
        (performance.now() - startedAt).toFixed(3)
      ),
    };
  } catch (_) {
    return {
      status: 'error',
      ping_ms: null,
    };
  }
}

async function outboxSnapshot() {
  const result = await query(
    `SELECT
       COUNT(*) FILTER (
         WHERE status = 'pending'
       )::integer AS pending,
       COUNT(*) FILTER (
         WHERE status = 'processing'
       )::integer AS processing,
       COUNT(*) FILTER (
         WHERE status = 'dead_letter'
       )::integer AS dead_letter,
       COALESCE(
         EXTRACT(
           EPOCH FROM (
             NOW() - MIN(created_at)
               FILTER (
                 WHERE status = 'pending'
               )
           )
         ),
         0
       )::double precision AS oldest_pending_age_seconds
     FROM outbox_events`
  );

  const row = result.rows[0] || {};

  return {
    pending: Number(row.pending || 0),
    processing: Number(row.processing || 0),
    dead_letter: Number(row.dead_letter || 0),
    oldest_pending_age_seconds:
      Number(row.oldest_pending_age_seconds || 0),
  };
}

async function performanceSnapshot() {
  const memory = process.memoryUsage();

  const [redis, outbox, providerHealth] =
    await Promise.all([
      redisSnapshot(),
      outboxSnapshot(),
      providerHealthSnapshot(),
    ]);

  return {
    timestamp: new Date().toISOString(),

    process: {
      uptime_seconds: Number(
        process.uptime().toFixed(3)
      ),
      rss_bytes: memory.rss,
      heap_used_bytes: memory.heapUsed,
      heap_total_bytes: memory.heapTotal,
      external_bytes: memory.external,
    },

    event_loop: eventLoopSnapshot(),

    api: apiRequestSnapshot(),

    auth: authTelemetrySnapshot(),

    paystack_webhooks:
      paystackWebhookTelemetrySnapshot(),

    transactions:
      transactionTelemetrySnapshot(),

    postgres: {
      total_connections: pool.totalCount,
      idle_connections: pool.idleCount,
      waiting_requests: pool.waitingCount,
    },

    redis,

    outbox,

    provider_health: providerHealth,
  };
}

module.exports = {
  startPerformanceTelemetry,
  stopPerformanceTelemetry,
  performanceSnapshot,
};
