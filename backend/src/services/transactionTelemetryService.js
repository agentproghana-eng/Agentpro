'use strict';

const WINDOW_SECONDS = 60;

const PROVIDERS = [
  'mtn',
  'telecel',
  'at_money',
  'other',
];

const MODES = [
  'business',
  'personal',
];

const FAILURE_CLASSES = [
  'outcome_unconfirmed',
  'outcome_unconfirmed_after_pin',
  'provider_unrecognized_response',
  'network_no_response',
  'provider_reported_failure',
  'user_confirmed_failure',
  'automation_misconfigured',
  'automation_missing',
  'accessibility_unavailable',
  'sim_preparation_failure',
  'automation_error',
  'generic_failure',
];

let started = false;

const buckets = new Map();

function secondKey(nowMs) {
  return Math.floor(nowMs / 1000);
}

function normalizeProvider(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  return PROVIDERS.includes(normalized)
    ? normalized
    : 'other';
}

function normalizeMode(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  return MODES.includes(normalized)
    ? normalized
    : null;
}

function emptyOutcomeCounts() {
  return {
    initiated: 0,
    completed: 0,
    success: 0,
    failed: 0,
    pending_confirmation: 0,
  };
}

function emptyFailureClasses() {
  return Object.fromEntries(
    FAILURE_CLASSES.map((key) => [
      key,
      0,
    ])
  );
}

function emptyProviderCounts() {
  return Object.fromEntries(
    PROVIDERS.map((provider) => [
      provider,
      emptyOutcomeCounts(),
    ])
  );
}

function emptyModeCounts() {
  return Object.fromEntries(
    MODES.map((mode) => [
      mode,
      emptyOutcomeCounts(),
    ])
  );
}

function createBucket() {
  return {
    totals: emptyOutcomeCounts(),
    by_provider: emptyProviderCounts(),
    by_mode: emptyModeCounts(),
    failure_classes:
      emptyFailureClasses(),
  };
}

function cleanup(nowSecond) {
  const oldestAllowed =
    nowSecond - WINDOW_SECONDS + 1;

  for (const key of buckets.keys()) {
    if (key < oldestAllowed) {
      buckets.delete(key);
    }
  }
}

function getBucket(nowSecond) {
  cleanup(nowSecond);

  let bucket = buckets.get(nowSecond);

  if (!bucket) {
    bucket = createBucket();
    buckets.set(nowSecond, bucket);
  }

  return bucket;
}

function incrementOutcome(
  counts,
  event,
  status
) {
  if (event === 'initiated') {
    counts.initiated += 1;
    return;
  }

  if (event !== 'completed') {
    return;
  }

  counts.completed += 1;

  if (
    status === 'success' ||
    status === 'failed' ||
    status === 'pending_confirmation'
  ) {
    counts[status] += 1;
  }
}

const FAILURE_REASON_CLASSES =
  new Map([
    [
      'The transaction outcome could not be confirmed.',
      'outcome_unconfirmed',
    ],
    [
      'The transaction outcome could not be confirmed after PIN entry.',
      'outcome_unconfirmed_after_pin',
    ],
    [
      'The network returned an unrecognized transaction result.',
      'provider_unrecognized_response',
    ],
    [
      'No response was received from the network.',
      'network_no_response',
    ],
    [
      'The network reported that the transaction failed.',
      'provider_reported_failure',
    ],
    [
      'Manually confirmed as failed by the user.',
      'user_confirmed_failure',
    ],
    [
      'USSD automation is not configured correctly for this transaction.',
      'automation_misconfigured',
    ],
    [
      'No USSD automation is configured for this transaction.',
      'automation_missing',
    ],
    [
      'Accessibility permission is required for USSD automation.',
      'accessibility_unavailable',
    ],
    [
      'The required SIM could not be prepared for this transaction.',
      'sim_preparation_failure',
    ],
    [
      'The transaction failed due to an automation error.',
      'automation_error',
    ],
    [
      'The transaction failed.',
      'generic_failure',
    ],
  ]);

