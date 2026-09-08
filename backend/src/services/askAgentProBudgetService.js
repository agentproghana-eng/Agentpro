const { randomUUID } = require('crypto');

const {
  query,
  withTransaction,
} = require('../config/database');

const DEFAULT_PERSONAL_BUDGET_GHS = 0.50;
const DEFAULT_BUSINESS_BUDGET_GHS = 1.00;
const DEFAULT_RESERVATION_GHS = 0.05;

const RESERVATION_SECONDS = 180;

function nonNegativeEnv(name, fallback) {
  const raw = process.env[name];

  if (
    raw === undefined ||
    raw === null ||
    raw === ''
  ) {
    return fallback;
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) &&
    parsed >= 0
    ? parsed
    : fallback;
}

function budgetLimitGhs(mode) {
  if (mode === 'personal') {
    return nonNegativeEnv(
      'ASK_AGENTPRO_PERSONAL_BUDGET_GHS',
      DEFAULT_PERSONAL_BUDGET_GHS,
    );
  }

  if (mode === 'business') {
    return nonNegativeEnv(
      'ASK_AGENTPRO_BUSINESS_BUDGET_GHS',
      DEFAULT_BUSINESS_BUDGET_GHS,
    );
  }

  return 0;
}

function reservationGhs() {
  return nonNegativeEnv(
    'ASK_AGENTPRO_FULL_RESERVATION_GHS',
    DEFAULT_RESERVATION_GHS,
  );
}

function periodStartUtc(now = new Date()) {
  return [
    now.getUTCFullYear(),
    String(
      now.getUTCMonth() + 1,
    ).padStart(2, '0'),
    '01',
  ].join('-');
}

async function resolveUsageScope(
  user,
  mode,
) {
  if (
    !user ||
    !user.id ||
    !['personal', 'business'].includes(mode)
  ) {
    return {
      ok: false,
      reason: 'invalid_mode',
    };
  }

  if (mode === 'personal') {
    const result = await query(
      `SELECT 1
       FROM personal_subscriptions
       WHERE user_id = $1
       LIMIT 1`,
      [user.id],
    );

    if (result.rows.length === 0) {
      return {
        ok: false,
        reason:
          'personal_not_enabled',
      };
    }

    return {
      ok: true,
      scopeType: 'personal',
      scopeId: user.id,
      budgetGhs:
        budgetLimitGhs('personal'),
      periodStart:
        periodStartUtc(),
    };
  }

  if (!user.company_id) {
    return {
      ok: false,
      reason:
        'business_not_enabled',
    };
  }

  return {
    ok: true,
    scopeType: 'business',
    scopeId: user.company_id,
    budgetGhs:
      budgetLimitGhs('business'),
    periodStart:
      periodStartUtc(),
  };
}

function summaryFromRow(
  scope,
  row,
) {
  const spent =
    Number(row?.spent_ghs || 0);

  const reserved =
    Number(
      row?.reserved_ghs || 0,
    );

  const remaining =
    Math.max(
      0,
      scope.budgetGhs -
        spent -
        reserved,
    );

  return {
    limit_ghs:
      Number(
        scope.budgetGhs.toFixed(6),
      ),
    spent_ghs:
      Number(spent.toFixed(6)),
    reserved_ghs:
      Number(reserved.toFixed(6)),
    remaining_ghs:
      Number(
        remaining.toFixed(6),
      ),
    full_requests:
      Number(
        row?.full_requests || 0,
      ),
    basic_requests:
      Number(
        row?.basic_requests || 0,
      ),
    period_start:
      scope.periodStart,
  };
}

async function getUsageSummary(
  scope,
) {
  const result = await query(
    `SELECT
       spent_ghs,
       reserved_ghs,
       full_requests,
       basic_requests
     FROM ask_agentpro_monthly_usage
     WHERE scope_type = $1
       AND scope_id = $2
       AND period_start = $3`,
    [
      scope.scopeType,
      scope.scopeId,
      scope.periodStart,
    ],
  );

  return summaryFromRow(
    scope,
    result.rows[0] || null,
  );
}

