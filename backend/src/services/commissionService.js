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
 * Get commission summary for a period
 */
async function getCommissionSummary(params) {
  const { query } = require('../config/database');
  const {
    company_id,
    manager_id,
    branch_id,
    agent_id,
    provider,
    from_date,
    to_date,
    group_by = 'day'
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
      `EXISTS (
         SELECT 1
         FROM branch_managers bm
         WHERE bm.branch_id = c.branch_id
           AND bm.manager_id = $${idx++}
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
  if (agent_id) { conditions.push(`c.agent_id = $${idx++}`); queryParams.push(agent_id); }
  if (from_date) { conditions.push(`c.calculated_at >= $${idx++}`); queryParams.push(from_date); }
  if (to_date) { conditions.push(`c.calculated_at <= $${idx++}`); queryParams.push(to_date); }

  const providers = provider
    ? [...new Set(
        String(provider)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      )]
    : [];

  const joinTransactions = providers.length
    ? `LEFT JOIN transactions t ON c.transaction_id = t.id`
    : '';

  if (providers.length) {
    conditions.push(`t.provider::text = ANY($${idx++}::text[])`);
    queryParams.push(providers);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const dateGroup = {
    day: "DATE_TRUNC('day', c.calculated_at)",
    week: "DATE_TRUNC('week', c.calculated_at)",
    month: "DATE_TRUNC('month', c.calculated_at)",
    year: "DATE_TRUNC('year', c.calculated_at)"
  }[group_by] || "DATE_TRUNC('day', c.calculated_at)";

  const result = await query(
    `SELECT
       ${dateGroup} as period,
       COUNT(*) as transaction_count,
       SUM(c.gross_commission) as total_gross,
       SUM(c.provider_share) as total_provider_share,
       SUM(c.net_commission) as total_net
     FROM commissions c
     ${joinTransactions}
     ${whereClause}
     GROUP BY ${dateGroup}
     ORDER BY period DESC`,
    queryParams
  );

  return result.rows;
}

module.exports = { calculateCommission, getCommissionSummary };
