const { query } = require('../config/database');
const { logger } = require('../utils/logger');
const {
  generateTransactionReportPDF,
  generateTransactionReportExcel,
  generateCommissionReportPDF,
  generateCommissionReportExcel,
  generateCSV,
} = require('../services/reportService');
const { getCommissionSummary } = require('../services/commissionService');
const {
  CUSTOMER_VOLUME_TRANSACTION_TYPES,
} = require('../config/reportClassification');

// ── Build transaction query with filters ──────────────────────

function parseMultiValue(value) {
  if (!value) return [];

  const values = Array.isArray(value) ? value : String(value).split(',');

  return [...new Set(
    values
      .map((item) => String(item).trim())
      .filter(Boolean)
  )];
}

function buildTransactionScope(
  userContext,
  {
    alias = 't',
    startIndex = 1,
  } = {}
) {
  const conditions = [];
  const params = [];
  let idx = startIndex;

  if (userContext.role === 'agent') {
    conditions.push(
      `${alias}.agent_id = $${idx++}`
    );
    params.push(userContext.id);
  } else if (
    userContext.role === 'manager'
  ) {
    conditions.push(
      `${alias}.company_id = $${idx++}`
    );
    params.push(
      userContext.company_id
    );

    conditions.push(
      `EXISTS (
         SELECT 1
         FROM branch_managers bm
         WHERE bm.branch_id = ${alias}.branch_id
           AND bm.manager_id = $${idx++}
       )`
    );
    params.push(userContext.id);
  } else if (
    userContext.role !== 'superuser'
  ) {
    conditions.push(
      `${alias}.company_id = $${idx++}`
    );
    params.push(
      userContext.company_id
    );
  }

  return {
    conditions,
    params,
    nextIndex: idx,
  };
}