async function startFullRequest(
  scope,
) {
  return withTransaction(
    async (client) => {
      await client.query(
        `INSERT INTO ask_agentpro_monthly_usage (
           scope_type,
           scope_id,
           period_start
         )
         VALUES ($1, $2, $3)
         ON CONFLICT (
           scope_type,
           scope_id,
           period_start
         )
         DO NOTHING`,
        [
          scope.scopeType,
          scope.scopeId,
          scope.periodStart,
        ],
      );

      const locked =
        await client.query(
          `SELECT *
           FROM ask_agentpro_monthly_usage
           WHERE scope_type = $1
             AND scope_id = $2
             AND period_start = $3
           FOR UPDATE`,
          [
            scope.scopeType,
            scope.scopeId,
            scope.periodStart,
          ],
        );

      const row =
        locked.rows[0];

      let spent =
        Number(
          row.spent_ghs || 0,
        );

      let reserved =
        Number(
          row.reserved_ghs || 0,
        );

      const now = new Date();

      if (row.active_full_token) {
        const expiry =
          row.active_full_expires_at
            ? new Date(
                row.active_full_expires_at,
              )
            : null;

        if (
          expiry &&
          expiry > now
        ) {
          return {
            allowed: false,
            reason:
              'full_request_in_progress',
            summary:
              summaryFromRow(
                scope,
                row,
              ),
          };
        }

        // A process may have terminated after the
        // provider accepted a request but before
        // settlement. Conservatively charge the
        // expired reservation rather than silently
        // giving away untracked paid usage.
        spent += reserved;
        reserved = 0;

        await client.query(
          `UPDATE ask_agentpro_monthly_usage
           SET
             spent_ghs = $4,
             reserved_ghs = 0,
             active_full_token = NULL,
             active_full_expires_at = NULL,
             updated_at = NOW()
           WHERE scope_type = $1
             AND scope_id = $2
             AND period_start = $3`,
          [
            scope.scopeType,
            scope.scopeId,
            scope.periodStart,
            spent,
          ],
        );
      }

      const remaining =
        scope.budgetGhs -
        spent;

      if (remaining <= 0) {
        return {
          allowed: false,
          reason:
            'budget_exhausted',
          summary:
            summaryFromRow(
              scope,
              {
                ...row,
                spent_ghs:
                  spent,
                reserved_ghs: 0,
              },
            ),
        };
      }

      const reserve =
        Math.min(
          remaining,
          reservationGhs(),
        );

      const token =
        randomUUID();

      await client.query(
        `UPDATE ask_agentpro_monthly_usage
         SET
           reserved_ghs = $4,
           active_full_token = $5,
           active_full_expires_at =
             NOW() +
             ($6 * INTERVAL '1 second'),
           updated_at = NOW()
         WHERE scope_type = $1
           AND scope_id = $2
           AND period_start = $3`,
        [
          scope.scopeType,
          scope.scopeId,
          scope.periodStart,
          reserve,
          token,
          RESERVATION_SECONDS,
        ],
      );

      return {
        allowed: true,
        reservation: {
          scope,
          token,
          reservedGhs:
            reserve,
        },
        summary:
          summaryFromRow(
            scope,
            {
              ...row,
              spent_ghs: spent,
              reserved_ghs:
                reserve,
            },
          ),
      };
    },
  );
}

async function settleFullRequest({
  reservation,
  costGhs,
}) {
  const {
    scope,
    token,
  } = reservation;

  const cost =
    Number.isFinite(
      Number(costGhs),
    )
      ? Math.max(
          0,
          Number(costGhs),
        )
      : 0;

  return withTransaction(
    async (client) => {
      const locked =
        await client.query(
          `SELECT *
           FROM ask_agentpro_monthly_usage
           WHERE scope_type = $1
             AND scope_id = $2
             AND period_start = $3
           FOR UPDATE`,
          [
            scope.scopeType,
            scope.scopeId,
            scope.periodStart,
          ],
        );

      const row =
        locked.rows[0];

      if (
        !row ||
        String(
          row.active_full_token ||
          '',
        ) !== String(token)
      ) {
        return {
          settled: false,
          summary:
            summaryFromRow(
              scope,
              row || null,
            ),
        };
      }

      const newSpent =
        Number(
          row.spent_ghs || 0,
        ) + cost;

      const updated =
        await client.query(
          `UPDATE ask_agentpro_monthly_usage
           SET
             spent_ghs = $4,
             reserved_ghs = 0,
             full_requests =
               full_requests + 1,
             active_full_token = NULL,
             active_full_expires_at = NULL,
             updated_at = NOW()
           WHERE scope_type = $1
             AND scope_id = $2
             AND period_start = $3
           RETURNING *`,
          [
            scope.scopeType,
            scope.scopeId,
            scope.periodStart,
            newSpent,
          ],
        );

      return {
        settled: true,
        summary:
          summaryFromRow(
            scope,
            updated.rows[0],
          ),
      };
    },
  );
}

async function releaseFullRequest(
  reservation,
) {
  const {
    scope,
    token,
  } = reservation;

  await query(
    `UPDATE ask_agentpro_monthly_usage
     SET
       reserved_ghs = 0,
       active_full_token = NULL,
       active_full_expires_at = NULL,
       updated_at = NOW()
     WHERE scope_type = $1
       AND scope_id = $2
       AND period_start = $3
       AND active_full_token = $4`,
    [
      scope.scopeType,
      scope.scopeId,
      scope.periodStart,
      token,
    ],
  );
}

async function recordBasicRequest(
  scope,
) {
  await query(
    `INSERT INTO ask_agentpro_monthly_usage (
       scope_type,
       scope_id,
       period_start,
       basic_requests
     )
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (
       scope_type,
       scope_id,
       period_start
     )
     DO UPDATE SET
       basic_requests =
         ask_agentpro_monthly_usage
           .basic_requests + 1,
       updated_at = NOW()`,
    [
      scope.scopeType,
      scope.scopeId,
      scope.periodStart,
    ],
  );
}

module.exports = {
  DEFAULT_PERSONAL_BUDGET_GHS,
  DEFAULT_BUSINESS_BUDGET_GHS,
  budgetLimitGhs,
  periodStartUtc,
  resolveUsageScope,
  getUsageSummary,
  startFullRequest,
  settleFullRequest,
  releaseFullRequest,
  recordBasicRequest,
};
