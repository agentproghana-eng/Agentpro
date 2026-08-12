const {
  query,
  streamQueryBatches,
} = require('../config/database');
const { logger } = require('../utils/logger');
const {
  generateTransactionReportPDFStream,
  generateTransactionReportExcelStream,
  generateCommissionReportPDFStream,
  generateCommissionReportExcelStream,
} = require('../services/reportService');
const {
  getCommissionTotals,
  streamCommissionSummaryRows,
} = require('../services/commissionService');
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

function buildTransactionQueryParts(
  filters,
  userContext
) {
  const conditions = [];
  const params = [];
  let idx = 1;

  // Role-based scoping is enforced on the server.
  //
  // Agents can only report on their own transactions.
  // Managers are additionally restricted to branches they actually
  // manage; an explicit branch_id remains an extra intersection, so
  // requesting an unmanaged branch returns no rows.
  if (userContext.role === 'agent') {
    conditions.push(`t.agent_id = $${idx++}`);
    params.push(userContext.id);
  } else if (userContext.role === 'manager') {
    conditions.push(`t.company_id = $${idx++}`);
    params.push(userContext.company_id);

    conditions.push(
      `t.branch_id IN (
         SELECT branch_id
         FROM branch_managers
         WHERE manager_id = $${idx++}
       )`
    );
    params.push(userContext.id);
  } else if (userContext.role !== 'superuser') {
    conditions.push(`t.company_id = $${idx++}`);
    params.push(userContext.company_id);
  }

  if (filters.branch_id) {
    conditions.push(`t.branch_id = $${idx++}`);
    params.push(filters.branch_id);
  }

  if (
    filters.agent_id &&
    userContext.role !== 'agent'
  ) {
    conditions.push(`t.agent_id = $${idx++}`);
    params.push(filters.agent_id);
  }

  const providers =
    parseMultiValue(filters.provider);

  const transactionTypes =
    parseMultiValue(filters.transaction_type);

  const statuses =
    parseMultiValue(filters.status);

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

  // Never interpolate an arbitrary client value into ORDER BY.
  const SORT_COLUMNS = {
    date: 't.created_at',
    amount: 't.amount',
    commission: 'cm.net_commission',
    fee: 't.fee',
  };

  const sortColumn =
    SORT_COLUMNS[filters.sort_by] ||
    SORT_COLUMNS.date;

  const sortDirection =
    filters.sort_order === 'asc'
      ? 'ASC'
      : 'DESC';

  return {
    where,
    params,
    sortColumn,
    sortDirection,
  };
}

function transactionRowSql({
  where,
  sortColumn,
  sortDirection,
  limitClause = '',
}) {
  return `SELECT t.*,
                 u.first_name || ' ' || u.last_name as agent_name,
                 b.name as branch_name,
                 cm.net_commission
          FROM transactions t
          LEFT JOIN users u
            ON t.agent_id = u.id
          LEFT JOIN branches b
            ON t.branch_id = b.id
          LEFT JOIN commissions cm
            ON cm.transaction_id = t.id
          ${where}
          ORDER BY
            ${sortColumn} ${sortDirection},
            t.id ${sortDirection}
          ${limitClause}`;
}

function csvCell(value) {
  return `"${String(value ?? '')
    .replace(/"/g, '""')}"`;
}

function transactionCsvRow(tx) {
  return [
    tx.created_at
      ? new Date(tx.created_at)
          .toLocaleString('en-GH')
      : '',
    tx.reference,
    tx.network_reference,
    tx.transaction_type,
    tx.provider,
    tx.customer_phone,
    tx.customer_name,
    tx.amount,
    tx.fee,
    tx.net_commission,
    tx.status,
    tx.agent_name,
    tx.branch_name,
  ].map(csvCell).join(',');
}

const TRANSACTION_CSV_HEADER = [
  'Date',
  'Reference',
  'Network Ref',
  'Type',
  'Provider',
  'Customer Phone',
  'Customer Name',
  'Amount (GHS)',
  'Recorded Network Charge (GHS)',
  'Commission (GHS)',
  'Status',
  'Agent',
  'Branch',
].map(csvCell).join(',');

