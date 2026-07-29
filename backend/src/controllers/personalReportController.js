const { query } = require('../config/database');
const { logger } = require('../utils/logger');
const { generatePersonalTransactionReportPDF, generateCSV } = require('../services/reportService');

// ─── Personal Transaction Report (CSV + PDF) ─────────────────
// Paid-Personal-only per spec. Always scoped to the current user -
// there is no branch/agent/commission concept on the Personal side,
// so this is deliberately simpler than the Agent transaction report.

exports.transactionReport = async (req, res) => {
  const { format = 'pdf', from_date, to_date, provider, transaction_type, status, period } = req.query;
  const userId = req.user.id;

  try {
    let resolvedFrom = from_date;
    let resolvedTo = to_date || new Date().toISOString();
    if (period && !from_date) {
      const now = new Date();
      if (period === 'today') resolvedFrom = new Date(now.setHours(0, 0, 0, 0)).toISOString();
      if (period === 'week') { const d = new Date(); d.setDate(d.getDate() - 7); resolvedFrom = d.toISOString(); }
      if (period === 'month') { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); resolvedFrom = d.toISOString(); }
      if (period === 'year') { const d = new Date(); d.setMonth(0, 1); d.setHours(0, 0, 0, 0); resolvedFrom = d.toISOString(); }
    }

    const conditions = ['user_id = $1'];
    const params = [userId];
    let idx = 2;
    if (provider) { conditions.push(`provider = $${idx++}`); params.push(provider); }
    if (transaction_type) { conditions.push(`transaction_type = $${idx++}`); params.push(transaction_type); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (resolvedFrom) { conditions.push(`created_at >= $${idx++}`); params.push(resolvedFrom); }
    if (resolvedTo) { conditions.push(`created_at <= $${idx++}`); params.push(resolvedTo); }
    const where = `WHERE ${conditions.join(' AND ')}`;

    const [txResult, summaryResult] = await Promise.all([
      query(`SELECT * FROM personal_transactions ${where} ORDER BY created_at DESC LIMIT 5000`, params),
      query(
        `SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total_amount,
                ROUND(100.0 * COUNT(CASE WHEN status = 'success' THEN 1 END) / NULLIF(COUNT(*), 0), 1) as success_rate
         FROM personal_transactions ${where}`,
        params
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
