const { query } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const { sanitizeUSSDLog } = require('./transactionController');

const PERSONAL_TRANSACTION_TYPES = [
  'send_money_same_network',
  'send_money_cross_network',
  'buy_airtime',
  'buy_data',
  'buy_mashup',
  'check_momo_balance',
  'check_airtime_balance',
];

// ─── Initiate Personal Transaction ─────────────────────────────
// Deliberately simpler than the Agent side: no branch/company, no fee,
// no commission - Personal transactions genuinely don't have any of
// those concepts.

exports.initiateTransaction = async (req, res) => {
  const { provider, transaction_type, amount, recipient_phone, sim_iccid, sim_slot, notes } = req.body;
  const userId = req.user.id;

  if (!PERSONAL_TRANSACTION_TYPES.includes(transaction_type)) {
    return res.status(400).json({ success: false, message: 'Invalid personal transaction type' });
  }

  try {
    // Confirm some automation exists before creating the record -
    // mirrors the same requirement on the Agent side. Checked directly
    // here (not by calling /ussd-flows/resolve) using the same priority
    // order: this user's own personal-owned flow, else the global
    // default.
    const personalFlow = await query(
      `SELECT 1 FROM ussd_flows WHERE owner_user_id = $1 AND provider = $2 AND transaction_type = $3 AND is_active = true`,
      [userId, provider, transaction_type]
    );
    const globalFlow = await query(
      `SELECT 1 FROM ussd_flows WHERE company_id IS NULL AND owner_user_id IS NULL AND provider = $1 AND transaction_type = $2 AND is_active = true`,
      [provider, transaction_type]
    );
    if (personalFlow.rows.length === 0 && globalFlow.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No USSD flow configured for ${provider} ${transaction_type}`
      });
    }

    const reference = `PER-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    const result = await query(
      `INSERT INTO personal_transactions (
        user_id, reference, provider, transaction_type, status,
        amount, recipient_phone, sim_iccid, sim_slot, notes
      ) VALUES ($1, $2, $3, $4, 'initiated', $5, $6, $7, $8, $9)
      RETURNING id, reference, status, created_at`,
      [userId, reference, provider, transaction_type, amount || null, recipient_phone || null, sim_iccid || null, sim_slot ?? null, notes || null]
    );

    const transaction = result.rows[0];

    await auditLog({
      userId,
      companyId: null,
      action: 'PERSONAL_TRANSACTION_INITIATED',
      entityType: 'personal_transaction',
      entityId: transaction.id,
      newValues: { provider, transaction_type, amount },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId
    });

    // Personal transactions are entirely Flow Builder-based (no
    // legacy ussd_templates equivalent), so there's no ussd_template
    // field here - the app resolves the actual flow steps separately
    // via GET /ussd-flows/resolve after this call succeeds, same as
    // Agent. What WAS missing until now: automation_params, the
    // pre-filled values the app fills into that flow's steps
    // (send_amount, send_customer_phone, etc.) - without this, even a
    // successfully resolved flow would have nothing to dial with.
    // transaction_id (not transaction.id/id) matches exactly what
    // Agent's own initiateTransaction response uses, and what the
    // shared TransactionProgressScreen on the Flutter side expects
    // regardless of isPersonal - this was previously spreading the
    // raw transaction object instead, which kept the database row's
    // original "id" key and never actually had a "transaction_id"
    // key at all. That caused transaction['transaction_id'] as String
    // to throw immediately and synchronously on the null value, right
    // at the top of _startUSSD() before even the permission check -
    // explaining why every Personal automation attempt today appeared
    // to hang instantly with no error and no progress at all.
    res.status(201).json({
      success: true,
      data: {
        transaction_id: transaction.id,
        reference: transaction.reference,
        status: transaction.status,
        created_at: transaction.created_at,
        automation_params: {
          amount: amount != null ? amount.toString() : '',
          customer_phone: recipient_phone || '',
          recipient_phone: recipient_phone || '',
        },
      },
    });

  } catch (error) {
    logger.error('Initiate personal transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate transaction' });
  }
};