function classifyFailureReason(
  status,
  failureReason
) {
  if (
    status !== 'failed' &&
    status !== 'pending_confirmation'
  ) {
    return null;
  }

  const reason =
    typeof failureReason === 'string'
      ? failureReason.trim()
      : '';

  const exactClass =
    FAILURE_REASON_CLASSES.get(reason);

  if (exactClass) {
    return exactClass;
  }

  return status === 'pending_confirmation'
    ? 'outcome_unconfirmed'
    : 'generic_failure';
}

function startTransactionTelemetry() {
  started = true;
}

function stopTransactionTelemetry() {
  started = false;
  buckets.clear();
}

function isTransactionTelemetryStarted() {
  return started;
}

function recordTransactionTelemetryEvent({
  mode,
  provider,
  event,
  status = null,
  failureReason = null,
  nowMs = Date.now(),
}) {
  if (!started) {
    return;
  }

  const normalizedMode =
    normalizeMode(mode);

  if (!normalizedMode) {
    return;
  }

  if (
    event !== 'initiated' &&
    event !== 'completed'
  ) {
    return;
  }

  if (
    event === 'completed' &&
    ![
      'success',
      'failed',
      'pending_confirmation',
    ].includes(status)
  ) {
    return;
  }

  const normalizedProvider =
    normalizeProvider(provider);

  const nowSecond =
    secondKey(nowMs);

  const bucket =
    getBucket(nowSecond);

  incrementOutcome(
    bucket.totals,
    event,
    status
  );

  incrementOutcome(
    bucket.by_provider[
      normalizedProvider
    ],
    event,
    status
  );

  incrementOutcome(
    bucket.by_mode[
      normalizedMode
    ],
    event,
    status
  );

  if (event === 'completed') {
    const failureClass =
      classifyFailureReason(
        status,
        failureReason
      );

    if (failureClass) {
      bucket.failure_classes[
        failureClass
      ] += 1;
    }
  }
}

function addOutcomeCounts(
  target,
  source
) {
  for (
    const key
    of Object.keys(target)
  ) {
    target[key] += source[key];
  }
}

function transactionTelemetrySnapshot({
  nowMs = Date.now(),
} = {}) {
  const nowSecond =
    secondKey(nowMs);

  cleanup(nowSecond);

  const totals =
    emptyOutcomeCounts();

  const byProvider =
    emptyProviderCounts();

  const byMode =
    emptyModeCounts();

  const failureClasses =
    emptyFailureClasses();

  for (const bucket of buckets.values()) {
    addOutcomeCounts(
      totals,
      bucket.totals
    );

    for (const provider of PROVIDERS) {
      addOutcomeCounts(
        byProvider[provider],
        bucket.by_provider[provider]
      );
    }

    for (const mode of MODES) {
      addOutcomeCounts(
        byMode[mode],
        bucket.by_mode[mode]
      );
    }

    for (
      const failureClass
      of FAILURE_CLASSES
    ) {
      failureClasses[
        failureClass
      ] +=
        bucket.failure_classes[
          failureClass
        ];
    }
  }

  const terminal =
    totals.success +
    totals.failed;

  const completionFailureRate =
    terminal > 0
      ? Number(
          (
            totals.failed /
            terminal
          ).toFixed(4)
        )
      : 0;

  return {
    enabled: started,
    window_seconds:
      WINDOW_SECONDS,

    ...totals,

    transactions_per_minute:
      totals.initiated,

    completion_failure_rate:
      completionFailureRate,

    by_provider:
      byProvider,

    by_mode:
      byMode,

    failure_classes:
      failureClasses,
  };
}

module.exports = {
  WINDOW_SECONDS,
  PROVIDERS,
  MODES,
  FAILURE_CLASSES,
  startTransactionTelemetry,
  stopTransactionTelemetry,
  isTransactionTelemetryStarted,
  classifyFailureReason,
  recordTransactionTelemetryEvent,
  transactionTelemetrySnapshot,
};
