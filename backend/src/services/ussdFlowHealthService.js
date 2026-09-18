'use strict';

const {
  validate: uuidValidate,
} = require('uuid');

const {
  query,
} = require('../config/database');

const HEALTH_EVENTS =
  new Set([
    'mismatch',
    'healthy',
  ]);

function flowHealthError(
  code,
  message
) {
  const error =
    new Error(message);

  error.code = code;

  return error;
}

function normalizeOptionalBuild(
  value
) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return null;
  }

  const parsed =
    Number.parseInt(
      String(value).trim(),
      10
    );

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return null;
  }

  return parsed;
}

function normalizeOptionalCommit(
  value
) {
  const normalized =
    String(value || '')
      .trim()
      .toLowerCase();

  if (!normalized) {
    return null;
  }

  if (
    normalized ===
      'development' ||
    /^[0-9a-f]{7,64}$/.test(
      normalized
    )
  ) {
    return normalized;
  }

  return null;
}

function normalizeFlowHealthSignal(
  payload
) {
  if (
    payload === null ||
    payload === undefined
  ) {
    return null;
  }

  if (
    typeof payload !== 'object' ||
    Array.isArray(payload)
  ) {
    throw flowHealthError(
      'FLOW_HEALTH_INVALID_PAYLOAD',
      'Flow health payload is invalid'
    );
  }

  const flowId =
    String(
      payload.flow_id || ''
    ).trim();

  const event =
    String(
      payload.event || ''
    )
      .trim()
      .toLowerCase();

  const stepCount =
    Number(
      payload.step_count
    );

  if (
    !uuidValidate(flowId) ||
    !HEALTH_EVENTS.has(event) ||
    !Number.isInteger(stepCount) ||
    stepCount < 1 ||
    stepCount > 64
  ) {
    throw flowHealthError(
      'FLOW_HEALTH_INVALID_PAYLOAD',
      'Flow health metadata is invalid'
    );
  }

  let mismatchStepIndex =
    null;

  if (event === 'mismatch') {
    mismatchStepIndex =
      Number(
        payload
          .mismatch_step_index
      );

    // currentStepIndex may equal stepCount when every configured
    // step has already run but the provider presents one unexpected
    // trailing screen. Preserve that useful "after final step" signal.
    if (
      !Number.isInteger(
        mismatchStepIndex
      ) ||
      mismatchStepIndex < 0 ||
      mismatchStepIndex >
        stepCount
    ) {
      throw flowHealthError(
        'FLOW_HEALTH_INVALID_PAYLOAD',
        'Flow mismatch step is invalid'
      );
    }
  }

  return {
    flowId,
    event,
    stepCount,
    mismatchStepIndex,
  };
}

async function resolveEligibleFlow({
  signal,
  mode,
  userId,
  companyId,
  businessSimRole,
  provider,
  transactionType,
  queryFn,
}) {
  const result =
    await queryFn(
      `SELECT
         f.id,
         f.provider,
         f.transaction_type,
         f.company_id,
         f.owner_user_id,
         f.business_sim_role,
         f.is_active,
         (
           SELECT
             COUNT(*)::integer
           FROM ussd_flow_steps s
           WHERE s.flow_id = f.id
         ) AS actual_step_count
       FROM ussd_flows f
       WHERE f.id = $1
         AND f.is_active = TRUE
       LIMIT 1`,
      [
        signal.flowId,
      ]
    );

  const flow =
    result.rows?.[0];

  if (!flow) {
    throw flowHealthError(
      'FLOW_HEALTH_FLOW_NOT_FOUND',
      'Flow health source is not active'
    );
  }

  if (
    String(flow.provider) !==
      String(provider) ||
    String(
      flow.transaction_type
    ) !==
      String(transactionType)
  ) {
    throw flowHealthError(
      'FLOW_HEALTH_FLOW_SCOPE_MISMATCH',
      'Flow health source does not match the transaction'
    );
  }

  let allowed = false;

  if (mode === 'personal') {
    allowed =
      flow.company_id === null &&
      flow.business_sim_role ===
        null &&
      (
        flow.owner_user_id ===
          null ||
        String(
          flow.owner_user_id
        ) === String(userId)
      );
  }

  if (mode === 'business') {
    const normalizedRole =
      String(
        businessSimRole || ''
      )
        .trim()
        .toLowerCase();

    allowed =
      Boolean(companyId) &&
      flow.owner_user_id ===
        null &&
      String(
        flow.business_sim_role ||
          ''
      )
        .trim()
        .toLowerCase() ===
        normalizedRole &&
      (
        flow.company_id ===
          null ||
        String(
          flow.company_id
        ) === String(companyId)
      );
  }

  if (!allowed) {
    throw flowHealthError(
      'FLOW_HEALTH_FLOW_SCOPE_MISMATCH',
      'Flow health source is outside the transaction scope'
    );
  }

  if (
    Number(
      flow.actual_step_count
    ) !== signal.stepCount
  ) {
    // This usually means an administrator already changed the
    // configuration between device resolution and completion.
    // Do not raise a stale alert against the newer configuration.
    throw flowHealthError(
      'FLOW_HEALTH_STALE_STEP_COUNT',
      'Flow health report does not match the current flow version'
    );
  }

  return flow;
}

