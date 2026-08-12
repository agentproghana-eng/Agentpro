/**
 * Commission calculation service
 * Tiered rate with cap: standard rate below threshold,
 * capped amount at or above threshold
 */

/**
 * Calculate commission for a transaction
 * @param {number} amount - Transaction amount in GHS
 * @param {number} ratePercent - Commission rate (e.g. 0.02 = 2%)
 * @param {number|null} threshold - Amount above which cap applies
 * @param {number|null} cap - Maximum commission amount
 * @param {number} providerSharePercent - Provider's share (e.g. 0.30 = 30%)
 * @returns {{ gross: number, provider_share: number, net: number }}
 */
function calculateCommission(amount, ratePercent, threshold, cap, providerSharePercent) {
  let gross = amount * ratePercent;

  // Apply cap if threshold is reached.
  // Boundary is inclusive (>=): a transaction of exactly `threshold` is
  // capped, not just amounts strictly above it. This only has an
  // observable effect for custom commission rules where rate * threshold
  // does not naturally equal cap (the seeded default rule — 2% of GHS
  // 1000 = GHS 20 = the cap — produces the same result either way).
  if (threshold !== null && cap !== null && amount >= threshold) {
    gross = Math.min(gross, cap);
  }

  gross = Math.round(gross * 100) / 100;
  const providerShare = Math.round(gross * providerSharePercent * 100) / 100;
  const net = Math.round((gross - providerShare) * 100) / 100;

  return { gross, provider_share: providerShare, net };
}

/**
 * Build the shared authorization and report filters used by both the
 * grouped commission rows and the exact aggregate totals.
 *
 * PostgreSQL placeholders are created here once so the two queries
 * cannot accidentally drift into different company/manager/branch/
 * agent/provider/date scopes.
 */
function buildCommissionFilterParts(params) {
  const {
    company_id,
    manager_id,
    branch_id,
    agent_id,
    provider,
    from_date,
    to_date,
  } = params;

  const conditions = [];
  const queryParams = [];
  let idx = 1;

  if (company_id) {
    conditions.push(
      `c.company_id = $${idx++}`
    );
    queryParams.push(company_id);
  }

  if (manager_id) {
    conditions.push(
      `c.branch_id IN (
         SELECT branch_id
         FROM branch_managers
         WHERE manager_id = $${idx++}
       )`
    );
    queryParams.push(manager_id);
  }

  if (branch_id) {
    conditions.push(
      `c.branch_id = $${idx++}`
    );
    queryParams.push(branch_id);
  }

  if (agent_id) {
    conditions.push(
      `c.agent_id = $${idx++}`
    );
    queryParams.push(agent_id);
  }

  if (from_date) {
    conditions.push(
      `c.calculated_at >= $${idx++}`
    );
    queryParams.push(from_date);
  }

  if (to_date) {
    conditions.push(
      `c.calculated_at <= $${idx++}`
    );
    queryParams.push(to_date);
  }

  const providers = provider
    ? [...new Set(
        String(provider)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      )]
    : [];

  if (providers.length) {
    conditions.push(
      `t.provider::text = ANY($${idx++}::text[])`
    );
    queryParams.push(providers);
  }

  return {
    whereClause:
      conditions.length > 0
        ? `WHERE ${conditions.join(' AND ')}`
        : '',
    queryParams,
    transactionJoin:
      providers.length > 0
        ? 'LEFT JOIN transactions t ON c.transaction_id = t.id'
        : '',
  };
}

