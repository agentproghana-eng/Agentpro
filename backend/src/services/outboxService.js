'use strict';

const {
  query,
  withTransaction,
} = require('../config/database');

const MAX_PAYLOAD_BYTES = 16 * 1024;

const SAFE_NAME_PATTERN =
  /^[a-z0-9_.-]+$/;

const SAFE_ERROR_CODE_PATTERN =
  /^[A-Z0-9_.-]{1,100}$/;

const SENSITIVE_KEY_PATTERN =
  /(^|_)(pin|password|passcode|secret|token|authorization|credential|private_key|setup_url|setup_link|ussd|ussd_session_log|raw_response|provider_response|network_response|session_log)($|_)/i;

function outboxError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertSafeName(value, field, maxLength) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    !SAFE_NAME_PATTERN.test(value)
  ) {
    throw outboxError(
      'OUTBOX_INVALID_METADATA',
      `${field} is invalid`
    );
  }
}

function assertNoSensitiveKeys(
  value,
  path = 'payload'
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoSensitiveKeys(
        item,
        `${path}[${index}]`
      );
    });

    return;
  }

  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');

    if (SENSITIVE_KEY_PATTERN.test(normalizedKey)) {
      throw outboxError(
        'OUTBOX_SENSITIVE_PAYLOAD_REJECTED',
        `Sensitive outbox payload key rejected at ${path}.${key}`
      );
    }

    assertNoSensitiveKeys(
      nested,
      `${path}.${key}`
    );
  }
}

function serializeSafePayload(payload) {
  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw outboxError(
      'OUTBOX_INVALID_PAYLOAD',
      'Outbox payload must be an object'
    );
  }

  assertNoSensitiveKeys(payload);

  let serialized;

  try {
    serialized = JSON.stringify(payload);
  } catch (_) {
    throw outboxError(
      'OUTBOX_INVALID_PAYLOAD',
      'Outbox payload must be JSON serializable'
    );
  }

  if (
    !serialized ||
    Buffer.byteLength(
      serialized,
      'utf8'
    ) > MAX_PAYLOAD_BYTES
  ) {
    throw outboxError(
      'OUTBOX_PAYLOAD_TOO_LARGE',
      'Outbox payload exceeds maximum size'
    );
  }

  return serialized;
}

function normalizePositiveInteger(
  value,
  {
    field,
    minimum,
    maximum,
    fallback,
  }
) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    throw outboxError(
      'OUTBOX_INVALID_METADATA',
      `${field} is invalid`
    );
  }

  return parsed;
}

async function enqueueOutboxEvent({
  dbClient,
  eventType,
  aggregateType,
  aggregateId = null,
  dedupeKey,
  payload,
  maxAttempts = 8,
  availableAt = null,
}) {
  if (
    !dbClient ||
    typeof dbClient.query !== 'function'
  ) {
    throw outboxError(
      'OUTBOX_TRANSACTION_CLIENT_REQUIRED',
      'Transactional outbox enqueue requires a database transaction client'
    );
  }

  assertSafeName(
    eventType,
    'eventType',
    100
  );

  assertSafeName(
    aggregateType,
    'aggregateType',
    100
  );

  if (
    typeof dedupeKey !== 'string' ||
    dedupeKey.length === 0 ||
    dedupeKey.length > 255
  ) {
    throw outboxError(
      'OUTBOX_INVALID_METADATA',
      'dedupeKey is invalid'
    );
  }

  const attemptsLimit =
    normalizePositiveInteger(
      maxAttempts,
      {
        field: 'maxAttempts',
        minimum: 1,
        maximum: 20,
        fallback: 8,
      }
    );

  if (
    availableAt !== null &&
    Number.isNaN(
      new Date(availableAt).getTime()
    )
  ) {
    throw outboxError(
      'OUTBOX_INVALID_METADATA',
      'availableAt is invalid'
    );
  }

  const serializedPayload =
    serializeSafePayload(payload);

  const inserted = await dbClient.query(
    `INSERT INTO outbox_events (
       event_type,
       aggregate_type,
       aggregate_id,
       dedupe_key,
       payload,
       status,
       attempts,
       max_attempts,
       available_at
     )
     VALUES (
       $1,
       $2,
       $3,
       $4,
       $5::jsonb,
       'pending',
       0,
       $6,
       COALESCE($7::timestamptz, NOW())
     )
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id, status`,
    [
      eventType,
      aggregateType,
      aggregateId,
      dedupeKey,
      serializedPayload,
      attemptsLimit,
      availableAt,
    ]
  );

  if (inserted.rows.length > 0) {
    return {
      ...inserted.rows[0],
      deduplicated: false,
    };
  }

  const existing = await dbClient.query(
    `SELECT id, status
     FROM outbox_events
     WHERE dedupe_key = $1`,
    [dedupeKey]
  );

  if (existing.rows.length !== 1) {
    throw outboxError(
      'OUTBOX_DEDUPE_LOOKUP_FAILED',
      'Existing outbox event could not be resolved'
    );
  }

  return {
    ...existing.rows[0],
    deduplicated: true,
  };
}