async function recordUssdFlowHealthSignal({
  payload,
  transactionId,
  mode,
  userId,
  companyId = null,
  businessSimRole = null,
  provider,
  transactionType,
  completionStatus,
  appBuild = null,
  sourceCommit = null,
  queryFn = query,
}) {
  const signal =
    normalizeFlowHealthSignal(
      payload
    );

  if (!signal) {
    return {
      ignored: true,
      reason:
        'no_flow_health_signal',
    };
  }

  if (
    !uuidValidate(
      String(
        transactionId || ''
      )
    )
  ) {
    throw flowHealthError(
      'FLOW_HEALTH_INVALID_TRANSACTION',
      'Flow health transaction is invalid'
    );
  }

  if (
    signal.event ===
      'mismatch' &&
    completionStatus !==
      'pending_confirmation'
  ) {
    throw flowHealthError(
      'FLOW_HEALTH_INVALID_OUTCOME',
      'Flow mismatch requires an unconfirmed transaction outcome'
    );
  }

  const flow =
    await resolveEligibleFlow({
      signal,
      mode,
      userId,
      companyId,
      businessSimRole,
      provider,
      transactionType,
      queryFn,
    });

  if (
    signal.event ===
      'healthy'
  ) {
    const recovered =
      await queryFn(
        `UPDATE
           ussd_flow_health_incidents
         SET
           status = 'recovered',
           recovered_at = NOW(),
           updated_at = NOW()
         WHERE flow_id = $1
           AND status = 'open'
         RETURNING
           id::text,
           flow_id,
           recovered_at`,
        [
          flow.id,
        ]
      );

    return {
      ignored: false,
      event:
        'healthy',
      recovered:
        recovered.rows || [],
    };
  }

  const normalizedBuild =
    normalizeOptionalBuild(
      appBuild
    );

  const normalizedCommit =
    normalizeOptionalCommit(
      sourceCommit
    );

  const result =
    await queryFn(
      `INSERT INTO
         ussd_flow_health_incidents (
           flow_id,
           mismatch_step_index,
           step_count,
           status,
           first_detected_at,
           last_detected_at,
           occurrence_count,
           last_transaction_id,
           last_app_build,
           last_source_commit,
           updated_at
         )
       VALUES (
         $1,
         $2,
         $3,
         'open',
         NOW(),
         NOW(),
         1,
         $4,
         $5,
         $6,
         NOW()
       )
       ON CONFLICT (
         flow_id,
         mismatch_step_index
       )
       WHERE status = 'open'
       DO UPDATE SET
         step_count =
           EXCLUDED.step_count,

         last_detected_at =
           CASE
             WHEN
               ussd_flow_health_incidents
                 .last_transaction_id =
               EXCLUDED.last_transaction_id
             THEN
               ussd_flow_health_incidents
                 .last_detected_at
             ELSE NOW()
           END,

         occurrence_count =
           ussd_flow_health_incidents
             .occurrence_count +
           CASE
             WHEN
               ussd_flow_health_incidents
                 .last_transaction_id =
               EXCLUDED.last_transaction_id
             THEN 0
             ELSE 1
           END,

         last_transaction_id =
           EXCLUDED
             .last_transaction_id,

         last_app_build =
           COALESCE(
             EXCLUDED.last_app_build,
             ussd_flow_health_incidents
               .last_app_build
           ),

         last_source_commit =
           COALESCE(
             EXCLUDED
               .last_source_commit,
             ussd_flow_health_incidents
               .last_source_commit
           ),

         updated_at =
           NOW()

       RETURNING
         id::text,
         flow_id,
         mismatch_step_index,
         step_count,
         status,
         first_detected_at,
         last_detected_at,
         occurrence_count,
         last_app_build,
         last_source_commit`,
      [
        flow.id,
        signal
          .mismatchStepIndex,
        signal.stepCount,
        transactionId,
        normalizedBuild,
        normalizedCommit,
      ]
    );

  return {
    ignored: false,
    event:
      'mismatch',
    incident:
      result.rows[0],
  };
}

