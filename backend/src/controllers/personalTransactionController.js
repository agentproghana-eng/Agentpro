const crypto = require('crypto');
const { query } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const {
  sanitizeUSSDLog,
  sanitizeFailureReason,
} = require('./transactionController');

const normalizePersonalOperationString = (value) =>
  value === null || value === undefined
    ? ''
    : String(value).trim();

const normalizePersonalOperationInteger = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : normalizePersonalOperationString(value);
};

const normalizePersonalOperationAmount = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed.toFixed(2)
    : normalizePersonalOperationString(value);
};

const buildPersonalOperationFingerprint = (body) => {
  const selections = Array.isArray(body.selections_in_order)
    ? body.selections_in_order.map((value) =>
        normalizePersonalOperationString(value)
      )
    : [];

  const normalizedIccid =
    normalizePersonalOperationString(body.sim_iccid);

  // Fixed property order makes JSON deterministic. The stored digest is
  // deliberately irreversible: it protects retry identity without storing
  // another copy of customer transaction data.
  const canonicalPayload = {
    provider: normalizePersonalOperationString(body.provider),
    transaction_type: normalizePersonalOperationString(
      body.transaction_type
    ),
    amount: normalizePersonalOperationAmount(body.amount),
    recipient_phone: normalizePersonalOperationString(
      body.recipient_phone
    ),
    merchant_id: normalizePersonalOperationString(body.merchant_id),
    notes: normalizePersonalOperationString(body.notes),
    sim_iccid: normalizedIccid,
    sim_slot: normalizePersonalOperationInteger(body.sim_slot),

    // ICCID + observed slot is authoritative when ICCID is available.
    // Installation/subscription metadata is only a fallback identity.
    installation_id: normalizedIccid
      ? ''
      : normalizePersonalOperationString(
          body.installation_id
        ),
    sim_subscription_id: normalizedIccid
      ? null
      : normalizePersonalOperationInteger(
          body.sim_subscription_id
        ),
    bundle_category: normalizePersonalOperationString(
      body.bundle_category
    ),
    recipient_mode: normalizePersonalOperationString(
      body.recipient_mode
    ),
    selections_in_order: selections,
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalPayload))
    .digest('hex');
};

const sendPersonalIdempotentReplay = ({
  res,
  existing,
  requestBody,
  personalOverrideEntitled,
  message,
}) => res.status(200).json({
  success: true,
  message,
  data: {
    transaction_id: existing.id,
    reference: existing.reference,
    status: existing.status,
    created_at: existing.created_at,
    automation_entitled: true,
    personal_override_entitled: personalOverrideEntitled,
    manual_dial_code: null,
    automation_params: {
      amount:
        requestBody.amount != null
          ? requestBody.amount.toString()
          : '',
      customer_phone: requestBody.recipient_phone || '',
      recipient_phone: requestBody.recipient_phone || '',
      payment_reference: requestBody.notes || '',
      merchant_id: requestBody.merchant_id || '',
    },
    idempotent_replay: true,
  },
});

// ─── Initiate Personal Transaction ─────────────────────────────
// Deliberately simpler than the Agent side: no branch/company, no fee,
// no commission - Personal transactions genuinely don't have any of
// those concepts.