async function claimOutboxBatch({
  workerId,
  batchSize = 20,
  staleAfterSeconds = 300,
}) {
  if (
    typeof workerId !== 'string' ||
    workerId.length === 0 ||
    workerId.length > 100
  ) {
    throw outboxError(
      'OUTBOX_INVALID_WORKER_ID',
      'workerId is invalid'
    );
  }

  const limit =
    normalizePositiveInteger(
      batchSize,
      {
        field: 'batchSize',
        minimum: 1,
        maximum: 100,
        fallback: 20,
      }
    );

  const staleSeconds =
    normalizePositiveInteger(
      staleAfterSeconds,
      {
        field: 'staleAfterSeconds',
        minimum: 30,
        maximum: 3600,
        fallback: 300,
      }
    );

  return withTransaction(
    async (client) => {
      const result = await client.query(
        `WITH candidates AS (
           SELECT id
           FROM outbox_events
           WHERE attempts < max_attempts
             AND (
               (
                 status = 'pending'
                 AND available_at <= NOW()
               )
               OR
               (
                 status = 'processing'
                 AND locked_at <=
                   NOW() -
                   ($3::integer * INTERVAL '1 second')
               )
             )
           ORDER BY
             available_at ASC,
             created_at ASC
           FOR UPDATE SKIP LOCKED
           LIMIT $1
         )
         UPDATE outbox_events AS event
         SET
           status = 'processing',
           locked_at = NOW(),
           locked_by = $2,
           updated_at = NOW()
         FROM candidates
         WHERE event.id = candidates.id
         RETURNING event.*`,
        [
          limit,
          workerId,
          staleSeconds,
        ]
      );

      return result.rows;
    }
  );
}

async function markOutboxProcessed({
  eventId,
  workerId,
}) {
  const result = await query(
    `UPDATE outbox_events
     SET
       status = 'processed',
       processed_at = NOW(),
       locked_at = NULL,
       locked_by = NULL,
       last_error_code = NULL,
       updated_at = NOW()
     WHERE id = $1
       AND status = 'processing'
       AND locked_by = $2
     RETURNING id, status`,
    [
      eventId,
      workerId,
    ]
  );

  if (result.rows.length !== 1) {
    throw outboxError(
      'OUTBOX_CLAIM_LOST',
      'Outbox event claim is no longer owned by this worker'
    );
  }

  return result.rows[0];
}

async function markOutboxFailed({
  eventId,
  workerId,
  retryDelaySeconds,
  errorCode,
}) {
  const delay =
    normalizePositiveInteger(
      retryDelaySeconds,
      {
        field: 'retryDelaySeconds',
        minimum: 1,
        maximum: 86400,
        fallback: 5,
      }
    );

  const safeErrorCode =
    SAFE_ERROR_CODE_PATTERN.test(
      String(errorCode || '')
    )
      ? String(errorCode)
      : 'OUTBOX_HANDLER_FAILED';

  const result = await query(
    `UPDATE outbox_events
     SET
       attempts = attempts + 1,
       status = CASE
         WHEN attempts + 1 >= max_attempts
           THEN 'dead_letter'
         ELSE 'pending'
       END,
       available_at = CASE
         WHEN attempts + 1 >= max_attempts
           THEN NOW()
         ELSE NOW() +
           ($3::integer * INTERVAL '1 second')
       END,
       locked_at = NULL,
       locked_by = NULL,
       last_error_code = $4,
       updated_at = NOW()
     WHERE id = $1
       AND status = 'processing'
       AND locked_by = $2
     RETURNING
       id,
       status,
       attempts,
       max_attempts,
       available_at`,
    [
      eventId,
      workerId,
      delay,
      safeErrorCode,
    ]
  );

  if (result.rows.length !== 1) {
    throw outboxError(
      'OUTBOX_CLAIM_LOST',
      'Outbox event claim is no longer owned by this worker'
    );
  }

  return result.rows[0];
}

function normalizeOutboxErrorCode(error) {
  const code =
    String(
      error?.code ||
      'OUTBOX_HANDLER_FAILED'
    );

  if (SAFE_ERROR_CODE_PATTERN.test(code)) {
    return code;
  }

  return 'OUTBOX_HANDLER_FAILED';
}

module.exports = {
  MAX_PAYLOAD_BYTES,
  enqueueOutboxEvent,
  claimOutboxBatch,
  markOutboxProcessed,
  markOutboxFailed,
  normalizeOutboxErrorCode,
  serializeSafePayload,
};
