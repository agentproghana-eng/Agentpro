'use strict';

const WINDOW_SECONDS = 60;
const LATENCY_SAMPLES_PER_SECOND = 512;

const SLOW_QUERY_THRESHOLD_MS = 500;
const SLOW_QUERY_FINGERPRINTS_PER_SECOND = 20;
const SLOW_QUERY_FINGERPRINTS_SNAPSHOT = 20;

let started = false;
const buckets = new Map();

function secondKey(nowMs) {
  return Math.floor(nowMs / 1000);
}

function cleanupBuckets(nowSecond) {
  const oldestAllowed =
    nowSecond - WINDOW_SECONDS + 1;

  for (const key of buckets.keys()) {
    if (key < oldestAllowed) {
      buckets.delete(key);
    }
  }
}

function createMetricBucket() {
  return {
    seen: 0,
    samples: [],
    max_ms: null,
  };
}

function createBucket() {
  return {
    operations: 0,
    failures: 0,

    acquisition: createMetricBucket(),
    execution: createMetricBucket(),
    total: createMetricBucket(),

    transactions: 0,
    transaction_failures: 0,
    transaction_acquisition:
      createMetricBucket(),
    transaction_total:
      createMetricBucket(),

    slow_query_count: 0,
    slow_query_fingerprints: new Map(),
  };
}

function recordLatency(metric, durationMs) {
  if (
    durationMs === null ||
    durationMs === undefined
  ) {
    return;
  }

  const duration = Number(durationMs);

  if (!Number.isFinite(duration) || duration < 0) {
    return;
  }

  const rounded =
    Number(duration.toFixed(3));

  metric.seen += 1;

  if (
    metric.max_ms === null ||
    rounded > metric.max_ms
  ) {
    metric.max_ms = rounded;
  }

  if (
    metric.samples.length <
    LATENCY_SAMPLES_PER_SECOND
  ) {
    metric.samples.push(rounded);
    return;
  }

  const replacementIndex =
    Math.floor(
      Math.random() * metric.seen
    );

  if (
    replacementIndex <
    LATENCY_SAMPLES_PER_SECOND
  ) {
    metric.samples[replacementIndex] =
      rounded;
  }
}

function safeFingerprint(value) {
  if (typeof value !== 'string') {
    return null;
  }

  if (!/^q_[a-f0-9]{16}$/.test(value)) {
    return null;
  }

  return value;
}

