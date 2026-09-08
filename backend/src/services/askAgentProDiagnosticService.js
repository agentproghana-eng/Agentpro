const {
  query,
} = require('../config/database');

const {
  redisClient,
} = require('../config/redis');

const EMPTY_OBJECT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
});

const ASK_AGENTPRO_TOOLS = Object.freeze([
  {
    type: 'function',
    name: 'get_my_account_context',
    description:
      'Read the signed-in user account mode, role and capability context. '
      + 'Use when an issue may depend on whether the user has Personal or '
      + 'Business capability.',
    strict: true,
    parameters: EMPTY_OBJECT_SCHEMA,
  },
  {
    type: 'function',
    name: 'get_my_subscription_status',
    description:
      'Read the signed-in user Personal subscription and, where applicable, '
      + 'their current company subscription status. This is read-only.',
    strict: true,
    parameters: EMPTY_OBJECT_SCHEMA,
  },
  {
    type: 'function',
    name: 'get_my_recent_transactions',
    description:
      'Read up to five recent Personal transactions and five recent '
      + 'Business transactions performed by the signed-in user. '
      + 'Returns only diagnostic fields and never customer phone numbers.',
    strict: true,
    parameters: EMPTY_OBJECT_SCHEMA,
  },
  {
    type: 'function',
    name: 'get_my_transaction_status',
    description:
      'Read one transaction belonging to the signed-in user by AgentPro '
      + 'transaction reference. Never use this for another user.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        reference: {
          type: 'string',
          description:
            'The AgentPro transaction reference shown to the signed-in user.',
        },
      },
      required: [
        'reference',
      ],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'get_my_business_hub_listings',
    description:
      'Read the signed-in user most recent Business Hub listings and their '
      + 'current publication status. This is read-only.',
    strict: true,
    parameters: EMPTY_OBJECT_SCHEMA,
  },
  {
    type: 'function',
    name: 'get_agentpro_service_status',
    description:
      'Check whether the AgentPro backend dependencies needed for normal '
      + 'operation are currently responding. Returns health only, not '
      + 'credentials or infrastructure secrets.',
    strict: true,
    parameters: EMPTY_OBJECT_SCHEMA,
  },
]);

function getDiagnosticToolsForMode(
  accountMode,
) {
  const descriptions = {
    personal: {
      get_my_subscription_status:
        'Read the signed-in user Personal subscription status. This is read-only.',
      get_my_recent_transactions:
        'Read up to five recent Personal transactions belonging to the signed-in user. Returns only safe diagnostic fields.',
      get_my_transaction_status:
        'Read one Personal transaction belonging to the signed-in user by AgentPro transaction reference.',
    },

    business: {
      get_my_subscription_status:
        'Read the current Business subscription for the authenticated company. This is read-only.',
      get_my_recent_transactions:
        'Read up to five recent Business transactions performed by the signed-in user. Returns only safe diagnostic fields.',
      get_my_transaction_status:
        'Read one Business transaction performed by the signed-in user by AgentPro transaction reference.',
    },
  };

  if (
    !['personal', 'business']
      .includes(accountMode)
  ) {
    return [];
  }

  return ASK_AGENTPRO_TOOLS
    .filter(
      (tool) =>
        accountMode === 'business' ||
        tool.name !==
          'get_my_business_hub_listings',
    )
    .map(
      (tool) => ({
        ...tool,
        description:
          descriptions
            [accountMode]
            [tool.name] ||
          tool.description,
      }),
    );
}

function isoOrNull(value) {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}

