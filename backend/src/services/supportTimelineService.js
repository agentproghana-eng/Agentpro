'use strict';

const {
  validate: uuidValidate,
} = require('uuid');

const {
  query,
} = require('../config/database');

const SEARCH_TYPES =
  Object.freeze([
    'event_id',
    'transaction_id',
    'correlation_id',
    'user_id',
    'company_id',
    'email',
    'phone',
  ]);

const MAX_EVENTS = 200;

function supportError(
  code,
  message,
  statusCode = 422
) {
  const error =
    new Error(message);

  error.code = code;
  error.statusCode =
    statusCode;

  return error;
}

function normalizeSearch({
  type,
  value,
}) {
  const normalizedType =
    String(type || '')
      .trim()
      .toLowerCase();

  const normalizedValue =
    String(value || '')
      .trim();

  if (
    !SEARCH_TYPES.includes(
      normalizedType
    )
  ) {
    throw supportError(
      'SUPPORT_SEARCH_TYPE_INVALID',
      'Unsupported support search type'
    );
  }

  if (
    !normalizedValue ||
    normalizedValue.length > 255
  ) {
    throw supportError(
      'SUPPORT_SEARCH_VALUE_INVALID',
      'Support search value is invalid'
    );
  }

  if (
    [
      'event_id',
      'transaction_id',
      'correlation_id',
      'user_id',
      'company_id',
    ].includes(
      normalizedType
    ) &&
    !uuidValidate(
      normalizedValue
    )
  ) {
    throw supportError(
      'SUPPORT_SEARCH_UUID_INVALID',
      'A valid UUID is required for this search type'
    );
  }

  if (
    normalizedType === 'email' &&
    (
      normalizedValue.length > 255 ||
      !normalizedValue.includes('@')
    )
  ) {
    throw supportError(
      'SUPPORT_SEARCH_EMAIL_INVALID',
      'A valid email address is required'
    );
  }

  if (
    normalizedType === 'phone' &&
    !/^\+?[0-9]{8,15}$/.test(
      normalizedValue
    )
  ) {
    throw supportError(
      'SUPPORT_SEARCH_PHONE_INVALID',
      'A valid phone number is required'
    );
  }

  return {
    type: normalizedType,
    value: normalizedValue,
  };
}

function safeIdentity(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    first_name:
      row.first_name || null,
    last_name:
      row.last_name || null,
    role:
      row.role || null,
    company_id:
      row.company_id || null,
  };
}

function safeCompany(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name:
      row.name || null,
    status:
      row.status || null,
  };
}

function safeEvent(row) {
  return {
    id: row.id,
    event_name:
      row.event_name,
    event_version:
      row.event_version,
    source:
      row.source,
    actor_user_id:
      row.actor_user_id,
    company_id:
      row.company_id,
    subject_type:
      row.subject_type,
    subject_id:
      row.subject_id,
    correlation_id:
      row.correlation_id,
    causation_event_id:
      row.causation_event_id,
    attributes:
      row.attributes || {},
    occurred_at:
      row.occurred_at,
    recorded_at:
      row.recorded_at,
  };
}

function uniqueNonEmpty(values) {
  return [
    ...new Set(
      values.filter(Boolean)
    ),
  ];
}