function safeLabel(value) {
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

function recordSlowQuery({
  bucket,
  queryFingerprint,
  queryLabel,
  executionMs,
  success,
}) {
  const execution =
    Number(executionMs);

  if (
    !Number.isFinite(execution) ||
    execution <
      SLOW_QUERY_THRESHOLD_MS
  ) {
    return;
  }

  bucket.slow_query_count += 1;

  const fingerprint =
    safeFingerprint(queryFingerprint);

  if (!fingerprint) {
    return;
  }

  let entry =
    bucket.slow_query_fingerprints
      .get(fingerprint);

  if (!entry) {
    if (
      bucket.slow_query_fingerprints
        .size >=
      SLOW_QUERY_FINGERPRINTS_PER_SECOND
    ) {
      return;
    }

    entry = {
      fingerprint,
      label: safeLabel(queryLabel),
      count: 0,
      failures: 0,
      max_execution_ms: null,
    };

    bucket.slow_query_fingerprints
      .set(fingerprint, entry);
  }

  entry.count += 1;

  if (!success) {
    entry.failures += 1;
  }

  const rounded =
    Number(execution.toFixed(3));

  if (
    entry.max_execution_ms === null ||
    rounded >
      entry.max_execution_ms
  ) {
    entry.max_execution_ms = rounded;
  }
}

function startDatabaseTelemetry() {
  started = true;
}

function stopDatabaseTelemetry() {
  started = false;
  buckets.clear();
}

function isDatabaseTelemetryStarted() {
  return started;
}

function recordDatabaseOperation({
  acquisitionMs,
  executionMs,
  totalMs,
  success = true,
  queryFingerprint = null,
  queryLabel = null,
  nowMs = Date.now(),
}) {
  if (!started) {
    return;
  }

  const nowSecond =
    secondKey(nowMs);

  cleanupBuckets(nowSecond);

  let bucket =
    buckets.get(nowSecond);

  if (!bucket) {
    bucket = createBucket();
    buckets.set(nowSecond, bucket);
  }

  bucket.operations += 1;

  if (!success) {
    bucket.failures += 1;
  }

  recordLatency(
    bucket.acquisition,
    acquisitionMs
  );

  recordLatency(
    bucket.execution,
    executionMs
  );

  recordLatency(
    bucket.total,
    totalMs
  );

  recordSlowQuery({
    bucket,
    queryFingerprint,
    queryLabel,
    executionMs,
    success,
  });
}

function recordDatabaseTransaction({
  acquisitionMs,
  totalMs,
  success = true,
  nowMs = Date.now(),
}) {
  if (!started) {
    return;
  }

  const nowSecond =
    secondKey(nowMs);

  cleanupBuckets(nowSecond);

  let bucket =
    buckets.get(nowSecond);

  if (!bucket) {
    bucket = createBucket();
    buckets.set(nowSecond, bucket);
  }

  bucket.transactions += 1;

  if (!success) {
    bucket.transaction_failures += 1;
  }

  recordLatency(
    bucket.transaction_acquisition,
    acquisitionMs
  );

  recordLatency(
    bucket.transaction_total,
    totalMs
  );
}

function percentile(
  sorted,
  percentileValue
) {
  if (!sorted.length) {
    return null;
  }

  const rank = Math.ceil(
    percentileValue * sorted.length
  );

  return sorted[
    Math.max(0, rank - 1)
  ];
}

function aggregateMetric(metricName) {
  const samples = [];
  let maxMs = null;

  for (const bucket of buckets.values()) {
    const metric = bucket[metricName];

    samples.push(...metric.samples);

    if (
      metric.max_ms !== null &&
      (
        maxMs === null ||
        metric.max_ms > maxMs
      )
    ) {
      maxMs = metric.max_ms;
    }
  }

  samples.sort((a, b) => a - b);

  return {
    sample_count: samples.length,
    p50_ms: percentile(
      samples,
      0.50
    ),
    p95_ms: percentile(
      samples,
      0.95
    ),
    p99_ms: percentile(
      samples,
      0.99
    ),
    max_ms: maxMs,
  };
}

function aggregateSlowQueries() {
  let count = 0;
  const fingerprints = new Map();

  for (const bucket of buckets.values()) {
    count += bucket.slow_query_count;

    for (
      const entry
      of bucket
        .slow_query_fingerprints
        .values()
    ) {
      let aggregate =
        fingerprints.get(
          entry.fingerprint
        );

      if (!aggregate) {
        aggregate = {
          fingerprint:
            entry.fingerprint,
          label: entry.label,
          count: 0,
          failures: 0,
          max_execution_ms: null,
        };

        fingerprints.set(
          entry.fingerprint,
          aggregate
        );
      }

      aggregate.count += entry.count;
      aggregate.failures +=
        entry.failures;

      if (
        entry.max_execution_ms !== null &&
        (
          aggregate.max_execution_ms ===
            null ||
          entry.max_execution_ms >
            aggregate.max_execution_ms
        )
      ) {
        aggregate.max_execution_ms =
          entry.max_execution_ms;
      }
    }
  }

  const top =
    [...fingerprints.values()]
      .sort(
        (a, b) =>
          b.count - a.count ||
          (
            b.max_execution_ms || 0
          ) -
          (
            a.max_execution_ms || 0
          ) ||
          a.fingerprint.localeCompare(
            b.fingerprint
          )
      )
      .slice(
        0,
        SLOW_QUERY_FINGERPRINTS_SNAPSHOT
      );

  return {
    threshold_ms:
      SLOW_QUERY_THRESHOLD_MS,
    count,
    fingerprints: top,
  };
}

function databaseTelemetrySnapshot({
  nowMs = Date.now(),
} = {}) {
  const nowSecond =
    secondKey(nowMs);

  cleanupBuckets(nowSecond);

  let operations = 0;
  let failures = 0;
  let transactions = 0;
  let transactionFailures = 0;

  for (const bucket of buckets.values()) {
    operations += bucket.operations;
    failures += bucket.failures;
    transactions +=
      bucket.transactions;
    transactionFailures +=
      bucket.transaction_failures;
  }

  return {
    enabled: started,
    window_seconds: WINDOW_SECONDS,

    operations,
    failures,

    acquisition_wait:
      aggregateMetric('acquisition'),

    execution:
      aggregateMetric('execution'),

    total:
      aggregateMetric('total'),

    transactions: {
      count: transactions,
      failures:
        transactionFailures,

      acquisition_wait:
        aggregateMetric(
          'transaction_acquisition'
        ),

      total:
        aggregateMetric(
          'transaction_total'
        ),
    },

    slow_queries:
      aggregateSlowQueries(),
  };
}

module.exports = {
  WINDOW_SECONDS,
  LATENCY_SAMPLES_PER_SECOND,
  SLOW_QUERY_THRESHOLD_MS,
  SLOW_QUERY_FINGERPRINTS_PER_SECOND,
  SLOW_QUERY_FINGERPRINTS_SNAPSHOT,

  startDatabaseTelemetry,
  stopDatabaseTelemetry,
  isDatabaseTelemetryStarted,

  recordDatabaseOperation,
  recordDatabaseTransaction,

  databaseTelemetrySnapshot,
};