async function fetchTransactions(filters, userContext) {
  const conditions = [];
  const params = [];

  const scope =
    buildTransactionScope(
      userContext
    );

  conditions.push(
    ...scope.conditions
  );

  params.push(
    ...scope.params
  );

  let idx =
    scope.nextIndex;

  if (filters.branch_id) { conditions.push(`t.branch_id = $${idx++}`); params.push(filters.branch_id); }
  if (filters.agent_id) { conditions.push(`t.agent_id = $${idx++}`); params.push(filters.agent_id); }
  const providers = parseMultiValue(filters.provider);
  const transactionTypes = parseMultiValue(filters.transaction_type);
  const statuses = parseMultiValue(filters.status);

  if (providers.length) {
    conditions.push(`t.provider::text = ANY($${idx++}::text[])`);
    params.push(providers);
  }

  if (transactionTypes.length) {
    conditions.push(`t.transaction_type::text = ANY($${idx++}::text[])`);
    params.push(transactionTypes);
  }

  if (statuses.length) {
    conditions.push(`t.status::text = ANY($${idx++}::text[])`);
    params.push(statuses);
  }
  if (filters.sim_iccid) { conditions.push(`t.sim_iccid = $${idx++}`); params.push(filters.sim_iccid); }
  if (filters.from_date) { conditions.push(`t.created_at >= $${idx++}`); params.push(filters.from_date); }
  if (filters.to_date) { conditions.push(`t.created_at <= $${idx++}`); params.push(filters.to_date); }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Strict allowlist mapping a client-facing sort key to a safe SQL
  // column expression - never interpolate filters.sort_by directly
  // into ORDER BY, which would be a SQL injection surface. Mirrors
  // the same pattern already used in transactionController.listTransactions.
  const SORT_COLUMNS = {
    date: 't.created_at',
    amount: 't.amount',
    commission: 'cm.net_commission',
    fee: 't.fee',
  };
  const sortColumn = SORT_COLUMNS[filters.sort_by] || SORT_COLUMNS.date;
  const sortDirection = filters.sort_order === 'asc' ? 'ASC' : 'DESC';

  const customerVolumeTypeParam = params.length + 1;
  const summaryParams = [
    ...params,
    CUSTOMER_VOLUME_TRANSACTION_TYPES,
  ];

  const [txResult, summaryResult] = await Promise.all([
    query(
      `SELECT t.*,
              u.first_name || ' ' || u.last_name as agent_name,
              b.name as branch_name,
              cm.net_commission
       FROM transactions t
       LEFT JOIN users u ON t.agent_id = u.id
       LEFT JOIN branches b ON t.branch_id = b.id
       LEFT JOIN commissions cm ON cm.transaction_id = t.id
       ${where}
       ORDER BY ${sortColumn} ${sortDirection}
       LIMIT 5000`, // Safety cap
      params
    ),
    query(
      `SELECT
         COUNT(*) as count,
         COUNT(
           CASE
             WHEN t.status = 'success'
             THEN 1
           END
         ) as successful_transactions,
         COALESCE(
           SUM(
             CASE
               WHEN t.status = 'success'
               THEN t.amount
               ELSE 0
             END
           ),
           0
         ) as total_volume,
         COALESCE(
           SUM(
             CASE
               WHEN t.status = 'success'
                AND t.transaction_type::text = ANY($${customerVolumeTypeParam}::text[])
               THEN t.amount
               ELSE 0
             END
           ),
           0
         ) as total_amount,
         COALESCE(
           SUM(
             CASE
               WHEN t.status = 'success'
               THEN cm.net_commission
               ELSE 0
             END
           ),
           0
         ) as total_commission,
         COALESCE(
           SUM(
             CASE
               WHEN t.status = 'success'
                AND (
                  (
                    t.provider::text = 'mtn'
                    AND t.transaction_type::text = 'send_money'
                  )
                  OR
                  (
                    t.provider::text IN ('telecel', 'at_money')
                    AND t.transaction_type::text = 'cash_in'
                  )
                )
               THEN t.fee
               ELSE 0
             END
           ),
           0
         ) as total_service_fees,
         ROUND(
           100.0 *
           COUNT(
             CASE
               WHEN t.status = 'success'
               THEN 1
             END
           ) /
           NULLIF(COUNT(*), 0),
           1
         ) as success_rate
       FROM transactions t
       LEFT JOIN commissions cm ON cm.transaction_id = t.id
       ${where}`,
      summaryParams
    ),
  ]);

  const rawSummary =
    summaryResult.rows[0] || {};

  const providerCommission =
    parseFloat(
      rawSummary.total_commission || 0
    );

  const agentServiceFees =
    parseFloat(
      rawSummary.total_service_fees || 0
    );

  return {
    transactions: txResult.rows,
    summary: {
      ...rawSummary,
      provider_commission:
        providerCommission,
      agent_service_fees:
        agentServiceFees,
      gross_earnings:
        providerCommission +
        agentServiceFees,
    },
  };
}


function resolvePeriodRange(period, fromDate, toDate) {
  let resolvedFrom = fromDate;
  let resolvedTo = toDate || new Date().toISOString();

  if (period && !fromDate) {
    const now = new Date();

    if (period === 'today') {
      resolvedFrom = new Date(
        now.setHours(0, 0, 0, 0)
      ).toISOString();
    }

    if (period === 'week') {
      const date = new Date();
      date.setDate(date.getDate() - 7);
      resolvedFrom = date.toISOString();
    }

    if (period === 'month') {
      const date = new Date();
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      resolvedFrom = date.toISOString();
    }

    if (period === 'year') {
      const date = new Date();
      date.setMonth(0, 1);
      date.setHours(0, 0, 0, 0);
      resolvedFrom = date.toISOString();
    }
  }

  return { resolvedFrom, resolvedTo };
}

