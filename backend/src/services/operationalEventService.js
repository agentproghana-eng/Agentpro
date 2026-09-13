'use strict';

const { validate: uuidValidate } = require('uuid');

const MAX_ATTRIBUTES_BYTES = 16 * 1024;
const SAFE_NAME_PATTERN = /^[a-z0-9_.-]+$/;
const SENSITIVE_KEY_PATTERN =
  /(^|_)(pin|password|passcode|secret|token|authorization|credential|private_key|setup_url|setup_link|otp|phone|email|ip_address|user_agent|ussd|ussd_session_log|raw_response|provider_response|network_response|session_log)($|_)/i;
const SENSITIVE_SUBJECT_TYPE_PATTERN =
  /(^|[_.-])(pin|password|passcode|secret|token|credential|otp|phone|email|ussd|raw_response)([_.-]|$)/i;

function operationalEventError(code, message) {
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
    throw operationalEventError(
      'OPERATIONAL_EVENT_INVALID_METADATA',
      `${field} is invalid`
    );
  }
}

function assertUuidOrNull(value, field) {
  if (value !== null && !uuidValidate(value)) {
    throw operationalEventError(
      'OPERATIONAL_EVENT_INVALID_METADATA',
      `${field} is invalid`
    );
  }
}

function assertNoSensitiveKeys(value, path = 'attributes') {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoSensitiveKeys(item, `${path}[${index}]`)
    );
    return;
  }

  if (value === null || typeof value !== 'object') return;

  for (const [key, nested] of Object.entries(value)) {
    const normalizedKey = key
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');

    if (SENSITIVE_KEY_PATTERN.test(normalizedKey)) {
      throw operationalEventError(
        'OPERATIONAL_EVENT_SENSITIVE_ATTRIBUTES_REJECTED',
        `Sensitive operational event key rejected at ${path}.${key}`
      );
    }

    assertNoSensitiveKeys(nested, `${path}.${key}`);
  }
}

function serializeSafeAttributes(attributes) {
  if (
    attributes === null ||
    typeof attributes !== 'object' ||
    Array.isArray(attributes)
  ) {
    throw operationalEventError(
      'OPERATIONAL_EVENT_INVALID_ATTRIBUTES',
      'Operational event attributes must be an object'
    );
  }

  assertNoSensitiveKeys(attributes);

  let serialized;
  try {
    serialized = JSON.stringify(attributes);
  } catch (_) {
    throw operationalEventError(
      'OPERATIONAL_EVENT_INVALID_ATTRIBUTES',
      'Operational event attributes must be JSON serializable'
    );
  }

  if (
    !serialized ||
    Buffer.byteLength(serialized, 'utf8') > MAX_ATTRIBUTES_BYTES
  ) {
    throw operationalEventError(
      'OPERATIONAL_EVENT_ATTRIBUTES_TOO_LARGE',
      'Operational event attributes exceed maximum size'
    );
  }

  return serialized;
}

async function recordOperationalEvent({
  dbClient,
  eventName,
  eventVersion = 1,
  source = 'backend',
  actorUserId = null,
  companyId = null,
  subjectType,
  subjectId,
  correlationId,
  causationEventId = null,
  dedupeKey = null,
  attributes = {},
  occurredAt = null,
}) {
  if (!dbClient || typeof dbClient.query !== 'function') {
    throw operationalEventError(
      'OPERATIONAL_EVENT_TRANSACTION_CLIENT_REQUIRED',
      'Operational event recording requires a database transaction client'
    );
  }

  assertSafeName(eventName, 'eventName', 100);
  assertSafeName(source, 'source', 50);
  assertSafeName(subjectType, 'subjectType', 100);

  if (SENSITIVE_SUBJECT_TYPE_PATTERN.test(subjectType)) {
    throw operationalEventError(
      'OPERATIONAL_EVENT_SENSITIVE_SUBJECT_REJECTED',
      'Operational event subjects must use internal entity identifiers'
    );
  }

  if (
    typeof subjectId !== 'string' ||
    subjectId.length === 0 ||
    subjectId.length > 255
  ) {
    throw operationalEventError(
      'OPERATIONAL_EVENT_INVALID_METADATA',
      'subjectId is invalid'
    );
  }

  if (
    !Number.isInteger(eventVersion) ||
    eventVersion < 1 ||
    eventVersion > 100
  ) {
    throw operationalEventError(
      'OPERATIONAL_EVENT_INVALID_METADATA',
      'eventVersion is invalid'
    );
  }

  assertUuidOrNull(actorUserId, 'actorUserId');
  assertUuidOrNull(companyId, 'companyId');
  assertUuidOrNull(correlationId, 'correlationId');
  assertUuidOrNull(causationEventId, 'causationEventId');

  if (correlationId === null) {
    throw operationalEventError(
      'OPERATIONAL_EVENT_INVALID_METADATA',
      'correlationId is required'
    );
  }

  if (
    dedupeKey !== null &&
    (
      typeof dedupeKey !== 'string' ||
      dedupeKey.length === 0 ||
      dedupeKey.length > 255
    )
  ) {
    throw operationalEventError(
      'OPERATIONAL_EVENT_INVALID_METADATA',
      'dedupeKey is invalid'
    );
  }

  if (
    occurredAt !== null &&
    Number.isNaN(new Date(occurredAt).getTime())
  ) {
    throw operationalEventError(
      'OPERATIONAL_EVENT_INVALID_METADATA',
      'occurredAt is invalid'
    );
  }

  const serializedAttributes =
    serializeSafeAttributes(attributes);

  const result = await dbClient.query(
    `INSERT INTO operational_events (
       event_name,
       event_version,
       source,
       actor_user_id,
       company_id,
       subject_type,
       subject_id,
       correlation_id,
       causation_event_id,
       dedupe_key,
       attributes,
       occurred_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10, $11::jsonb,
       COALESCE($12::timestamptz, NOW())
     )
     ON CONFLICT (dedupe_key)
       WHERE dedupe_key IS NOT NULL
     DO NOTHING
     RETURNING *`,
    [
      eventName,
      eventVersion,
      source,
      actorUserId,
      companyId,
      subjectType,
      subjectId,
      correlationId,
      causationEventId,
      dedupeKey,
      serializedAttributes,
      occurredAt,
    ]
  );

  if (result.rows.length === 1) return result.rows[0];

  const existing = await dbClient.query(
    `SELECT *
     FROM operational_events
     WHERE dedupe_key = $1`,
    [dedupeKey]
  );

  if (existing.rows.length !== 1) {
    throw operationalEventError(
      'OPERATIONAL_EVENT_DEDUPE_RESOLUTION_FAILED',
      'Existing operational event could not be resolved'
    );
  }

  return existing.rows[0];
}

module.exports = {
  MAX_ATTRIBUTES_BYTES,
  recordOperationalEvent,
  serializeSafeAttributes,
};
