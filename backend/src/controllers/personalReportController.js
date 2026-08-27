const { query } = require('../config/database');
const { logger } = require('../utils/logger');
const { generatePersonalTransactionReportPDF, generateCSV } = require('../services/reportService');

function buildPersonalReportScope(userId, filters = {}) {
  const {
    from_date,
    to_date,
    provider,
    transaction_type,
    status,
    period,
  } = filters;

  let resolvedFrom = from_date;
  let resolvedTo = to_date || new Date().toISOString();

  if (period && !from_date) {
    const now = new Date();

    if (period === 'today') {
      resolvedFrom = new Date(
        now.setHours(0, 0, 0, 0),
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

  const conditions = ['user_id = $1'];
  const params = [userId];

  let index = 2;

  if (provider) {
    conditions.push(`provider = $${index++}`);
    params.push(provider);
  }

  if (transaction_type) {
    conditions.push(`transaction_type = $${index++}`);
    params.push(transaction_type);
  }

  if (status) {
    conditions.push(`status = $${index++}`);
    params.push(status);
  }

  if (resolvedFrom) {
    conditions.push(`created_at >= $${index++}`);
    params.push(resolvedFrom);
  }

  if (resolvedTo) {
    conditions.push(`created_at <= $${index++}`);
    params.push(resolvedTo);
  }

  return {
    where: `WHERE ${conditions.join(' AND ')}`,
    params,
    resolvedFrom,
    resolvedTo,
  };
}

function personalActivitySummarySql(where) {
  return `SELECT COUNT(*) as count,
                 COUNT(CASE WHEN status = 'success' THEN 1 END) as success_count,
                 COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
                 COUNT(CASE WHEN status = 'pending_confirmation' THEN 1 END) as pending_count,
                 ROUND(
                   100.0 * COUNT(CASE WHEN status = 'success' THEN 1 END)
                   / NULLIF(COUNT(*), 0),
                   1
                 ) as success_rate
          FROM personal_transactions ${where}`;
}

// ─── Personal Transaction Report (CSV + PDF) ─────────────────
// Paid-Personal-only per spec. Always scoped to the current user.
// Deliberately simpler than the Agent transaction report.

exports.transactionReportSummary = async (req, res) => {
  const userId = req.user.id;

  try {
    const { where, params } = buildPersonalReportScope(
      userId,
      req.query,
    );

    const result = await query(
      personalActivitySummarySql(where),
      params,
    );

    const row = result.rows[0] || {};

    const toInteger = (value) => {
      const parsed = Number.parseInt(
        value ?? 0,
        10,
      );

      return Number.isFinite(parsed) ? parsed : 0;
    };

    const parsedRate = Number.parseFloat(
      row.success_rate ?? 0,
    );

    return res.json({
      success: true,
      data: {
        count: toInteger(row.count),
        success_count: toInteger(row.success_count),
        failed_count: toInteger(row.failed_count),
        pending_count: toInteger(row.pending_count),
        success_rate: Number.isFinite(parsedRate)
          ? parsedRate
          : 0,
      },
    });
  } catch (error) {
    logger.error(
      'Personal transaction report summary error:',
      error,
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch report summary',
    });
  }
};

exports.transactionReport = async (req, res) => {
  const { format = 'pdf', period } = req.query;
  const userId = req.user.id;

  try {
    const {
      where,
      params,
      resolvedFrom,
      resolvedTo,
    } = buildPersonalReportScope(
      userId,
      req.query,
    );

    // Personal reporting records app-performed transaction activity.
    // Keep every filtered transaction in the report and expose simple
    // status counts for the activity summary.
    const [txResult, summaryResult] = await Promise.all([
      query(`SELECT * FROM personal_transactions ${where} ORDER BY created_at DESC LIMIT 5000`, params),
      query(
        personalActivitySummarySql(where),
        params,
      ),
    ]);

    const transactions = txResult.rows;
    const summary = summaryResult.rows[0];
    const periodLabel = period || `${resolvedFrom?.slice(0, 10) || 'all time'} to ${resolvedTo?.slice(0, 10)}`;
    const title = `My Transaction Report — ${periodLabel}`;

    if (format === 'csv') {
      const csv = generateCSV(transactions, [
        { label: 'Date', key: 'created_at', getValue: r => new Date(r.created_at).toLocaleString('en-GH') },
        { label: 'Reference', key: 'reference' },
        { label: 'Network Ref', key: 'network_reference' },
        { label: 'Type', key: 'transaction_type' },
        { label: 'Provider', key: 'provider' },
        { label: 'Recipient Phone', key: 'recipient_phone' },
        { label: 'Amount (GHS)', key: 'amount' },
        { label: 'Status', key: 'status' },
        { label: 'SIM (ICCID)', key: 'sim_iccid' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="my_transactions_${Date.now()}.csv"`);
      return res.send(csv);
    }

    const buffer = await generatePersonalTransactionReportPDF({ transactions, summary, title });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="my_transactions_${Date.now()}.pdf"`);
    return res.send(buffer);

  } catch (error) {
    logger.error('Personal transaction report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
};