const COMMISSION_GROUP_CONFIG = {
  day: {
    select:
      "DATE_TRUNC('day', c.calculated_at) AS period",
    joins: '',
    groupBy:
      "DATE_TRUNC('day', c.calculated_at)",
    orderBy: 'period DESC',
  },
  week: {
    select:
      "DATE_TRUNC('week', c.calculated_at) AS period",
    joins: '',
    groupBy:
      "DATE_TRUNC('week', c.calculated_at)",
    orderBy: 'period DESC',
  },
  month: {
    select:
      "DATE_TRUNC('month', c.calculated_at) AS period",
    joins: '',
    groupBy:
      "DATE_TRUNC('month', c.calculated_at)",
    orderBy: 'period DESC',
  },
  year: {
    select:
      "DATE_TRUNC('year', c.calculated_at) AS period",
    joins: '',
    groupBy:
      "DATE_TRUNC('year', c.calculated_at)",
    orderBy: 'period DESC',
  },
  agent: {
    select: `c.agent_id AS group_id,
             CONCAT_WS(
               ' ',
               u.first_name,
               u.last_name
             ) AS label`,
    joins:
      'LEFT JOIN users u ON u.id = c.agent_id',
    groupBy:
      'c.agent_id, u.first_name, u.last_name',
    orderBy:
      'label ASC, c.agent_id ASC',
  },
  branch: {
    select: `c.branch_id AS group_id,
             b.name AS label`,
    joins:
      'LEFT JOIN branches b ON b.id = c.branch_id',
    groupBy:
      'c.branch_id, b.name',
    orderBy:
      'label ASC, c.branch_id ASC',
  },
};

/**
 * Build the grouped commission query once for both buffered JSON/report
 * consumers and cursor-based export consumers.
 */
function buildCommissionSummaryQuery(params) {
  const {
    group_by = 'day',
  } = params;

  const {
    whereClause,
    queryParams,
    transactionJoin,
  } = buildCommissionFilterParts(params);

  // Strict allowlist: raw group_by input is never interpolated into SQL.
  const grouping =
    COMMISSION_GROUP_CONFIG[group_by] ||
    COMMISSION_GROUP_CONFIG.day;

  const joins = [
    transactionJoin,
    grouping.joins,
  ]
    .filter(Boolean)
    .join('\n');

  const sql = `SELECT
       ${grouping.select},
       COUNT(*) AS transaction_count,
       SUM(c.gross_commission) AS total_gross,
       SUM(c.provider_share) AS total_provider_share,
       SUM(c.net_commission) AS total_net
     FROM commissions c
     ${joins}
     ${whereClause}
     GROUP BY ${grouping.groupBy}
     ORDER BY ${grouping.orderBy}`;

  return {
    sql,
    queryParams,
  };
}

/**
 * Get grouped commission rows for JSON and buffered consumers.
 */
async function getCommissionSummary(params) {
  const { query } = require('../config/database');

  const {
    sql,
    queryParams,
  } = buildCommissionSummaryQuery(params);

  const result = await query(
    sql,
    queryParams
  );

  return result.rows;
}

/**
 * Stream grouped commission rows in bounded PostgreSQL cursor batches.
 */
async function streamCommissionSummaryRows(
  params,
  onRow
) {
  if (typeof onRow !== 'function') {
    throw new TypeError(
      'streamCommissionSummaryRows requires an onRow callback'
    );
  }

  const {
    streamQueryBatches,
  } = require('../config/database');

  const {
    sql,
    queryParams,
  } = buildCommissionSummaryQuery(params);

  await streamQueryBatches(
    sql,
    queryParams,
    {
      batchSize: 500,
      onRows: async (rows) => {
        for (const row of rows) {
          await onRow(row);
        }
      },
    }
  );
}

/**
 * Get exact report totals directly from PostgreSQL NUMERIC columns.
 *
 * Do not calculate these by reducing grouped rows in JavaScript:
 * PostgreSQL keeps the monetary aggregation in exact decimal arithmetic.
 */
async function getCommissionTotals(params) {
  const { query } = require('../config/database');

  const {
    whereClause,
    queryParams,
    transactionJoin,
  } = buildCommissionFilterParts(params);

  const result = await query(
    `SELECT
       COUNT(*) AS transaction_count,
       COALESCE(
         SUM(c.gross_commission),
         0
       ) AS total_gross,
       COALESCE(
         SUM(c.provider_share),
         0
       ) AS total_provider_share,
       COALESCE(
         SUM(c.net_commission),
         0
       ) AS total_net
     FROM commissions c
     ${transactionJoin}
     ${whereClause}`,
    queryParams
  );

  return result.rows[0] || {
    transaction_count: '0',
    total_gross: '0',
    total_provider_share: '0',
    total_net: '0',
  };
}

module.exports = {
  calculateCommission,
  getCommissionSummary,
  getCommissionTotals,
  streamCommissionSummaryRows,
};