// ─── Complete Personal Transaction ─────────────────────────────

exports.completeTransaction = async (req, res) => {
  const { transaction_id } = req.params;
  const {
    status, // 'success', 'failed', or 'pending_confirmation' - validated by the route
    network_reference,
    failure_reason,
    ussd_session_log, // USSD trace WITHOUT PIN (flutter removes PIN step log)
    notes
  } = req.body;
  const userId = req.user.id;

  try {
    const existing = await query(
      'SELECT id, status FROM personal_transactions WHERE id = $1 AND user_id = $2',
      [transaction_id, userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    // Same idempotency guard as the Agent side - refuse to re-complete
    // a transaction that has already reached a final state.
    const tx = existing.rows[0];
    if (tx.status !== 'initiated' && tx.status !== 'processing') {
      return res.status(400).json({ success: false, message: `Transaction already ${tx.status}` });
    }

    // CRITICAL: same PIN-safety check as the Agent side - never store
    // raw USSD trace without stripping PIN entry steps first.
    const sanitizedLog = sanitizeUSSDLog(ussd_session_log);

    const result = await query(
      `UPDATE personal_transactions
       SET status = $1,
           network_reference = COALESCE($2, network_reference),
           failure_reason = $3,
           ussd_session_log = $4,
           notes = COALESCE($5, notes),
           completed_at = CASE WHEN $1 IN ('success', 'failed') THEN NOW() ELSE completed_at END
       WHERE id = $6
       RETURNING id, reference, status, completed_at`,
      [status, network_reference || null, failure_reason || null, JSON.stringify(sanitizedLog), notes || null, transaction_id]
    );

    await auditLog({
      userId,
      companyId: null,
      action: `PERSONAL_TRANSACTION_${status.toUpperCase()}`,
      entityType: 'personal_transaction',
      entityId: transaction_id,
      newValues: { status, network_reference, failure_reason },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      requestId: req.requestId
    });

    res.json({ success: true, data: result.rows[0] });

  } catch (error) {
    logger.error('Complete personal transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to update transaction' });
  }
};

// ─── List Personal Transactions ─────────────────────────────
// Always scoped to the current user only - unlike the Agent side,
// there is no manager/owner "view others' transactions" concept here.

exports.listTransactions = async (req, res) => {
  const { page = 1, limit = 20, provider, transaction_type, status, sort_by = 'date', sort_order = 'desc' } = req.query;
  const userId = req.user.id;

  const SORT_COLUMNS = { date: 'created_at', amount: 'amount' };
  const sortColumn = SORT_COLUMNS[sort_by] || SORT_COLUMNS.date;
  const sortDirection = sort_order === 'asc' ? 'ASC' : 'DESC';

  try {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = ['user_id = $1'];
    const params = [userId];
    let idx = 2;

    if (provider) { conditions.push(`provider = $${idx++}`); params.push(provider); }
    if (transaction_type) { conditions.push(`transaction_type = $${idx++}`); params.push(transaction_type); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT * FROM personal_transactions ${where}
         ORDER BY ${sortColumn} ${sortDirection}
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
      query(`SELECT COUNT(*) FROM personal_transactions ${where}`, params),
    ]);

    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: dataResult.rows,
      meta: { total, page: parseInt(page), limit: parseInt(limit), total_pages: Math.ceil(total / parseInt(limit)) }
    });

  } catch (error) {
    logger.error('List personal transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

// ─── Get Single Personal Transaction ─────────────────────────

exports.getTransaction = async (req, res) => {
  const { transaction_id } = req.params;
  const userId = req.user.id;

  try {
    const result = await query(
      'SELECT * FROM personal_transactions WHERE id = $1 AND user_id = $2',
      [transaction_id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Get personal transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transaction' });
  }
};
