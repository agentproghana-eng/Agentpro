'use strict';

const {
  validate: uuidValidate,
} = require('uuid');

const {
  query,
} = require('../config/database');

const {
  encodeFeedCursor,
  decodeFeedCursor,
  InvalidFeedCursorError,
} = require('../utils/feedCursor');

const CASE_TYPES = new Set([
  'complaint',
  'feedback',
  'suggestion',
]);

const CASE_STATUSES = new Set([
  'open',
  'in_progress',
  'resolved',
  'closed',
]);

const CASE_PRIORITIES = new Set([
  'low',
  'normal',
  'high',
  'urgent',
]);

function supportCaseError(
  code,
  message,
  statusCode = 422
) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function executor(dbClient) {
  if (
    dbClient &&
    typeof dbClient.query === 'function'
  ) {
    return dbClient.query.bind(dbClient);
  }

  return query;
}

function formatReference(caseNumber) {
  const value = Number.parseInt(
    String(caseNumber),
    10
  );

  if (
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    return null;
  }

  return `AP-${String(value).padStart(7, '0')}`;
}

function serializeCase(row) {
  if (!row) return null;

  const {
    case_number,
    ...rest
  } = row;

  return {
    ...rest,
    reference: formatReference(case_number),
  };
}

function safeHeader(value, maxLength) {
  const normalized = String(value || '').trim();

  return normalized
    ? normalized.slice(0, maxLength)
    : null;
}

function normalizeType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (!CASE_TYPES.has(normalized)) {
    throw supportCaseError(
      'SUPPORT_CASE_TYPE_INVALID',
      'Choose Complaint, Feedback, or Suggestion.'
    );
  }

  return normalized;
}

function normalizeOptionalStatus(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (!normalized) return null;

  if (!CASE_STATUSES.has(normalized)) {
    throw supportCaseError(
      'SUPPORT_CASE_STATUS_INVALID',
      'Invalid support case status.'
    );
  }

  return normalized;
}

function normalizeOptionalPriority(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (!normalized) return null;

  if (!CASE_PRIORITIES.has(normalized)) {
    throw supportCaseError(
      'SUPPORT_CASE_PRIORITY_INVALID',
      'Invalid support case priority.'
    );
  }

  return normalized;
}

function boundedLimit(value, fallback = 50, max = 100) {
  const parsed = Number.parseInt(
    String(value || fallback),
    10
  );

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, parsed));
}

function parseCursor(raw) {
  if (!raw) return null;

  let decoded;

  try {
    decoded = decodeFeedCursor(raw);
  } catch (error) {
    if (error instanceof InvalidFeedCursorError) {
      throw supportCaseError(
        'SUPPORT_CASE_CURSOR_INVALID',
        'Invalid support case cursor.'
      );
    }

    throw error;
  }

  const createdAt = new Date(decoded?.created_at);
  const id = String(decoded?.id || '');

  if (
    Number.isNaN(createdAt.getTime()) ||
    !uuidValidate(id)
  ) {
    throw supportCaseError(
      'SUPPORT_CASE_CURSOR_INVALID',
      'Invalid support case cursor.'
    );
  }

  return {
    created_at: createdAt.toISOString(),
    id,
  };
}

async function createSupportCase({
  requesterUserId,
  companyId,
  type,
  subject,
  message,
  source = 'mobile',
  appVersion = null,
  appBuild = null,
  platform = null,
  sourceCommit = null,
}) {
  const normalizedType = normalizeType(type);
  const normalizedSubject = String(subject || '').trim();
  const normalizedMessage = String(message || '').trim();

  if (
    normalizedSubject.length < 3 ||
    normalizedSubject.length > 120
  ) {
    throw supportCaseError(
      'SUPPORT_CASE_SUBJECT_INVALID',
      'Subject must be between 3 and 120 characters.'
    );
  }

  if (
    normalizedMessage.length < 10 ||
    normalizedMessage.length > 4000
  ) {
    throw supportCaseError(
      'SUPPORT_CASE_MESSAGE_INVALID',
      'Message must be between 10 and 4000 characters.'
    );
  }

  const result = await query(
    `INSERT INTO support_cases (
       requester_user_id,
       company_id,
       type,
       subject,
       initial_message,
       source,
       app_version,
       app_build,
       platform,
       source_commit
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10
     )
     RETURNING
       id,
       case_number,
       requester_user_id,
       company_id,
       type,
       subject,
       initial_message,
       status,
       priority,
       source,
       app_version,
       app_build,
       platform,
       source_commit,
       created_at,
       updated_at,
       resolved_at`,
    [
      requesterUserId,
      companyId || null,
      normalizedType,
      normalizedSubject,
      normalizedMessage,
      safeHeader(source, 20) || 'mobile',
      safeHeader(appVersion, 40),
      safeHeader(appBuild, 40),
      safeHeader(platform, 40),
      safeHeader(sourceCommit, 80),
    ]
  );

  return serializeCase(result.rows[0]);
}