async function fetchTransactionCount(filters, userContext) {
  const conditions = [];
  const params = [];

  const scope =
    buildTransactionScope(
      userContext
    );

  conditions.push(
    ...scope.conditions
  );

  params.push(
    ...scope.params
  );

  let idx =
    scope.nextIndex;

  if (filters.branch_id) {
    conditions.push(`t.branch_id = $${idx++}`);
    params.push(filters.branch_id);
  }

  if (filters.agent_id) {
    conditions.push(`t.agent_id = $${idx++}`);
    params.push(filters.agent_id);
  }

  const providers = parseMultiValue(filters.provider);
  const transactionTypes = parseMultiValue(
    filters.transaction_type
  );
  const statuses = parseMultiValue(filters.status);

  if (providers.length) {
    conditions.push(
      `t.provider::text = ANY($${idx++}::text[])`
    );
    params.push(providers);
  }

  if (transactionTypes.length) {
    conditions.push(
      `t.transaction_type::text = ANY($${idx++}::text[])`
    );
    params.push(transactionTypes);
  }

  if (statuses.length) {
    conditions.push(
      `t.status::text = ANY($${idx++}::text[])`
    );
    params.push(statuses);
  }

  if (filters.sim_iccid) {
    conditions.push(`t.sim_iccid = $${idx++}`);
    params.push(filters.sim_iccid);
  }

  if (filters.from_date) {
    conditions.push(`t.created_at >= $${idx++}`);
    params.push(filters.from_date);
  }

  if (filters.to_date) {
    conditions.push(`t.created_at <= $${idx++}`);
    params.push(filters.to_date);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  const result = await query(
    `SELECT COUNT(*)::int AS count
     FROM transactions t
     ${where}`,
    params
  );

  return result.rows[0]?.count || 0;
}

exports.transactionCount = async (req, res) => {
  const {
    from_date,
    to_date,
    branch_id,
    agent_id,
    provider,
    transaction_type,
    status,
    sim_iccid,
    period,
  } = req.query;

  try {
    const { resolvedFrom, resolvedTo } = resolvePeriodRange(
      period,
      from_date,
      to_date
    );

    const count = await fetchTransactionCount(
      {
        from_date: resolvedFrom,
        to_date: resolvedTo,
        branch_id,
        agent_id,
        provider,
        transaction_type,
        status,
        sim_iccid,
      },
      req.user
    );

    return res.json({
      success: true,
      data: { count },
    });
  } catch (error) {
    logger.error('Transaction count error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to count matching transactions',
    });
  }
};

// ── Resolve a branch's display name for report titles ─────────
// Returns null if no branch_id was given or it doesn't resolve, so
// callers can fall back to the existing generic title unchanged.
async function resolveBranchName(
  branch_id,
  userContext
) {
  if (!branch_id) {
    return null;
  }

  try {
    const conditions = [
      'b.id = $1',
    ];

    const params = [
      branch_id,
    ];

    let idx = 2;

    if (
      userContext?.role ===
      'manager'
    ) {
      conditions.push(
        `b.company_id = $${idx++}`
      );

      params.push(
        userContext.company_id
      );

      conditions.push(
        `EXISTS (
           SELECT 1
           FROM branch_managers bm
           WHERE bm.branch_id = b.id
             AND bm.manager_id = $${idx++}
         )`
      );

      params.push(
        userContext.id
      );
    } else if (
      userContext?.role ===
      'agent'
    ) {
      conditions.push(
        `b.company_id = $${idx++}`
      );

      params.push(
        userContext.company_id
      );

      conditions.push(
        `EXISTS (
           SELECT 1
           FROM agent_branches ab
           WHERE ab.branch_id = b.id
             AND ab.agent_id = $${idx++}
         )`
      );

      params.push(
        userContext.id
      );
    } else if (
      userContext &&
      userContext.role !==
        'superuser'
    ) {
      conditions.push(
        `b.company_id = $${idx++}`
      );

      params.push(
        userContext.company_id
      );
    }

    const result =
      await query(
        `SELECT b.name
         FROM branches b
         WHERE ${conditions.join(
           ' AND '
         )}`,
        params
      );

    return (
      result.rows[0]?.name ||
      null
    );
  } catch (e) {
    logger.warn(
      'Failed to resolve branch name for report title:',
      e.message
    );

    return null;
  }
}

// ── Transaction Report ────────────────────────────────────────