function safeAmount(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function normalizeTransaction(
  row,
  mode,
) {
  return {
    mode,
    reference:
      row.reference,
    provider:
      row.provider,
    transaction_type:
      row.transaction_type,
    status:
      row.status,
    amount:
      safeAmount(row.amount),
    created_at:
      isoOrNull(row.created_at),
    completed_at:
      isoOrNull(
        row.completed_at,
      ),
  };
}

async function accountContext(
  user,
  accountMode,
) {
  if (accountMode === 'personal') {
    const result =
      await query(
        `SELECT
           u.role,
           u.status,
           EXISTS (
             SELECT 1
             FROM personal_subscriptions ps
             WHERE ps.user_id = u.id
           ) AS has_personal_capability
         FROM users u
         WHERE u.id = $1
         LIMIT 1`,
        [user.id],
      );

    if (
      result.rows.length === 0
    ) {
      return {
        ok: false,
        found: false,
      };
    }

    const row =
      result.rows[0];

    return {
      ok: true,
      found: true,
      account: {
        mode:
          'personal',
        role:
          row.role,
        status:
          row.status,
        has_personal_capability:
          row.has_personal_capability ===
          true,
      },
    };
  }

  if (
    accountMode === 'business' &&
    user.company_id
  ) {
    const result =
      await query(
        `SELECT
           u.role,
           u.status,
           c.name AS company_name
         FROM users u
         LEFT JOIN companies c
           ON c.id = u.company_id
         WHERE u.id = $1
           AND u.company_id = $2
         LIMIT 1`,
        [
          user.id,
          user.company_id,
        ],
      );

    if (
      result.rows.length === 0
    ) {
      return {
        ok: false,
        found: false,
      };
    }

    const row =
      result.rows[0];

    return {
      ok: true,
      found: true,
      account: {
        mode:
          'business',
        role:
          row.role,
        status:
          row.status,
        company_name:
          row.company_name ||
          null,
      },
    };
  }

  return {
    ok: false,
    found: false,
    error:
      'This account mode is not available.',
  };
}

async function subscriptionStatus(
  user,
  accountMode,
) {
  if (accountMode === 'personal') {
    const result =
      await query(
        `SELECT
           plan,
           expires_at,
           created_at
         FROM personal_subscriptions
         WHERE user_id = $1
         LIMIT 1`,
        [user.id],
      );

    const row =
      result.rows[0] ||
      null;

    return {
      ok: true,
      mode:
        'personal',
      subscription:
        row
          ? {
              plan:
                row.plan,
              expires_at:
                isoOrNull(
                  row.expires_at,
                ),
              created_at:
                isoOrNull(
                  row.created_at,
                ),
            }
          : null,
      checked_at:
        new Date()
          .toISOString(),
    };
  }

  if (
    accountMode === 'business' &&
    user.company_id
  ) {
    const result =
      await query(
        `SELECT
           plan,
           status,
           amount,
           started_at,
           expires_at,
           grace_period_ends_at,
           created_at
         FROM subscriptions
         WHERE company_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [user.company_id],
      );

    const row =
      result.rows[0] ||
      null;

    return {
      ok: true,
      mode:
        'business',
      subscription:
        row
          ? {
              plan:
                row.plan,
              status:
                row.status,
              amount:
                safeAmount(
                  row.amount,
                ),
              started_at:
                isoOrNull(
                  row.started_at,
                ),
              expires_at:
                isoOrNull(
                  row.expires_at,
                ),
              grace_period_ends_at:
                isoOrNull(
                  row
                    .grace_period_ends_at,
                ),
              created_at:
                isoOrNull(
                  row.created_at,
                ),
            }
          : null,
      checked_at:
        new Date()
          .toISOString(),
    };
  }

  return {
    ok: false,
    error:
      'This subscription scope is not available.',
  };
}

async function recentTransactions(
  user,
  accountMode,
) {
  if (accountMode === 'personal') {
    const result =
      await query(
        `SELECT
           reference,
           provider,
           transaction_type,
           status,
           amount,
           created_at,
           completed_at
         FROM personal_transactions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [user.id],
      );

    return {
      ok: true,
      mode:
        'personal',
      transactions:
        result.rows.map(
          (row) =>
            normalizeTransaction(
              row,
              'personal',
            ),
        ),
    };
  }

  if (accountMode === 'business') {
    const result =
      await query(
        `SELECT
           reference,
           provider,
           transaction_type,
           status,
           amount,
           created_at,
           completed_at
         FROM transactions
         WHERE agent_id = $1
         ORDER BY created_at DESC
         LIMIT 5`,
        [user.id],
      );

    return {
      ok: true,
      mode:
        'business',
      transactions:
        result.rows.map(
          (row) =>
            normalizeTransaction(
              row,
              'business',
            ),
        ),
    };
  }

  return {
    ok: false,
    error:
      'This transaction scope is not available.',
  };
}

async function transactionStatus(
  user,
  args,
  accountMode,
) {
  const reference =
    String(
      args?.reference ||
      '',
    ).trim();

  if (
    reference.length === 0 ||
    reference.length > 100
  ) {
    return {
      ok: false,
      found: false,
      error:
        'A valid AgentPro transaction reference is required.',
    };
  }

  if (accountMode === 'personal') {
    const result =
      await query(
        `SELECT
           reference,
           provider,
           transaction_type,
           status,
           amount,
           created_at,
           completed_at
         FROM personal_transactions
         WHERE user_id = $1
           AND reference = $2
         LIMIT 1`,
        [
          user.id,
          reference,
        ],
      );

    if (
      result.rows.length === 0
    ) {
      return {
        ok: true,
        found: false,
        transaction: null,
      };
    }

    return {
      ok: true,
      found: true,
      transaction:
        normalizeTransaction(
          result.rows[0],
          'personal',
        ),
    };
  }

  if (accountMode === 'business') {
    const result =
      await query(
        `SELECT
           reference,
           provider,
           transaction_type,
           status,
           amount,
           created_at,
           completed_at
         FROM transactions
         WHERE agent_id = $1
           AND reference = $2
         LIMIT 1`,
        [
          user.id,
          reference,
        ],
      );

    if (
      result.rows.length === 0
    ) {
      return {
        ok: true,
        found: false,
        transaction: null,
      };
    }

    return {
      ok: true,
      found: true,
      transaction:
        normalizeTransaction(
          result.rows[0],
          'business',
        ),
    };
  }

  return {
    ok: false,
    found: false,
    transaction: null,
    error:
      'This transaction scope is not available.',
  };
}

async function businessHubListings(
  user,
  accountMode,
) {
  if (accountMode !== 'business') {
    return {
      ok: false,
      error:
        'Business Hub diagnostics are only available in Business mode.',
    };
  }

  const result =
    await query(
      `SELECT
         title,
         status,
         published_at,
         expires_at,
         grace_period_ends_at,
         views_count,
         created_at
       FROM advertisements
       WHERE posted_by = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [user.id],
    );

  return {
    ok: true,
    mode:
      'business',
    listings:
      result.rows.map(
        (row) => ({
          title:
            row.title,
          status:
            row.status,
          published_at:
            isoOrNull(
              row.published_at,
            ),
          expires_at:
            isoOrNull(
              row.expires_at,
            ),
          grace_period_ends_at:
            isoOrNull(
              row
                .grace_period_ends_at,
            ),
          views_count:
            Number(
              row.views_count ||
              0,
            ),
          created_at:
            isoOrNull(
              row.created_at,
            ),
        }),
      ),
  };
}

async function serviceStatus() {
  let database =
    'healthy';

  let redis =
    'healthy';

  try {
    await query('SELECT 1');
  } catch (_) {
    database =
      'unhealthy';
  }

  try {
    await redisClient.ping();
  } catch (_) {
    redis =
      'unhealthy';
  }

  return {
    ok:
      database === 'healthy',
    api: 'healthy',
    database,
    redis,
    version: '2.0.0',
    checked_at:
      new Date().toISOString(),
  };
}

async function executeDiagnosticTool({
  name,
  args = {},
  user,
  accountMode,
}) {
  if (
    !user ||
    !user.id
  ) {
    throw new Error(
      'Authenticated user is required',
    );
  }

  if (
    !['personal', 'business']
      .includes(accountMode)
  ) {
    throw new Error(
      'Valid account mode is required',
    );
  }

  switch (name) {
    case 'get_my_account_context':
      return accountContext(
        user,
        accountMode,
      );

    case 'get_my_subscription_status':
      return subscriptionStatus(
        user,
        accountMode,
      );

    case 'get_my_recent_transactions':
      return recentTransactions(
        user,
        accountMode,
      );

    case 'get_my_transaction_status':
      return transactionStatus(
        user,
        args,
        accountMode,
      );

    case 'get_my_business_hub_listings':
      return businessHubListings(
        user,
        accountMode,
      );

    case 'get_agentpro_service_status':
      return serviceStatus();

    default:
      return {
        ok: false,
        error:
          'Unsupported diagnostic tool.',
      };
  }
}

module.exports = {
  ASK_AGENTPRO_TOOLS,
  getDiagnosticToolsForMode,
  executeDiagnosticTool,

  // Exported for focused unit coverage.
  accountContext,
  subscriptionStatus,
  recentTransactions,
  transactionStatus,
  businessHubListings,
  serviceStatus,
};