async function listOwnSupportCases({
  requesterUserId,
}) {
  const result = await query(
    `SELECT
       sc.id,
       sc.case_number,
       sc.type,
       sc.subject,
       sc.status,
       sc.priority,
       sc.created_at,
       sc.updated_at,
       sc.resolved_at,
       latest.body AS latest_reply,
       latest.created_at AS latest_reply_at
     FROM support_cases sc
     LEFT JOIN LATERAL (
       SELECT
         scm.body,
         scm.created_at
       FROM support_case_messages scm
       WHERE scm.case_id = sc.id
         AND scm.author_role = 'admin'
         AND scm.visible_to_requester = TRUE
       ORDER BY scm.created_at DESC, scm.id DESC
       LIMIT 1
     ) latest ON TRUE
     WHERE sc.requester_user_id = $1
     ORDER BY sc.created_at DESC, sc.id DESC
     LIMIT 50`,
    [requesterUserId]
  );

  return result.rows.map(serializeCase);
}

async function getOwnSupportCase({
  requesterUserId,
  caseId,
}) {
  if (!uuidValidate(String(caseId || ''))) {
    throw supportCaseError(
      'SUPPORT_CASE_ID_INVALID',
      'Invalid support case.'
    );
  }

  const caseResult = await query(
    `SELECT
       id,
       case_number,
       requester_user_id,
       company_id,
       type,
       subject,
       initial_message,
       status,
       priority,
       created_at,
       updated_at,
       resolved_at
     FROM support_cases
     WHERE id = $1
       AND requester_user_id = $2
     LIMIT 1`,
    [caseId, requesterUserId]
  );

  if (!caseResult.rows.length) {
    throw supportCaseError(
      'SUPPORT_CASE_NOT_FOUND',
      'Support case not found.',
      404
    );
  }

  const messages = await query(
    `SELECT
       id,
       author_role,
       body,
       created_at
     FROM support_case_messages
     WHERE case_id = $1
       AND visible_to_requester = TRUE
     ORDER BY created_at ASC, id ASC`,
    [caseId]
  );

  return {
    case: serializeCase(caseResult.rows[0]),
    messages: messages.rows,
  };
}

async function listAdminSupportCases({
  status = 'open',
  type = 'all',
  priority = 'all',
  cursor = null,
  limit = 50,
}) {
  const normalizedStatus = String(status || 'open')
    .trim()
    .toLowerCase();

  const normalizedType = String(type || 'all')
    .trim()
    .toLowerCase();

  const normalizedPriority = String(priority || 'all')
    .trim()
    .toLowerCase();

  if (
    normalizedStatus !== 'all' &&
    !CASE_STATUSES.has(normalizedStatus)
  ) {
    throw supportCaseError(
      'SUPPORT_CASE_STATUS_INVALID',
      'Invalid support case status.'
    );
  }

  if (
    normalizedType !== 'all' &&
    !CASE_TYPES.has(normalizedType)
  ) {
    throw supportCaseError(
      'SUPPORT_CASE_TYPE_INVALID',
      'Invalid support case type.'
    );
  }

  if (
    normalizedPriority !== 'all' &&
    !CASE_PRIORITIES.has(normalizedPriority)
  ) {
    throw supportCaseError(
      'SUPPORT_CASE_PRIORITY_INVALID',
      'Invalid support case priority.'
    );
  }

  const decodedCursor = parseCursor(cursor);
  const params = [];
  const conditions = [];

  if (normalizedStatus !== 'all') {
    params.push(normalizedStatus);
    conditions.push(`sc.status = $${params.length}`);
  }

  if (normalizedType !== 'all') {
    params.push(normalizedType);
    conditions.push(`sc.type = $${params.length}`);
  }

  if (normalizedPriority !== 'all') {
    params.push(normalizedPriority);
    conditions.push(`sc.priority = $${params.length}`);
  }

  if (decodedCursor) {
    params.push(decodedCursor.created_at);
    const createdIndex = params.length;

    params.push(decodedCursor.id);
    const idIndex = params.length;

    conditions.push(
      `(sc.created_at, sc.id) < ` +
      `($${createdIndex}::timestamptz, $${idIndex}::uuid)`
    );
  }

  const pageSize = boundedLimit(limit);
  params.push(pageSize + 1);

  const where = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const result = await query(
    `SELECT
       sc.id,
       sc.case_number,
       sc.requester_user_id,
       sc.company_id,
       sc.type,
       sc.subject,
       sc.status,
       sc.priority,
       sc.created_at,
       sc.updated_at,
       sc.resolved_at,
       TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS requester_name,
       u.email AS requester_email,
       u.phone AS requester_phone,
       c.name AS company_name
     FROM support_cases sc
     LEFT JOIN users u
       ON u.id = sc.requester_user_id
     LEFT JOIN companies c
       ON c.id = sc.company_id
     ${where}
     ORDER BY sc.created_at DESC, sc.id DESC
     LIMIT $${params.length}`,
    params
  );

  const hasMore = result.rows.length > pageSize;
  const rows = hasMore
    ? result.rows.slice(0, pageSize)
    : result.rows;

  const last = rows[rows.length - 1];

  return {
    cases: rows.map(serializeCase),
    next_cursor:
      hasMore && last
        ? encodeFeedCursor({
            created_at: new Date(last.created_at).toISOString(),
            id: last.id,
          })
        : null,
  };
}