exports.transactionReport = async (req, res) => {
  const {
    format = 'pdf',
    from_date,
    to_date,
    branch_id,
    agent_id,
    provider,
    transaction_type,
    status,
    sim_iccid,
    sort_by,
    sort_order,
    period, // 'today', 'week', 'month', 'year'
  } = req.query;

  try {
    // Resolve period shortcuts
    let resolvedFrom = from_date;
    let resolvedTo = to_date || new Date().toISOString();
    if (period && !from_date) {
      const now = new Date();
      if (period === 'today') resolvedFrom = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      if (period === 'week') { const d = new Date(); d.setDate(d.getDate() - 7); resolvedFrom = d.toISOString(); }
      if (period === 'month') { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); resolvedFrom = d.toISOString(); }
      if (period === 'year') { const d = new Date(); d.setMonth(0, 1); d.setHours(0, 0, 0, 0); resolvedFrom = d.toISOString(); }
    }

    const { transactions, summary } = await fetchTransactions(
      { from_date: resolvedFrom, to_date: resolvedTo, branch_id, agent_id, provider, transaction_type, status, sim_iccid, sort_by, sort_order },
      req.user
    );

    const branchName =
      await resolveBranchName(
        branch_id,
        req.user
      );

    const reportName =
      period === 'today'
        ? 'Daily Business Transaction Report'
        : period === 'week'
          ? 'Weekly Business Transaction Report'
          : period === 'month'
            ? 'Monthly Business Transaction Report'
            : period === 'year'
              ? 'Annual Business Transaction Report'
              : 'Business Transaction Report';

    const title = reportName;

    const reportFilters = {
      from_date: resolvedFrom,
      to_date: resolvedTo,
      period,
      scope_label:
        branchName || 'All Branches',
    };

    if (format === 'csv') {
      const csv = generateCSV(transactions, [
        { label: 'Date', key: 'created_at', getValue: r => new Date(r.created_at).toLocaleString('en-GH') },
        { label: 'Reference', key: 'reference' },
        { label: 'Network Ref', key: 'network_reference' },
        { label: 'Type', key: 'transaction_type' },
        { label: 'Provider', key: 'provider' },
        { label: 'Customer Phone', key: 'customer_phone' },
        { label: 'Customer Name', key: 'customer_name' },
        { label: 'Amount (GHS)', key: 'amount' },
        { label: 'Agent Service Fee (GHS)', key: 'fee' },
        { label: 'Provider Commission (GHS)', key: 'net_commission' },
        { label: 'Status', key: 'status' },
        { label: 'Agent', key: 'agent_name' },
        { label: 'Branch', key: 'branch_name' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="transactions_${Date.now()}.csv"`);
      return res.send(csv);
    }

    if (format === 'excel') {
      const buffer = await generateTransactionReportExcel({
        transactions,
        filters: reportFilters,
        summary,
        title,
      });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="transactions_${Date.now()}.xlsx"`);
      return res.send(buffer);
    }

    // Default: PDF
    const buffer = await generateTransactionReportPDF({
      transactions,
      filters: reportFilters,
      summary,
      title,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="transactions_${Date.now()}.pdf"`);
    return res.send(buffer);

  } catch (error) {
    logger.error('Transaction report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
};

// ── Commission Report ─────────────────────────────────────────

exports.commissionReport = async (req, res) => {
  const {
    format = 'pdf',
    from_date,
    to_date,
    branch_id,
    agent_id,
    provider,
    group_by = 'day', // 'day', 'week', 'month', 'agent', 'branch'
    period,
  } = req.query;

  try {
    let resolvedFrom = from_date;
    if (period && !from_date) {
      const now = new Date();
      if (period === 'month') { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); resolvedFrom = d.toISOString(); }
      if (period === 'year') { const d = new Date(); d.setMonth(0, 1); d.setHours(0, 0, 0, 0); resolvedFrom = d.toISOString(); }
    }

    const data = await getCommissionSummary({
      company_id:
        req.user.role === 'superuser'
          ? undefined
          : req.user.company_id,
      manager_id:
        req.user.role === 'manager'
          ? req.user.id
          : undefined,
      branch_id,
      agent_id,
      provider,
      from_date: resolvedFrom,
      to_date,
      group_by,
    });

    const summary = {
      total_gross: data.reduce((s, r) => s + parseFloat(r.total_gross || 0), 0),
      total_provider_share: data.reduce((s, r) => s + parseFloat(r.total_provider_share || 0), 0),
      total_net: data.reduce((s, r) => s + parseFloat(r.total_net || 0), 0),
      transaction_count: data.reduce((s, r) => s + parseInt(r.transaction_count || 0), 0),
    };

    const branchName = await resolveBranchName(branch_id, req.user);
    const title = branchName
      ? `Provider Commission Report — ${branchName} — ${period || 'Custom Period'}`
      : `Provider Commission Report — ${period || 'Custom Period'}`;

    if (format === 'csv') {
      const csv = generateCSV(data, [
        { label: 'Period', key: 'period', getValue: r => r.period ? new Date(r.period).toLocaleDateString('en-GH') : '' },
        { label: 'Transactions', key: 'transaction_count' },
        { label: 'Provider Commission (GHS)', key: 'total_gross' },
        { label: 'Legacy Deduction (GHS)', key: 'total_provider_share' },
        { label: 'Credited to Agent (GHS)', key: 'total_net' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="commissions_${Date.now()}.csv"`);
      return res.send(csv);
    }

    if (format === 'excel') {
      const buffer = await generateCommissionReportExcel({ commissions: data, summary, title, groupBy: group_by });
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="commissions_${Date.now()}.xlsx"`);
      return res.send(buffer);
    }

    const buffer = await generateCommissionReportPDF({ commissions: data, summary, title, groupBy: group_by });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="commissions_${Date.now()}.pdf"`);
    return res.send(buffer);

  } catch (error) {
    logger.error('Commission report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate commission report' });
  }
};