function buildCaseSummary(events) {
  const safeEvents =
    Array.isArray(events)
      ? events
      : [];

  if (!safeEvents.length) {
    return {
      event_count: 0,
      failed_count: 0,
      pending_confirmation_count: 0,
      outcome: 'unknown',
      provider: null,
      transaction_type: null,
      first_event_at: null,
      last_event_at: null,
      transaction_ids: [],
      correlation_ids: [],
      user_ids: [],
      company_ids: [],
    };
  }

  const transactionEvents =
    safeEvents.filter(
      event =>
        event.subject_type ===
          'transaction' ||
        event.subject_type ===
          'personal_transaction'
    );

  const failedEvents =
    safeEvents.filter(
      event =>
        event.event_name ===
        'transaction.failed'
    );

  const pendingEvents =
    safeEvents.filter(
      event =>
        event.event_name ===
        'transaction.pending_confirmation'
    );

  const completedEvents =
    safeEvents.filter(
      event =>
        event.event_name ===
        'transaction.completed'
    );

  const latestTransactionEvent =
    [...transactionEvents]
      .reverse()
      .find(Boolean) ||
    [...safeEvents]
      .reverse()
      .find(Boolean);

  const latestTerminalEvent =
    [...safeEvents]
      .reverse()
      .find(
        event =>
          [
            'transaction.completed',
            'transaction.failed',
            'transaction.pending_confirmation',
          ].includes(
            event.event_name
          )
      );

  const outcomeByEventName = {
    'transaction.completed':
      'completed',
    'transaction.failed':
      'failed',
    'transaction.pending_confirmation':
      'pending_confirmation',
  };

  const outcome =
    latestTerminalEvent
      ? outcomeByEventName[
          latestTerminalEvent
            .event_name
        ] || 'unknown'
      : 'in_progress';

  return {
    event_count:
      safeEvents.length,

    failed_count:
      failedEvents.length,

    pending_confirmation_count:
      pendingEvents.length,

    outcome,

    provider:
      latestTransactionEvent
        ?.attributes
        ?.provider ||
      null,

    transaction_type:
      latestTransactionEvent
        ?.attributes
        ?.transaction_type ||
      null,

    first_event_at:
      safeEvents[0]
        ?.occurred_at ||
      null,

    last_event_at:
      safeEvents[
        safeEvents.length - 1
      ]?.occurred_at ||
      null,

    transaction_ids:
      uniqueNonEmpty(
        transactionEvents.map(
          event =>
            event.subject_id
        )
      ),

    correlation_ids:
      uniqueNonEmpty(
        safeEvents.map(
          event =>
            event.correlation_id
        )
      ),

    user_ids:
      uniqueNonEmpty(
        safeEvents.map(
          event =>
            event.actor_user_id
        )
      ),

    company_ids:
      uniqueNonEmpty(
        safeEvents.map(
          event =>
            event.company_id
        )
      ),
  };
}

async function resolveUsers(
  dbQuery,
  type,
  value
) {
  if (
    type === 'user_id'
  ) {
    const result =
      await dbQuery(
        `SELECT
           id,
           first_name,
           last_name,
           role,
           company_id
         FROM users
         WHERE id = $1
         LIMIT 1`,
        [value]
      );

    return result.rows || [];
  }

  if (
    type === 'email'
  ) {
    const result =
      await dbQuery(
        `SELECT
           id,
           first_name,
           last_name,
           role,
           company_id
         FROM users
         WHERE LOWER(email) =
           LOWER($1)
         LIMIT 10`,
        [value]
      );

    return result.rows || [];
  }

  if (
    type === 'phone'
  ) {
    const result =
      await dbQuery(
        `SELECT
           id,
           first_name,
           last_name,
           role,
           company_id
         FROM users
         WHERE phone = $1
         LIMIT 10`,
        [value]
      );

    return result.rows || [];
  }

  return [];
}

async function resolveCompany(
  dbQuery,
  companyId
) {
  const result =
    await dbQuery(
      `SELECT
         id,
         name,
         status
       FROM companies
       WHERE id = $1
       LIMIT 1`,
      [companyId]
    );

  return (
    result.rows?.[0] ||
    null
  );
}

async function eventsByCorrelationIds(
  dbQuery,
  ids
) {
  if (!ids.length) {
    return [];
  }

  const result =
    await dbQuery(
      `SELECT
         id,
         event_name,
         event_version,
         source,
         actor_user_id,
         company_id,
         subject_type,
         subject_id,
         correlation_id,
         causation_event_id,
         attributes,
         occurred_at,
         recorded_at
       FROM operational_events
       WHERE correlation_id =
         ANY($1::uuid[])
       ORDER BY
         occurred_at ASC,
         id ASC
       LIMIT $2`,
      [
        ids,
        MAX_EVENTS,
      ]
    );

  return (
    result.rows || []
  );
}