function waitForResponseDrain(res) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      res.removeListener('drain', onDrain);
      res.removeListener('error', onError);
      res.removeListener('close', onClose);
    };

    const onDrain = () => {
      cleanup();
      resolve();
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const onClose = () => {
      cleanup();
      reject(
        new Error(
          'Report download connection closed'
        )
      );
    };

    res.once('drain', onDrain);
    res.once('error', onError);
    res.once('close', onClose);
  });
}

async function writeResponseChunk(
  res,
  chunk
) {
  if (res.write(chunk)) {
    return;
  }

  await waitForResponseDrain(res);
}

async function streamTransactionCsv(
  filters,
  userContext,
  res
) {
  await writeResponseChunk(
    res,
    `${TRANSACTION_CSV_HEADER}\n`
  );

  let pendingRows = [];

  const flushPendingRows = async () => {
    if (pendingRows.length === 0) {
      return;
    }

    const chunk =
      `${pendingRows
        .map(transactionCsvRow)
        .join('\n')}\n`;

    pendingRows = [];

    await writeResponseChunk(
      res,
      chunk
    );
  };

  await streamTransactionRows(
    filters,
    userContext,
    async (row) => {
      pendingRows.push(row);

      if (pendingRows.length >= 500) {
        await flushPendingRows();
      }
    }
  );

  await flushPendingRows();
}


function commissionGroupLabel(groupBy) {
  if (groupBy === 'agent') {
    return 'Agent';
  }

  if (groupBy === 'branch') {
    return 'Branch';
  }

  return 'Period';
}

function commissionCsvGroupValue(
  row,
  groupBy
) {
  if (
    groupBy === 'agent' ||
    groupBy === 'branch'
  ) {
    return row.label || '';
  }

  return row.period
    ? new Date(row.period)
        .toLocaleDateString('en-GH')
    : '';
}

function commissionCsvRow(
  row,
  groupBy
) {
  return [
    commissionCsvGroupValue(
      row,
      groupBy
    ),
    row.transaction_count,
    row.total_gross,
    row.total_provider_share,
    row.total_net,
  ]
    .map(csvCell)
    .join(',');
}

function commissionCsvHeader(groupBy) {
  return [
    commissionGroupLabel(groupBy),
    'Transactions',
    'Gross Commission (GHS)',
    'Provider Share (GHS)',
    'Net Commission (GHS)',
  ]
    .map(csvCell)
    .join(',');
}

async function streamCommissionCsv(
  filters,
  groupBy,
  res
) {
  await writeResponseChunk(
    res,
    `${commissionCsvHeader(groupBy)}\n`
  );

  let pendingRows = [];

  const flushPendingRows = async () => {
    if (pendingRows.length === 0) {
      return;
    }

    const chunk =
      `${pendingRows
        .map((row) =>
          commissionCsvRow(
            row,
            groupBy
          )
        )
        .join('\n')}\n`;

    pendingRows = [];

    await writeResponseChunk(
      res,
      chunk
    );
  };

  await streamCommissionSummaryRows(
    {
      ...filters,
      group_by: groupBy,
    },
    async (row) => {
      pendingRows.push(row);

      if (pendingRows.length >= 500) {
        await flushPendingRows();
      }
    }
  );

  await flushPendingRows();
}


async function fetchTransactionSummary(
  filters,
  userContext
) {
  const {
    where,
    params,
  } = buildTransactionQueryParts(
    filters,
    userContext
  );

  const customerVolumeTypeParam =
    params.length + 1;

  const summaryParams = [
    ...params,
    CUSTOMER_VOLUME_TRANSACTION_TYPES,
  ];

  const result = await query(
    `SELECT
       COUNT(*) as count,
       COALESCE(
         SUM(
           CASE
             WHEN t.status = 'success'
              AND t.transaction_type::text =
                  ANY($${customerVolumeTypeParam}::text[])
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
     LEFT JOIN commissions cm
       ON cm.transaction_id = t.id
     ${where}`,
    summaryParams
  );

  return result.rows[0];
}