async function getAdminSupportCase({
  caseId,
  dbClient = null,
  forUpdate = false,
}) {
  if (!uuidValidate(String(caseId || ''))) {
    throw supportCaseError(
      'SUPPORT_CASE_ID_INVALID',
      'Invalid support case.'
    );
  }

  const execute = executor(dbClient);

  const caseResult = await execute(
    `SELECT
       sc.id,
       sc.case_number,
       sc.requester_user_id,
       sc.company_id,
       sc.type,
       sc.subject,
       sc.initial_message,
       sc.status,
       sc.priority,
       sc.source,
       sc.app_version,
       sc.app_build,
       sc.platform,
       sc.source_commit,
       sc.created_at,
       sc.updated_at,
       sc.resolved_at,
       TRIM(CONCAT_WS(' ', u.first_name, u.last_name)) AS requester_name,
       u.email AS requester_email,
       u.phone AS requester_phone,
       c.name AS company_name
     FROM support_cases sc
     LEFT JOIN users u
       ON u.id = sc.requester_user_id
     LEFT JOIN companies c
       ON c.id = sc.company_id
     WHERE sc.id = $1
     LIMIT 1
     ${forUpdate ? 'FOR UPDATE OF sc' : ''}`,
    [caseId]
  );

  if (!caseResult.rows.length) {
    throw supportCaseError(
      'SUPPORT_CASE_NOT_FOUND',
      'Support case not found.',
      404
    );
  }

  const messages = await execute(
    `SELECT
       id,
       author_user_id,
       author_role,
       body,
       visible_to_requester,
       created_at
     FROM support_case_messages
     WHERE case_id = $1
     ORDER BY created_at ASC, id ASC`,
    [caseId]
  );

  return {
    case: serializeCase(caseResult.rows[0]),
    messages: messages.rows,
  };
}

async function updateAdminSupportCase({
  caseId,
  status,
  priority,
  dbClient,
}) {
  const execute = executor(dbClient);

  const current = await getAdminSupportCase({
    caseId,
    dbClient,
    forUpdate: true,
  });

  const nextStatus =
    normalizeOptionalStatus(status) ||
    current.case.status;

  const nextPriority =
    normalizeOptionalPriority(priority) ||
    current.case.priority;

  if (
    !status &&
    !priority
  ) {
    throw supportCaseError(
      'SUPPORT_CASE_UPDATE_EMPTY',
      'Choose a status or priority to update.'
    );
  }

  const result = await execute(
    `UPDATE support_cases
     SET
       status = $2,
       priority = $3,
       updated_at = NOW(),
       resolved_at = CASE
         WHEN $2 IN ('resolved', 'closed')
           THEN COALESCE(resolved_at, NOW())
         ELSE NULL
       END
     WHERE id = $1
     RETURNING
       id,
       case_number,
       requester_user_id,
       company_id,
       type,
       subject,
       initial_message,
       status,
       priority,
       source,
       app_version,
       app_build,
       platform,
       source_commit,
       created_at,
       updated_at,
       resolved_at`,
    [caseId, nextStatus, nextPriority]
  );

  return {
    previous: current.case,
    case: serializeCase(result.rows[0]),
  };
}

async function addAdminSupportReply({
  caseId,
  adminUserId,
  body,
  dbClient,
}) {
  const execute = executor(dbClient);
  const message = String(body || '').trim();

  if (
    message.length < 2 ||
    message.length > 4000
  ) {
    throw supportCaseError(
      'SUPPORT_CASE_REPLY_INVALID',
      'Reply must be between 2 and 4000 characters.'
    );
  }

  const current = await getAdminSupportCase({
    caseId,
    dbClient,
    forUpdate: true,
  });

  if (current.case.status === 'closed') {
    throw supportCaseError(
      'SUPPORT_CASE_CLOSED',
      'Reopen this support case before replying.',
      409
    );
  }

  const inserted = await execute(
    `INSERT INTO support_case_messages (
       case_id,
       author_user_id,
       author_role,
       body,
       visible_to_requester
     ) VALUES (
       $1,
       $2,
       'admin',
       $3,
       TRUE
     )
     RETURNING
       id,
       case_id,
       author_user_id,
       author_role,
       body,
       visible_to_requester,
       created_at`,
    [caseId, adminUserId, message]
  );

  const nextStatus =
    current.case.status === 'open'
      ? 'in_progress'
      : current.case.status;

  await execute(
    `UPDATE support_cases
     SET
       status = $2,
       updated_at = NOW()
     WHERE id = $1`,
    [caseId, nextStatus]
  );

  return {
    case: {
      ...current.case,
      status: nextStatus,
    },
    message: inserted.rows[0],
  };
}

module.exports = {
  formatReference,
  createSupportCase,
  listOwnSupportCases,
  getOwnSupportCase,
  listAdminSupportCases,
  getAdminSupportCase,
  updateAdminSupportCase,
  addAdminSupportReply,
};