async function searchSupportTimeline({
  type,
  value,
  dbQuery = query,
} = {}) {
  const search =
    normalizeSearch({
      type,
      value,
    });

  let identities = [];
  let company = null;
  let rows = [];

  if (
    [
      'user_id',
      'email',
      'phone',
    ].includes(
      search.type
    )
  ) {
    identities =
      await resolveUsers(
        dbQuery,
        search.type,
        search.value
      );

    if (!identities.length) {
      return {
        search_type:
          search.type,
        identities: [],
        company: null,
        events: [],
        case_summary:
          buildCaseSummary([]),
        truncated: false,
      };
    }

    const userIds =
      identities.map(
        (item) => item.id
      );

    const result =
      await dbQuery(
        `SELECT *
         FROM (
           SELECT
             id,
             event_name,
             event_version,
             source,
             actor_user_id,
             company_id,
             subject_type,
             subject_id,
             correlation_id,
             causation_event_id,
             attributes,
             occurred_at,
             recorded_at
           FROM operational_events
           WHERE actor_user_id =
             ANY($1::uuid[])
           ORDER BY
             occurred_at DESC,
             id DESC
           LIMIT $2
         ) recent
         ORDER BY
           occurred_at ASC,
           id ASC`,
        [
          userIds,
          MAX_EVENTS,
        ]
      );

    rows =
      result.rows || [];
  } else if (
    search.type ===
      'company_id'
  ) {
    company =
      await resolveCompany(
        dbQuery,
        search.value
      );

    const result =
      await dbQuery(
        `SELECT *
         FROM (
           SELECT
             id,
             event_name,
             event_version,
             source,
             actor_user_id,
             company_id,
             subject_type,
             subject_id,
             correlation_id,
             causation_event_id,
             attributes,
             occurred_at,
             recorded_at
           FROM operational_events
           WHERE company_id = $1
           ORDER BY
             occurred_at DESC,
             id DESC
           LIMIT $2
         ) recent
         ORDER BY
           occurred_at ASC,
           id ASC`,
        [
          search.value,
          MAX_EVENTS,
        ]
      );

    rows =
      result.rows || [];
  } else if (
    search.type ===
      'correlation_id'
  ) {
    rows =
      await eventsByCorrelationIds(
        dbQuery,
        [search.value]
      );
  } else if (
    search.type ===
      'event_id'
  ) {
    const seed =
      await dbQuery(
        `SELECT correlation_id
         FROM operational_events
         WHERE id = $1
         LIMIT 1`,
        [search.value]
      );

    const correlationId =
      seed.rows?.[0]
        ?.correlation_id;

    rows =
      correlationId
        ? await eventsByCorrelationIds(
            dbQuery,
            [correlationId]
          )
        : [];
  } else if (
    search.type ===
      'transaction_id'
  ) {
    const seed =
      await dbQuery(
        `SELECT DISTINCT
           correlation_id
         FROM operational_events
         WHERE subject_type IN (
           'transaction',
           'personal_transaction'
         )
           AND subject_id = $1
         LIMIT 10`,
        [search.value]
      );

    const correlationIds =
      (seed.rows || [])
        .map(
          (item) =>
            item.correlation_id
        )
        .filter(Boolean);

    rows =
      await eventsByCorrelationIds(
        dbQuery,
        correlationIds
      );
  }

  return {
    search_type:
      search.type,

    identities:
      identities.map(
        safeIdentity
      ),

    company:
      safeCompany(company),

    events:
      rows.map(
        safeEvent
      ),

    truncated:
      rows.length >=
      MAX_EVENTS,
  };
}

module.exports = {
  SEARCH_TYPES,
  MAX_EVENTS,
  normalizeSearch,
  safeEvent,
  buildCaseSummary,
  searchSupportTimeline,
};