exports.initiateTransaction = async (req, res) => {
  const {
    provider,
    transaction_type,
    amount,
    recipient_phone,
    merchant_id,
    sim_iccid,
    sim_slot,
    notes,
    bundle_category,
    recipient_mode,
    installation_id,
    sim_subscription_id,
    client_operation_id,
  } = req.body;

  const userId = req.user.id;

  const clientOperationFingerprint = client_operation_id
    ? buildPersonalOperationFingerprint(req.body)
    : null;

  try {
    // Centrally managed Global USSD automation is available to every
    // Personal account, including Free Personal. Paid Personal additionally
    // unlocks that user's own Personal Flow Builder override.
    //
    // Keep those concepts separate: downgrade must disable the custom
    // override without disabling the safe centrally managed Global flow.
    const subscription = req.personalSubscription;
    const personalOverrideEntitled =
      subscription?.plan === 'paid' &&
      (!subscription.expires_at ||
        new Date(subscription.expires_at) >= new Date());

    // Resolve a retry before any flow lookup or INSERT. If the original
    // response was lost after the server committed the row, the same
    // client-generated UUID must return that exact transaction.
    if (client_operation_id) {
      const existingResult = await query(
        `SELECT id, reference, status, created_at,
                client_operation_fingerprint
         FROM personal_transactions
         WHERE user_id = $1
           AND client_operation_id = $2`,
        [userId, client_operation_id]
      );

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];

        if (
          existing.client_operation_fingerprint !==
          clientOperationFingerprint
        ) {
          return res.status(409).json({
            success: false,
            code: 'CLIENT_OPERATION_CONFLICT',
            message:
              'client_operation_id has already been used for a different transaction'
          });
        }

        return sendPersonalIdempotentReplay({
          res,
          existing,
          requestBody: req.body,
          personalOverrideEntitled,
          message: 'Existing personal transaction returned for retry.',
        });
      }
    }

    // Paid users resolve their own Personal override first, then Global.
    // Free users must never consume a Personal override after downgrade:
    // they use only the centrally managed Global flow as the source of the
    // provider's manual USSD entry code.
    let selectedFlow = null;

    if (personalOverrideEntitled) {
      const personalFlow = await query(
        `SELECT dial_code
         FROM ussd_flows
         WHERE owner_user_id = $1
           AND company_id IS NULL
           AND provider = $2
           AND transaction_type = $3
           AND is_active = true
           AND COALESCE(bundle_category,'') = COALESCE($4,'')
           AND COALESCE(recipient_mode,'') = COALESCE($5,'')
         LIMIT 1`,
        [
          userId,
          provider,
          transaction_type,
          bundle_category || null,
          recipient_mode || null,
        ]
      );

      selectedFlow = personalFlow.rows[0] || null;
    }

    // Match the Personal runtime resolver's precedence exactly:
    // Personal override first for Paid users, then true Global fallback.
    // Free users skip the Personal query entirely and always start here.
    if (!selectedFlow) {
      const globalFlow = await query(
        `SELECT dial_code
         FROM ussd_flows
         WHERE company_id IS NULL
           AND owner_user_id IS NULL
           AND provider = $1
           AND transaction_type = $2
           AND is_active = true
           AND COALESCE(bundle_category,'') = COALESCE($3,'')
           AND COALESCE(recipient_mode,'') = COALESCE($4,'')
         LIMIT 1`,
        [
          provider,
          transaction_type,
          bundle_category || null,
          recipient_mode || null,
        ]
      );

      selectedFlow = globalFlow.rows[0] || null;
    }

    if (!selectedFlow) {
      return res.status(400).json({
        success: false,
        message: `No USSD flow configured for ${provider} ${transaction_type}`
      });
    }

    // Reaching this point means an active Personal or Global flow exists.
    // Global flow automation is therefore available regardless of whether
    // this Personal account is Free or Paid.
    const automationEntitled = true;
    const manualDialCode = null;

    const reference = `PER-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    let result;

    try {
      result = await query(
        `INSERT INTO personal_transactions (
          user_id, reference, provider, transaction_type, status,
          amount, recipient_phone, sim_iccid, sim_slot, notes,
          client_operation_id, client_operation_fingerprint
        ) VALUES (
          $1, $2, $3, $4, 'initiated', $5, $6, $7, $8, $9,
          $10, $11
        )
        RETURNING id, reference, status, created_at`,
        [
          userId,
          reference,
          provider,
          transaction_type,
          amount || null,
          recipient_phone || null,
          sim_iccid || null,
          sim_slot ?? null,
          notes || null,
          client_operation_id || null,
          clientOperationFingerprint,
        ]
      );
    } catch (insertError) {
      // Two identical retries can race past the initial lookup. The unique
      // index is the final concurrency barrier: exactly one INSERT wins.
      if (
        client_operation_id &&
        insertError.code === '23505' &&
        insertError.constraint ===
          'idx_personal_transactions_user_client_operation'
      ) {
        const replayResult = await query(
          `SELECT id, reference, status, created_at,
                  client_operation_fingerprint
           FROM personal_transactions
           WHERE user_id = $1
             AND client_operation_id = $2`,
          [userId, client_operation_id]
        );

        if (replayResult.rows.length > 0) {
          const existing = replayResult.rows[0];

          if (
            existing.client_operation_fingerprint !==
            clientOperationFingerprint
          ) {
            return res.status(409).json({
              success: false,
              code: 'CLIENT_OPERATION_CONFLICT',
              message:
                'client_operation_id has already been used for a different transaction'
            });
          }

          return sendPersonalIdempotentReplay({
            res,
            existing,
            requestBody: req.body,
            personalOverrideEntitled,
            message:
              'Existing personal transaction returned for concurrent retry.',
          });
        }
      }

      throw insertError;
    }

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

    // Every Personal account may execute a centrally managed Global flow.
    // personal_override_entitled separately tells Flutter whether cached
    // Personal-owned overrides are allowed for this account.
    // PIN values are never included.
    res.status(201).json({
      success: true,
      data: {
        transaction_id: transaction.id,
        reference: transaction.reference,
        status: transaction.status,
        created_at: transaction.created_at,
        // This value comes from the server-side subscription check above.
        // Flutter must use it before considering native, cached, or resolved
        // automation so a stale Paid cache cannot survive a downgrade.
        automation_entitled: automationEntitled,
        personal_override_entitled: personalOverrideEntitled,
        manual_dial_code: manualDialCode,
        // notes doubles as the reference value here rather than adding
        // a dedicated column - Send Money's flow has a send_reference
        // step (confirmed via a real device test), and notes was
        // already an accepted, unused field on this endpoint.
        automation_params: {
          amount: amount != null ? amount.toString() : '',
          customer_phone: recipient_phone || '',
          recipient_phone: recipient_phone || '',
          payment_reference: notes || '',
          // Withdraw Cash's "Till Number" is the same underlying
          // concept as Agent's merchant_id (an agent/merchant
          // identifier code) - reuses the existing send_merchant_id
          // action rather than inventing a parallel mechanism.
          merchant_id: merchant_id || '',
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
    const sanitizedFailureReason = sanitizeFailureReason(failure_reason, status);

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
      [
        status,
        network_reference || null,
        sanitizedFailureReason,
        JSON.stringify(sanitizedLog),
        notes || null,
        transaction_id,
      ]
    );

    await auditLog({
      userId,
      companyId: null,
      action: `PERSONAL_TRANSACTION_${status.toUpperCase()}`,
      entityType: 'personal_transaction',
      entityId: transaction_id,
      newValues: {
        status,
        network_reference,
        failure_reason: sanitizedFailureReason,
      },
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

// ─── Recent Personal Transactions ───────────────────────────

exports.listRecentTransactions = async (req, res) => {
  const userId = req.user.id;

  const provider =
    typeof req.query.provider === 'string'
      ? req.query.provider.trim()
      : '';

  const simIccid =
    typeof req.query.sim_iccid === 'string'
      ? req.query.sim_iccid.trim()
      : '';

  const rawSimSlot = req.query.sim_slot;
  const parsedSimSlot =
    typeof rawSimSlot === 'string' && rawSimSlot.trim() !== ''
      ? Number.parseInt(rawSimSlot, 10)
      : Number.isInteger(rawSimSlot)
        ? rawSimSlot
        : null;

  const conditions = ['user_id = $1'];
  const params = [userId];
  let idx = 2;

  if (provider) {
    conditions.push(`provider = $${idx++}`);
    params.push(provider);
  }

  if (simIccid) {
    conditions.push(`sim_iccid = $${idx++}`);
    params.push(simIccid);
  }

  if (Number.isInteger(parsedSimSlot) && parsedSimSlot >= 0) {
    conditions.push(`sim_slot = $${idx++}`);
    params.push(parsedSimSlot);
  }

  try {
    const result = await query(
      `SELECT *
       FROM personal_transactions
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC, id DESC
       LIMIT 5`,
      params
    );

    res.json({
      success: true,
      data: result.rows,
      meta: {
        limit: 5,
      },
    });
  } catch (error) {
    logger.error('List recent personal transactions error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
    });
  }
};

// ─── List Personal Transactions ─────────────────────────────
// Always scoped to the current user only - unlike the Agent side,
// there is no manager/owner "view others' transactions" concept here.

exports.listTransactions = async (req, res) => {
  const {
    page = 1,
    limit = 20,
    provider,
    transaction_type,
    status,
    search,
    from_date,
    to_date,
    sim_iccid,
    sim_slot,
    sort_by = 'date',
    sort_order = 'desc',
  } = req.query;

  const userId = req.user.id;

  const SORT_COLUMNS = {
    date: 'created_at',
    amount: 'amount',
  };

  const sortColumn = SORT_COLUMNS[sort_by] || SORT_COLUMNS.date;
  const sortDirection = sort_order === 'asc' ? 'ASC' : 'DESC';

  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(
    Math.max(parseInt(limit, 10) || 20, 1),
    100
  );

  try {
    const offset = (parsedPage - 1) * parsedLimit;

    const conditions = ['user_id = $1'];
    const params = [userId];
    let idx = 2;

    if (provider) {
      conditions.push(`provider = $${idx++}`);
      params.push(provider);
    }

    if (transaction_type) {
      conditions.push(`transaction_type = $${idx++}`);
      params.push(transaction_type);
    }

    if (status) {
      conditions.push(`status = $${idx++}`);
      params.push(status);
    }

    if (sim_iccid) {
      conditions.push(`sim_iccid = $${idx++}`);
      params.push(sim_iccid);
    }

    if (
      sim_slot !== undefined &&
      sim_slot !== null &&
      String(sim_slot).trim() !== ''
    ) {
      const parsedHistorySimSlot = Number.parseInt(sim_slot, 10);

      if (
        Number.isInteger(parsedHistorySimSlot) &&
        parsedHistorySimSlot >= 0
      ) {
        conditions.push(`sim_slot = $${idx++}`);
        params.push(parsedHistorySimSlot);
      }
    }

    if (from_date) {
      const parsed = new Date(from_date);

      if (!Number.isNaN(parsed.getTime())) {
        conditions.push(`created_at >= $${idx++}`);
        params.push(parsed);
      }
    }

    if (to_date) {
      const parsed = new Date(to_date);

      if (!Number.isNaN(parsed.getTime())) {
        conditions.push(`created_at <= $${idx++}`);
        params.push(parsed);
      }
    }

    const normalizedSearch =
      typeof search === 'string' ? search.trim() : '';

    if (normalizedSearch) {
      const pattern = `%${normalizedSearch}%`;

      conditions.push(`(
        reference ILIKE $${idx}
        OR COALESCE(recipient_phone, '') ILIKE $${idx}
        OR COALESCE(network_reference, '') ILIKE $${idx}
        OR COALESCE(notes, '') ILIKE $${idx}
      )`);

      params.push(pattern);
      idx += 1;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const dataParams = [...params, parsedLimit, offset];
    const limitIndex = idx;
    const offsetIndex = idx + 1;

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT *
         FROM personal_transactions
         ${where}
         ORDER BY ${sortColumn} ${sortDirection}, id DESC
         LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
        dataParams
      ),
      query(
        `SELECT COUNT(*)
         FROM personal_transactions
         ${where}`,
        params
      ),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);

    res.json({
      success: true,
      data: dataResult.rows,
      meta: {
        total,
        page: parsedPage,
        limit: parsedLimit,
        total_pages: Math.ceil(total / parsedLimit),
      },
    });
  } catch (error) {
    logger.error('List personal transactions error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to fetch transactions',
    });
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