async function streamTransactionRows(
  filters,
  userContext,
  onRow
) {
  if (typeof onRow !== 'function') {
    throw new TypeError(
      'streamTransactionRows requires an onRow callback'
    );
  }

  const {
    where,
    params,
    sortColumn,
    sortDirection,
  } = buildTransactionQueryParts(
    filters,
    userContext
  );

  const sql = transactionRowSql({
    where,
    sortColumn,
    sortDirection,
  });

  await streamQueryBatches(
    sql,
    params,
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

async function fetchTransactionCount(
  filters,
  userContext
) {
  const {
    where,
    params,
  } = buildTransactionQueryParts(
    filters,
    userContext
  );

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
// Branch-name lookup must obey the same authorization boundary as the
// report itself. Otherwise an out-of-scope branch_id could still leak
// the branch name through an otherwise empty PDF/Excel report title.
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

    if (userContext.role === 'manager') {
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
    } else if (userContext.role === 'agent') {
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
      userContext.role !== 'superuser'
    ) {
      conditions.push(
        `b.company_id = $${idx++}`
      );
      params.push(
        userContext.company_id
      );
    }

    const result = await query(
      `SELECT b.name
       FROM branches b
       WHERE ${conditions.join(' AND ')}`,
      params
    );

    return result.rows[0]?.name || null;
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
    const {
      resolvedFrom,
      resolvedTo,
    } = resolvePeriodRange(
      period,
      from_date,
      to_date
    );

    const reportFilters = {
      from_date: resolvedFrom,
      to_date: resolvedTo,
      branch_id,
      agent_id,
      provider,
      transaction_type,
      status,
      sim_iccid,
      sort_by,
      sort_order,
    };

    if (format === 'csv') {
      res.setHeader(
        'Content-Type',
        'text/csv; charset=utf-8'
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="transactions_${Date.now()}.csv"`
      );

      await streamTransactionCsv(
        reportFilters,
        req.user,
        res
      );

      return res.end();
    }

    const periodLabel =
      period ||
      `${resolvedFrom?.slice(0, 10)} to ${resolvedTo?.slice(0, 10)}`;

    const branchName =
      await resolveBranchName(branch_id, req.user);

    const title = branchName
      ? `Transaction Report — ${branchName} — ${periodLabel}`
      : `Transaction Report — ${periodLabel}`;

    if (format === 'excel') {
      // Resolve the aggregate summary before sending response headers.
      // If the database query fails, we can still return a normal JSON
      // error instead of failing halfway through an XLSX download.
      const summary =
        await fetchTransactionSummary(
          reportFilters,
          req.user
        );

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="transactions_${Date.now()}.xlsx"`
      );

      await generateTransactionReportExcelStream({
        stream: res,
        summary,
        title,
        writeTransactions:
          async (writeRow) => {
            await streamTransactionRows(
              reportFilters,
              req.user,
              writeRow
            );
          },
      });

      if (!res.writableEnded) {
        return res.end();
      }

      return;
    }

    const summary =
      await fetchTransactionSummary(
        reportFilters,
        req.user
      );

    res.setHeader(
      'Content-Type',
      'application/pdf'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="transactions_${Date.now()}.pdf"`
    );

    await generateTransactionReportPDFStream({
      stream: res,
      summary,
      title,
      writeTransactions:
        async (writeRow) => {
          await streamTransactionRows(
            reportFilters,
            req.user,
            writeRow
          );
        },
    });

    if (!res.writableEnded) {
      return res.end();
    }

    return;

  } catch (error) {
    logger.error(
      'Transaction report error:',
      error
    );

    if (res.headersSent) {
      if (
        !res.writableEnded &&
        typeof res.destroy === 'function'
      ) {
        res.destroy(error);
      }
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to generate report',
    });
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
    const {
      resolvedFrom,
      resolvedTo,
    } = resolvePeriodRange(
      period,
      from_date,
      to_date
    );

    const effectiveAgentId =
      req.user.role === 'agent'
        ? req.user.id
        : agent_id;

    const commissionFilters = {
      company_id:
        req.user.role === 'superuser'
          ? undefined
          : req.user.company_id,
      manager_id:
        req.user.role === 'manager'
          ? req.user.id
          : undefined,
      branch_id,
      agent_id: effectiveAgentId,
      provider,
      from_date: resolvedFrom,
      to_date: resolvedTo,
    };

    if (format === 'csv') {
      res.setHeader(
        'Content-Type',
        'text/csv; charset=utf-8'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="commissions_${Date.now()}.csv"`
      );

      await streamCommissionCsv(
        commissionFilters,
        group_by,
        res
      );

      return res.end();
    }

    if (format === 'excel') {
      const [
        summary,
        branchName,
      ] = await Promise.all([
        getCommissionTotals(
          commissionFilters
        ),
        resolveBranchName(
          branch_id,
          req.user
        ),
      ]);

      const title = branchName
        ? `Commission Report — ${branchName} — ${period || 'Custom Period'}`
        : `Commission Report — ${period || 'Custom Period'}`;

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="commissions_${Date.now()}.xlsx"`
      );

      await generateCommissionReportExcelStream({
        stream: res,
        summary,
        title,
        groupBy: group_by,
        writeCommissions:
          async (writeRow) => {
            await streamCommissionSummaryRows(
              {
                ...commissionFilters,
                group_by,
              },
              writeRow
            );
          },
      });

      return res.end();
    }

    const [
      summary,
      branchName,
    ] = await Promise.all([
      getCommissionTotals(
        commissionFilters
      ),
      resolveBranchName(
        branch_id,
        req.user
      ),
    ]);

    const title = branchName
      ? `Commission Report — ${branchName} — ${period || 'Custom Period'}`
      : `Commission Report — ${period || 'Custom Period'}`;

    res.setHeader(
      'Content-Type',
      'application/pdf'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="commissions_${Date.now()}.pdf"`
    );

    await generateCommissionReportPDFStream({
      stream: res,
      summary,
      title,
      groupBy: group_by,
      writeCommissions:
        async (writeRow) => {
          await streamCommissionSummaryRows(
            {
              ...commissionFilters,
              group_by,
            },
            writeRow
          );
        },
    });

    return res.end();

  } catch (error) {
    logger.error(
      'Commission report error:',
      error
    );

    if (res.headersSent) {
      if (
        !res.writableEnded &&
        typeof res.destroy === 'function'
      ) {
        res.destroy(error);
      }

      return;
    }

    return res.status(500).json({
      success: false,
      message:
        'Failed to generate commission report',
    });
  }
};

