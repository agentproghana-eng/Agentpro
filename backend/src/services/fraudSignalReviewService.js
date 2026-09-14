'use strict';

const {
  validate: uuidValidate,
} = require('uuid');

const {
  query,
} = require('../config/database');

const REVIEW_STATUSES =
  new Set([
    'reviewed',
    'dismissed',
    'escalated',
  ]);

const QUEUE_STATUSES =
  new Set([
    'open',
    'reviewed',
    'dismissed',
    'escalated',
    'all',
  ]);

const SEVERITIES =
  new Set([
    'low',
    'medium',
    'high',
    'critical',
    'all',
  ]);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function reviewError(
  statusCode,
  code,
  message
) {
  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  error.code =
    code;

  return error;
}

function normalizeLimit(
  value
) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return DEFAULT_LIMIT;
  }

  const parsed =
    Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > MAX_LIMIT
  ) {
    throw reviewError(
      400,
      'FRAUD_SIGNAL_INVALID_LIMIT',
      `limit must be between 1 and ${MAX_LIMIT}`
    );
  }

  return parsed;
}

function normalizeQueueFilters({
  status = 'open',
  severity = 'all',
  limit,
} = {}) {
  const normalizedStatus =
    String(status || 'open')
      .trim()
      .toLowerCase();

  const normalizedSeverity =
    String(severity || 'all')
      .trim()
      .toLowerCase();

  if (
    !QUEUE_STATUSES.has(
      normalizedStatus
    )
  ) {
    throw reviewError(
      400,
      'FRAUD_SIGNAL_INVALID_STATUS',
      'Fraud signal status filter is invalid'
    );
  }

  if (
    !SEVERITIES.has(
      normalizedSeverity
    )
  ) {
    throw reviewError(
      400,
      'FRAUD_SIGNAL_INVALID_SEVERITY',
      'Fraud signal severity filter is invalid'
    );
  }

  return {
    status:
      normalizedStatus,
    severity:
      normalizedSeverity,
    limit:
      normalizeLimit(limit),
  };
}

const SIGNAL_COLUMNS = `
  id,
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
  dedupe_key,
  review_status,
  reviewed_at,
  reviewed_by,
  created_at,
  updated_at
`;

async function listFraudSignals({
  status,
  severity,
  limit,
  dbQuery = query,
} = {}) {
  const filters =
    normalizeQueueFilters({
      status,
      severity,
      limit,
    });

  const conditions = [];
  const params = [];

  if (
    filters.status !==
    'all'
  ) {
    params.push(
      filters.status
    );

    conditions.push(
      `review_status = $${params.length}`
    );
  }

  if (
    filters.severity !==
    'all'
  ) {
    params.push(
      filters.severity
    );

    conditions.push(
      `severity = $${params.length}`
    );
  }

  params.push(
    filters.limit
  );

  const whereClause =
    conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

  const result =
    await dbQuery(
      `SELECT
         ${SIGNAL_COLUMNS}
       FROM fraud_signals
       ${whereClause}
       ORDER BY
         risk_score DESC,
         created_at DESC,
         id DESC
       LIMIT $${params.length}`,
      params
    );

  const rows =
    result.rows || [];

  return {
    filters,
    signals: rows,
    count:
      rows.length,
    truncated:
      rows.length >=
      filters.limit,
  };
}

function assertSignalId(
  id
) {
  if (
    typeof id !== 'string' ||
    !uuidValidate(id)
  ) {
    throw reviewError(
      400,
      'FRAUD_SIGNAL_INVALID_ID',
      'Fraud signal id is invalid'
    );
  }
}

async function getFraudSignal({
  id,
  dbQuery = query,
} = {}) {
  assertSignalId(id);

  const result =
    await dbQuery(
      `SELECT
         ${SIGNAL_COLUMNS}
       FROM fraud_signals
       WHERE id = $1
       LIMIT 1`,
      [id]
    );

  if (
    !result.rows?.length
  ) {
    throw reviewError(
      404,
      'FRAUD_SIGNAL_NOT_FOUND',
      'Fraud signal not found'
    );
  }

  return result.rows[0];
}

async function reviewFraudSignal({
  dbClient,
  id,
  status,
  reviewedBy,
} = {}) {
  if (
    !dbClient ||
    typeof dbClient.query !==
      'function'
  ) {
    throw reviewError(
      500,
      'FRAUD_SIGNAL_REVIEW_TRANSACTION_REQUIRED',
      'Fraud signal review requires a database transaction client'
    );
  }

  assertSignalId(id);

  if (
    typeof reviewedBy !==
      'string' ||
    !uuidValidate(
      reviewedBy
    )
  ) {
    throw reviewError(
      400,
      'FRAUD_SIGNAL_INVALID_REVIEWER',
      'Fraud signal reviewer is invalid'
    );
  }

  const normalizedStatus =
    String(status || '')
      .trim()
      .toLowerCase();

  if (
    !REVIEW_STATUSES.has(
      normalizedStatus
    )
  ) {
    throw reviewError(
      400,
      'FRAUD_SIGNAL_INVALID_REVIEW_STATUS',
      'Review status must be reviewed, dismissed, or escalated'
    );
  }

  const current =
    await dbClient.query(
      `SELECT
         ${SIGNAL_COLUMNS}
       FROM fraud_signals
       WHERE id = $1
       FOR UPDATE`,
      [id]
    );

  if (
    !current.rows?.length
  ) {
    throw reviewError(
      404,
      'FRAUD_SIGNAL_NOT_FOUND',
      'Fraud signal not found'
    );
  }

  const previous =
    current.rows[0];

  if (
    previous.review_status !==
    'open'
  ) {
    throw reviewError(
      409,
      'FRAUD_SIGNAL_ALREADY_REVIEWED',
      `Fraud signal is already ${previous.review_status}`
    );
  }

  const updated =
    await dbClient.query(
      `UPDATE fraud_signals
       SET
         review_status = $1,
         reviewed_at = NOW(),
         reviewed_by = $2,
         updated_at = NOW()
       WHERE id = $3
         AND review_status = 'open'
       RETURNING
         ${SIGNAL_COLUMNS}`,
      [
        normalizedStatus,
        reviewedBy,
        id,
      ]
    );

  if (
    updated.rows?.length !==
    1
  ) {
    throw reviewError(
      409,
      'FRAUD_SIGNAL_REVIEW_CONFLICT',
      'Fraud signal review state changed before the review completed'
    );
  }

  return {
    previous,
    signal:
      updated.rows[0],
  };
}

module.exports = {
  REVIEW_STATUSES,
  QUEUE_STATUSES,
  SEVERITIES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  normalizeLimit,
  normalizeQueueFilters,
  listFraudSignals,
  getFraudSignal,
  reviewFraudSignal,
};