async function listOpenUssdFlowHealthIncidents({
  limit = 50,
  queryFn = query,
} = {}) {
  const parsed =
    Number.parseInt(
      String(limit),
      10
    );

  const boundedLimit =
    Number.isInteger(parsed)
      ? Math.min(
          Math.max(
            parsed,
            1
          ),
          100
        )
      : 50;

  const result =
    await queryFn(
      `SELECT
         i.id::text,
         i.flow_id,
         i.mismatch_step_index,
         i.step_count,
         i.status,
         i.first_detected_at,
         i.last_detected_at,
         i.occurrence_count,
         i.last_app_build,
         i.last_source_commit,

         f.provider,
         f.transaction_type,
         f.bundle_category,
         f.recipient_mode,
         f.business_sim_role,

         CASE
           WHEN
             f.owner_user_id IS NULL
             AND f.company_id IS NULL
             AND f.business_sim_role IS NULL
             THEN 'global_personal'

           WHEN
             f.owner_user_id IS NOT NULL
             AND f.company_id IS NULL
             THEN 'personal_override'

           WHEN
             f.owner_user_id IS NULL
             AND f.company_id IS NULL
             AND f.business_sim_role IS NOT NULL
             THEN 'global_business'

           WHEN
             f.company_id IS NOT NULL
             THEN 'company'

           ELSE 'other'
         END AS flow_scope,

         step.step_order
           AS configured_step_order,

         step.match_all
           AS step_match_all,

         step.action::text
           AS step_action,

         step.action_value
           AS step_action_value

       FROM
         ussd_flow_health_incidents i

       INNER JOIN
         ussd_flows f
           ON f.id = i.flow_id

       LEFT JOIN LATERAL (
         SELECT
           s.step_order,
           s.match_all,
           s.action,
           s.action_value
         FROM ussd_flow_steps s
         WHERE s.flow_id = f.id
         ORDER BY
           s.step_order
         LIMIT 1
         OFFSET
           i.mismatch_step_index
       ) step
         ON TRUE

       WHERE
         i.status = 'open'

       ORDER BY
         i.last_detected_at DESC,
         i.id DESC

       LIMIT $1`,
      [
        boundedLimit,
      ]
    );

  return result.rows || [];
}

async function dismissUssdFlowHealthIncident({
  incidentId,
  dismissedBy,
  queryFn = query,
}) {
  const parsedId =
    Number.parseInt(
      String(incidentId),
      10
    );

  if (
    !Number.isInteger(
      parsedId
    ) ||
    parsedId <= 0 ||
    !uuidValidate(
      String(
        dismissedBy || ''
      )
    )
  ) {
    throw flowHealthError(
      'FLOW_HEALTH_INVALID_DISMISSAL',
      'Flow health dismissal is invalid'
    );
  }

  const result =
    await queryFn(
      `UPDATE
         ussd_flow_health_incidents
       SET
         status = 'dismissed',
         dismissed_at = NOW(),
         dismissed_by = $2,
         updated_at = NOW()
       WHERE id = $1
         AND status = 'open'
       RETURNING
         id::text,
         flow_id,
         status,
         dismissed_at`,
      [
        parsedId,
        dismissedBy,
      ]
    );

  return (
    result.rows?.[0] ||
    null
  );
}

module.exports = {
  HEALTH_EVENTS,
  normalizeFlowHealthSignal,
  recordUssdFlowHealthSignal,
  listOpenUssdFlowHealthIncidents,
  dismissUssdFlowHealthIncident,
};