// ── Dashboard Summary (JSON — for app dashboard charts) ───────

exports.dashboardSummary = async (req, res) => {
  const companyId = req.user.role === 'superuser' ? null : req.user.company_id;
  const agentId = req.user.role === 'agent' ? req.user.id : null;

  try {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now); startOfMonth.setDate(1); startOfMonth.setHours(0, 0, 0, 0);

    const companyFilter = companyId ? `AND t.company_id = '${companyId}'` : '';
    const agentFilter = agentId ? `AND t.agent_id = '${agentId}'` : '';

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
                    WHEN t.status = 'success'
                     AND t.transaction_type::text = ANY($2::text[])
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
                      WHEN t.status = 'success' THEN cm.net_commission
                      ELSE 0
                    END
                  ),
                  0
                ) as commission,
                COUNT(CASE WHEN t.status = 'success' THEN 1 END) as success_count
         FROM transactions t
         LEFT JOIN commissions cm ON cm.transaction_id = t.id
         WHERE t.created_at >= $1 ${companyFilter} ${agentFilter}`,
        [startOfDay, CUSTOMER_VOLUME_TRANSACTION_TYPES]
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
           ${companyFilter} ${agentFilter}`,
        [startOfMonth, CUSTOMER_VOLUME_TRANSACTION_TYPES]
      ),
      loadFloatSummary(),
      query(
        `SELECT t.id, t.reference, t.transaction_type, t.provider,
                t.amount, t.status, t.created_at, t.customer_phone
         FROM transactions t
         WHERE 1=1 ${companyFilter} ${agentFilter}
         ORDER BY t.created_at DESC LIMIT 5`
      ),
    ]);

    res.json({
      success: true,
      data: {
        today_volume: parseFloat(todayTx.rows[0].customer_volume),
        today_commission: parseFloat(todayTx.rows[0].commission),
        today_transactions: parseInt(
          todayTx.rows[0].customer_transaction_count
        ),
        today: {
          transaction_count: parseInt(
            todayTx.rows[0].customer_transaction_count
          ),
          total_amount: parseFloat(
            todayTx.rows[0].customer_volume
          ),
          net_commission: parseFloat(
            todayTx.rows[0].commission
          ),
          success_count: parseInt(todayTx.rows[0].success_count),
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
