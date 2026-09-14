'use strict';

const {
  validate: uuidValidate,
} = require('uuid');

const MAX_JSON_BYTES =
  16 * 1024;

const MAX_EVIDENCE_IDS = 20;

const SAFE_NAME_PATTERN =
  /^[a-z0-9_.-]+$/;

const SEVERITIES =
  new Set([
    'low',
    'medium',
    'high',
    'critical',
  ]);

function fraudSignalError(
  code,
  message
) {
  const error =
    new Error(message);

  error.code = code;

  return error;
}

function assertSafeName(
  value,
  field,
  maxLength
) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    !SAFE_NAME_PATTERN.test(
      value
    )
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_INVALID',
      `${field} is invalid`
    );
  }
}

function assertUuidOrNull(
  value,
  field
) {
  if (
    value !== null &&
    !uuidValidate(value)
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_INVALID',
      `${field} is invalid`
    );
  }
}

function validDate(
  value,
  field
) {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_INVALID',
      `${field} is invalid`
    );
  }

  return date;
}

function serializeBoundedObject(
  value,
  field
) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_INVALID',
      `${field} must be an object`
    );
  }

  let serialized;

  try {
    serialized =
      JSON.stringify(value);
  } catch (_) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_INVALID',
      `${field} must be JSON serializable`
    );
  }

  if (
    Buffer.byteLength(
      serialized,
      'utf8'
    ) > MAX_JSON_BYTES
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_TOO_LARGE',
      `${field} exceeds maximum size`
    );
  }

  return serialized;
}

function assertEvidence(
  evidence
) {
  const allowedKeys =
    new Set([
      'event_ids',
      'transaction_ids',
      'correlation_ids',
    ]);

  for (
    const key of
      Object.keys(evidence)
  ) {
    if (
      !allowedKeys.has(key)
    ) {
      throw fraudSignalError(
        'FRAUD_SIGNAL_INVALID_EVIDENCE',
        `Unsupported evidence key: ${key}`
      );
    }
  }

  for (
    const key of
      allowedKeys
  ) {
    const values =
      evidence[key] || [];

    if (
      !Array.isArray(values) ||
      values.length >
        MAX_EVIDENCE_IDS ||
      values.some(
        value =>
          typeof value !==
            'string' ||
          value.length === 0 ||
          value.length > 255
      )
    ) {
      throw fraudSignalError(
        'FRAUD_SIGNAL_INVALID_EVIDENCE',
        `${key} is invalid`
      );
    }
  }
}

function normalizeSignal(
  signal
) {
  if (
    !signal ||
    typeof signal !== 'object' ||
    Array.isArray(signal)
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_INVALID',
      'Signal is invalid'
    );
  }

  assertSafeName(
    signal.signal_type,
    'signal_type',
    100
  );

  assertSafeName(
    signal.rule_id,
    'rule_id',
    100
  );

  if (
    !SEVERITIES.has(
      signal.severity
    )
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_INVALID',
      'severity is invalid'
    );
  }

  if (
    !Number.isInteger(
      signal.risk_score
    ) ||
    signal.risk_score < 0 ||
    signal.risk_score > 100
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_INVALID',
      'risk_score is invalid'
    );
  }

  assertSafeName(
    signal.subject_type,
    'subject_type',
    100
  );

  if (
    typeof signal.subject_id !==
      'string' ||
    signal.subject_id.length ===
      0 ||
    signal.subject_id.length >
      255
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_INVALID',
      'subject_id is invalid'
    );
  }

  const actorUserId =
    signal.actor_user_id ??
    null;

  const companyId =
    signal.company_id ??
    null;

  assertUuidOrNull(
    actorUserId,
    'actor_user_id'
  );

  assertUuidOrNull(
    companyId,
    'company_id'
  );

  const provider =
    signal.provider ??
    null;

  if (provider !== null) {
    assertSafeName(
      provider,
      'provider',
      50
    );
  }

  const startedAt =
    validDate(
      signal.window_started_at,
      'window_started_at'
    );

  const endedAt =
    validDate(
      signal.window_ended_at,
      'window_ended_at'
    );

  if (
    startedAt.getTime() >
    endedAt.getTime()
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_INVALID',
      'Signal window is invalid'
    );
  }

  if (
    !Number.isInteger(
      signal.observed_event_count
    ) ||
    signal.observed_event_count <
      0
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_INVALID',
      'observed_event_count is invalid'
    );
  }

  if (
    signal.enforcement_action !==
    undefined &&
    signal.enforcement_action !==
      'none'
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_ENFORCEMENT_REJECTED',
      'Fraud signal persistence cannot apply enforcement'
    );
  }

  if (
    typeof signal.dedupe_key !==
      'string' ||
    signal.dedupe_key.length ===
      0 ||
    signal.dedupe_key.length >
      255
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_INVALID',
      'dedupe_key is invalid'
    );
  }

  const metrics =
    signal.metrics || {};

  const evidence =
    signal.evidence || {};

  assertEvidence(evidence);

  return {
    signalType:
      signal.signal_type,

    ruleId:
      signal.rule_id,

    severity:
      signal.severity,

    riskScore:
      signal.risk_score,

    subjectType:
      signal.subject_type,

    subjectId:
      signal.subject_id,

    actorUserId,
    companyId,
    provider,

    windowStartedAt:
      startedAt.toISOString(),

    windowEndedAt:
      endedAt.toISOString(),

    observedEventCount:
      signal
        .observed_event_count,

    metrics:
      serializeBoundedObject(
        metrics,
        'metrics'
      ),

    evidence:
      serializeBoundedObject(
        evidence,
        'evidence'
      ),

    dedupeKey:
      signal.dedupe_key,
  };
}