// ── Dashboard Summary (JSON — for app dashboard charts) ───────

exports.dashboardSummary = async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

    const aggregateScope =
      buildTransactionScope(
        req.user,
        {
          startIndex: 3,
        }
      );

    const aggregateScopeSql =
      aggregateScope.conditions.length
        ? `AND ${aggregateScope.conditions.join(
            ' AND '
          )}`
        : '';

    const recentScope =
      buildTransactionScope(
        req.user,
        {
          startIndex: 1,
        }
      );

    const recentScopeSql =
      recentScope.conditions.length
        ? `AND ${recentScope.conditions.join(
            ' AND '
          )}`
        : '';

    let loadFloatSummary;

    if (
      req.user.role === 'business_owner' ||
      req.user.role === 'auditor'
    ) {
      loadFloatSummary = () => query(
        `SELECT
           COALESCE(SUM(fa.current_balance), 0) as total,
           fa.provider as provider
         FROM float_accounts fa
         INNER JOIN branches b
           ON fa.branch_id = b.id
         WHERE b.company_id = $1
           AND b.status = 'active'
         GROUP BY fa.provider`,
        [req.user.company_id]
      );
    } else if (req.user.role === 'manager') {
      loadFloatSummary = () => query(
        `SELECT
           COALESCE(SUM(fa.current_balance), 0) as total,
           fa.provider as provider
         FROM float_accounts fa
         INNER JOIN branches b
           ON fa.branch_id = b.id
         WHERE b.company_id = $1
           AND b.status = 'active'
           AND EXISTS (
             SELECT 1
             FROM branch_managers bm
             WHERE bm.branch_id = b.id
               AND bm.manager_id = $2
           )
         GROUP BY fa.provider`,
        [
          req.user.company_id,
          req.user.id,
        ]
      );
    } else {
      // Agents must never receive business branch treasury totals.
      // Superuser behavior remains unchanged without explicit company
      // context: return no branch treasury summary.
      loadFloatSummary =
        () => Promise.resolve({ rows: [] });
    }

    const [todayTx, monthTx, floatSummary, recentTx] = await Promise.all([
      query(
        `SELECT
                COUNT(
                  CASE
                    WHEN t.transaction_type::text = ANY($2::text[])
                    THEN 1
                  END
                ) as customer_transaction_count,
                COALESCE(
                  SUM(
                    CASE
                      WHEN t.status = 'success'
                       AND t.transaction_type::text = ANY($2::text[])
                      THEN t.amount
                      ELSE 0
                    END
                  ),
                  0
                ) as customer_volume,
                COALESCE(
                  SUM(
                    CASE
                      WHEN t.status = 'success'
                      THEN cm.net_commission
                      ELSE 0
                    END
                  ),
                  0
                ) as commission,
                COALESCE(
                  SUM(
                    CASE
                      WHEN t.status = 'success'
                       AND (
                         (
                           t.provider::text = 'mtn'
                           AND t.transaction_type::text = 'send_money'
                         )
                         OR
                         (
                           t.provider::text IN ('telecel', 'at_money')
                           AND t.transaction_type::text = 'cash_in'
                         )
                       )
                      THEN t.fee
                      ELSE 0
                    END
                  ),
                  0
                ) as agent_service_fees,
                COUNT(
                  CASE
                    WHEN t.status = 'success'
                     AND t.transaction_type::text = ANY($2::text[])
                    THEN 1
                  END
                ) as success_count,
                ROUND(
                  100.0 *
                  COUNT(
                    CASE
                      WHEN t.status = 'success'
                       AND t.transaction_type::text = ANY($2::text[])
                      THEN 1
                    END
                  ) /
                  NULLIF(
                    COUNT(
                      CASE
                        WHEN t.transaction_type::text = ANY($2::text[])
                        THEN 1
                      END
                    ),
                    0
                  ),
                  1
                ) as success_rate
         FROM transactions t
         LEFT JOIN commissions cm ON cm.transaction_id = t.id
         WHERE t.created_at >= $1 ${aggregateScopeSql}`,
        [
          startOfDay,
          CUSTOMER_VOLUME_TRANSACTION_TYPES,
          ...aggregateScope.params,
        ]
      ),
      query(
        `SELECT
                COUNT(
                  CASE
                    WHEN t.transaction_type::text = ANY($2::text[])
                    THEN 1
                  END
                ) as customer_transaction_count,
                COALESCE(
                  SUM(
                    CASE
                      WHEN t.transaction_type::text = ANY($2::text[])
                      THEN t.amount
                      ELSE 0
                    END
                  ),
                  0
                ) as customer_volume,
                COALESCE(SUM(cm.net_commission), 0) as commission
         FROM transactions t
         LEFT JOIN commissions cm ON cm.transaction_id = t.id
         WHERE t.created_at >= $1
           AND t.status = 'success'
           ${aggregateScopeSql}`,
        [
          startOfMonth,
          CUSTOMER_VOLUME_TRANSACTION_TYPES,
          ...aggregateScope.params,
        ]
      ),
      loadFloatSummary(),
      query(
        `SELECT t.id, t.reference, t.transaction_type, t.provider,
                t.amount, t.status, t.created_at, t.customer_phone
         FROM transactions t
         WHERE 1=1 ${recentScopeSql}
         ORDER BY t.created_at DESC LIMIT 5`,
        recentScope.params
      ),
    ]);

    const todayRow =
      todayTx.rows[0] || {};

    const todayProviderCommission =
      parseFloat(
        todayRow.commission || 0
      );

    const todayAgentServiceFees =
      parseFloat(
        todayRow.agent_service_fees || 0
      );

    const todayGrossEarnings =
      todayProviderCommission +
      todayAgentServiceFees;

    const todaySuccessRate =
      parseFloat(
        todayRow.success_rate || 0
      );

    res.json({
      success: true,
      data: {
        today_volume: parseFloat(
          todayRow.customer_volume || 0
        ),
        today_commission:
          todayProviderCommission,
        today_provider_commission:
          todayProviderCommission,
        today_agent_service_fees:
          todayAgentServiceFees,
        today_gross_earnings:
          todayGrossEarnings,
        today_success_rate:
          todaySuccessRate,
        today_transactions: parseInt(
          todayRow.customer_transaction_count || 0
        ),
        today: {
          transaction_count: parseInt(
            todayRow.customer_transaction_count || 0
          ),
          total_amount: parseFloat(
            todayRow.customer_volume || 0
          ),
          net_commission:
            todayProviderCommission,
          provider_commission:
            todayProviderCommission,
          agent_service_fees:
            todayAgentServiceFees,
          gross_earnings:
            todayGrossEarnings,
          success_rate:
            todaySuccessRate,
          success_count: parseInt(
            todayRow.success_count || 0
          ),
        },
        this_month: {
          transaction_count: parseInt(
            monthTx.rows[0].customer_transaction_count
          ),
          total_amount: parseFloat(
            monthTx.rows[0].customer_volume
          ),
          net_commission: parseFloat(monthTx.rows[0].commission),
        },
        float_by_provider: floatSummary.rows,
        recent_transactions: recentTx.rows,
      },
    });
  } catch (error) {
    logger.error('Dashboard summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard data' });
  }
};