async function persistFraudSignal({
  dbClient,
  signal,
}) {
  if (
    !dbClient ||
    typeof dbClient.query !==
      'function'
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_TRANSACTION_CLIENT_REQUIRED',
      'Fraud signal persistence requires a database transaction client'
    );
  }

  const normalized =
    normalizeSignal(signal);

  const result =
    await dbClient.query(
      `INSERT INTO fraud_signals (
         signal_type,
         rule_id,
         severity,
         risk_score,
         subject_type,
         subject_id,
         actor_user_id,
         company_id,
         provider,
         window_started_at,
         window_ended_at,
         observed_event_count,
         metrics,
         evidence,
         dedupe_key
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         $11, $12, $13::jsonb,
         $14::jsonb, $15
       )
       ON CONFLICT (dedupe_key)
       DO NOTHING
       RETURNING *`,
      [
        normalized.signalType,
        normalized.ruleId,
        normalized.severity,
        normalized.riskScore,
        normalized.subjectType,
        normalized.subjectId,
        normalized.actorUserId,
        normalized.companyId,
        normalized.provider,
        normalized.windowStartedAt,
        normalized.windowEndedAt,
        normalized
          .observedEventCount,
        normalized.metrics,
        normalized.evidence,
        normalized.dedupeKey,
      ]
    );

  if (
    result.rows.length === 1
  ) {
    return {
      signal:
        result.rows[0],
      created: true,
    };
  }

  const existing =
    await dbClient.query(
      `SELECT *
       FROM fraud_signals
       WHERE dedupe_key = $1`,
      [
        normalized.dedupeKey,
      ]
    );

  if (
    existing.rows.length !== 1
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_DEDUPE_RESOLUTION_FAILED',
      'Existing fraud signal could not be resolved'
    );
  }

  return {
    signal:
      existing.rows[0],
    created: false,
  };
}

async function persistFraudSignals({
  dbClient,
  evaluation,
}) {
  if (
    !evaluation ||
    !Array.isArray(
      evaluation.signals
    )
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_INVALID_EVALUATION',
      'Fraud evaluation is invalid'
    );
  }

  if (
    evaluation
      .enforcement_action !==
      'none'
  ) {
    throw fraudSignalError(
      'FRAUD_SIGNAL_ENFORCEMENT_REJECTED',
      'Only non-enforcing fraud evaluations may be persisted'
    );
  }

  const records = [];

  for (
    const signal of
      evaluation.signals
  ) {
    records.push(
      await persistFraudSignal({
        dbClient,
        signal,
      })
    );
  }

  return {
    signal_count:
      records.length,

    created_count:
      records.filter(
        record =>
          record.created
      ).length,

    existing_count:
      records.filter(
        record =>
          !record.created
      ).length,

    records,
  };
}

module.exports = {
  MAX_JSON_BYTES,
  MAX_EVIDENCE_IDS,
  normalizeSignal,
  persistFraudSignal,
  persistFraudSignals,
};
