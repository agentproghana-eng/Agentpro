const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const { calculateCommission } = require('../services/commissionService');
const { sendTransactionNotification } = require('../services/notificationService');
const { generateTransactionReceipt } = require('../services/reportService');

// ─── Initiate Transaction ─────────────────────────────────────

exports.initiateTransaction = async (req, res) => {
  const {
    provider,
    transaction_type,
    amount,
    customer_phone,
    customer_name,
    recipient_phone,
    recipient_name,
    biller_code,
    biller_name,
    account_number,
      notes,
      fee
  } = req.body;

  const agentId = req.user.id;
  const companyId = req.user.company_id;

  try {
    // Determine the agent's assigned branch server-side - agents,
    // managers, and owners never send branch_id from the client;
    // every transaction is always recorded against whichever branch
    // the user is currently assigned to via agent_branches (the
    // single source of truth, kept in sync by branch assignment /
    // reassignment endpoints and by branch creation for owners).
    const branchLookup = await query(
      `SELECT b.id FROM branches b
       INNER JOIN agent_branches ab ON ab.branch_id = b.id
       WHERE ab.agent_id = $1 AND b.status = 'active'`,
      [agentId]
    );

    if (branchLookup.rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'You are not currently assigned to a branch. Contact your business owner or manager.'
      });
    }

    const branch_id = branchLookup.rows[0].id;

    // Fetch USSD template for this provider + transaction type
    const templateResult = await query(
      `SELECT * FROM ussd_templates
       WHERE provider = $1 AND transaction_type = $2 AND is_active = TRUE`,
      [provider, transaction_type]
    );

    if (templateResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No USSD template found for ${provider} ${transaction_type}`
      });
    }

    const template = templateResult.rows[0];
    const reference = `APG-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      // Transfer charge: only meaningful for send_money; the agent enters
      // it (pre-filled client-side with an auto-calculated 1% of amount,
      // no cap) before dialing, and it is stored on the transaction record
      // right away so it survives even if the transaction later fails.
      const feeValue = transaction_type === 'send_money' ? (parseFloat(fee) || 0) : 0;

    // Create transaction record
    const txResult = await query(
      `INSERT INTO transactions (
        reference, agent_id, branch_id, company_id, provider,
        transaction_type, status, amount, customer_phone, customer_name,
        recipient_phone, recipient_name, biller_code, biller_name,
        account_number, notes, fee
      ) VALUES ($1, $2, $3, $4, $5, $6, 'initiated', $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING id, reference, status, created_at`,
      [
        reference, agentId, branch_id, companyId, provider,
        transaction_type, amount, customer_phone, customer_name,
        recipient_phone, recipient_name, biller_code, biller_name,
        account_number, notes, feeValue
      ]
    );

    const transaction = txResult.rows[0];

    await auditLog({
      userId: agentId,
      companyId,
      action: 'TRANSACTION_INITIATED',
      entityType: 'transaction',
      entityId: transaction.id,
      newValues: { reference, provider, transaction_type, amount, customer_phone },
      ipAddress: req.ip,
      requestId: req.requestId
    });

    // Return transaction details + USSD template for the Flutter app
    // The app will execute USSD automation using this template
    res.status(201).json({
      success: true,
      message: 'Transaction initiated. Proceed with USSD execution.',
      data: {
        transaction_id: transaction.id,
        reference: transaction.reference,
        status: transaction.status,
        ussd_template: {
          id: template.id,
          ussd_string_pattern: template.ussd_string_pattern,
          pin_prompt_strings: template.pin_prompt_strings,
          success_strings: template.success_strings,
          failure_strings: template.failure_strings,
          timeout_seconds: template.timeout_seconds,
          retry_count: template.retry_count
        },
        // Pre-filled values for USSD automation
        automation_params: {
          amount: amount.toString(),
          customer_phone: customer_phone || '',
          recipient_phone: recipient_phone || '',
          biller_code: biller_code || '',
          account_number: account_number || ''
        }
      }
    });

  } catch (error) {
    logger.error('Transaction initiation error:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate transaction' });
  }
};

// ─── Complete Transaction (called after USSD automation result) ─

exports.completeTransaction = async (req, res) => {
  const { transaction_id } = req.params;
  const {
    status, // 'success' or 'failed'
    network_reference,
    failure_reason,
    ussd_session_log // USSD trace WITHOUT PIN (flutter removes PIN step log)
  } = req.body;

  const agentId = req.user.id;

  try {
    // Fetch transaction
    const txResult = await query(
      'SELECT * FROM transactions WHERE id = $1 AND agent_id = $2',
      [transaction_id, agentId]
    );

    if (txResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const tx = txResult.rows[0];

    if (tx.status !== 'initiated' && tx.status !== 'processing') {
      return res.status(400).json({
        success: false,
        message: `Transaction already ${tx.status}`
      });
    }

    // CRITICAL: Validate no PIN data in session log
    const sanitizedLog = sanitizeUSSDLog(ussd_session_log);

    // status is validated by the route as one of: success, failed,
    // pending_confirmation. Do NOT collapse pending_confirmation into
    // failed — the whole point of that status is that we genuinely do
    // not know the outcome (e.g. the network never confirmed after a
    // PIN prompt), and money may have actually moved. Treating it as a
    // definite failure here could tell an agent to safely retry a
    // transaction that already succeeded.
    const finalStatus = status;

    await withTransaction(async (client) => {
      // Update transaction
      await client.query(
        `UPDATE transactions SET
          status = $1,
          network_reference = $2,
          failure_reason = $3,
          ussd_session_log = $4,
          completed_at = NOW()
         WHERE id = $5`,
        [finalStatus, network_reference, failure_reason, JSON.stringify(sanitizedLog), transaction_id]
      );

      // Float and commission are only ever updated on a CONFIRMED
      // success — never on pending_confirmation, since we don't know
      // whether the money actually moved.
      if (finalStatus === 'success') {
        await updateFloat(client, tx.branch_id, tx.provider, tx.transaction_type, tx.amount, transaction_id);
        await calculateAndRecordCommission(client, tx, agentId);
        await calculateAndRecordSendMoneyFee(client, tx, agentId);
      }

      const notificationType = {
        success: 'transaction_success',
        failed: 'transaction_failed',
        pending_confirmation: 'transaction_pending_confirmation',
      }[finalStatus];

      await sendTransactionNotification(agentId, {
        type: notificationType,
        transaction: { ...tx, status: finalStatus, network_reference, failure_reason }
      });

      await auditLog({
        userId: agentId,
        companyId: tx.company_id,
        action: `TRANSACTION_${finalStatus.toUpperCase()}`,
        entityType: 'transaction',
        entityId: transaction_id,
        newValues: { status: finalStatus, network_reference, failure_reason },
        ipAddress: req.ip,
        requestId: req.requestId
      });
    });

    // Generate receipt PDF only on confirmed success
    let receiptUrl = null;
    if (finalStatus === 'success') {
      const updatedTx = await query('SELECT * FROM transactions WHERE id = $1', [transaction_id]);
      receiptUrl = await generateTransactionReceipt(updatedTx.rows[0]);

      if (receiptUrl) {
        await query('UPDATE transactions SET receipt_url = $1 WHERE id = $2', [receiptUrl, transaction_id]);
      }
    }

    const finalTx = await query('SELECT * FROM transactions WHERE id = $1', [transaction_id]);

    const messages = {
      success: 'Transaction completed successfully',
      failed: 'Transaction failed',
      pending_confirmation: 'Transaction outcome could not be confirmed. Please verify manually before retrying.',
    };

    res.json({
      success: true,
      message: messages[finalStatus],
      data: {
        ...finalTx.rows[0],
        receipt_url: receiptUrl
      }
    });

  } catch (error) {
    logger.error('Transaction completion error:', error);
    res.status(500).json({ success: false, message: 'Failed to complete transaction' });
  }
};

// ─── Get Transaction ──────────────────────────────────────────

exports.getTransaction = async (req, res) => {
  const { transaction_id } = req.params;

  try {
    let whereClause = 'WHERE t.id = $1';
    const params = [transaction_id];

    // Scope access by role. Managers only see transactions from
    // branches they actually manage - without this they'd see every
    // company transaction, same class of gap already fixed for
    // listUsers and listBranches.
    if (req.user.role === 'agent') {
      whereClause += ' AND t.agent_id = $2';
      params.push(req.user.id);
    } else if (req.user.role === 'manager') {
      whereClause += ' AND t.branch_id IN (SELECT branch_id FROM branch_managers WHERE manager_id = $2)';
      params.push(req.user.id);
    } else if (['business_owner', 'auditor'].includes(req.user.role)) {
      whereClause += ' AND t.company_id = $2';
      params.push(req.user.company_id);
    }

    const result = await query(
      `SELECT t.*,
              u.first_name || ' ' || u.last_name as agent_name,
              b.name as branch_name,
              c.name as company_name,
              cm.gross_commission, cm.net_commission
       FROM transactions t
       LEFT JOIN users u ON t.agent_id = u.id
       LEFT JOIN branches b ON t.branch_id = b.id
       LEFT JOIN companies c ON t.company_id = c.id
       LEFT JOIN commissions cm ON cm.transaction_id = t.id
       ${whereClause}`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Get transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transaction' });
  }
};

// ─── List Transactions ────────────────────────────────────────

exports.listTransactions = async (req, res) => {
  const {
    page = 1,
    limit = 20,
    provider,
    transaction_type,
    status,
    branch_id,
    agent_id,
    from_date,
    to_date,
    customer_phone,
    search,
    sort_by = 'date',
    sort_order = 'desc',
  } = req.query;

  // Strict allowlist mapping a client-facing sort key to a safe SQL
  // column expression - never interpolate the raw sort_by value
  // directly into ORDER BY, which would be a SQL injection surface.
  const SORT_COLUMNS = {
    date: 't.created_at',
    amount: 't.amount',
    commission: 'cm.net_commission',
    fee: 't.fee',
    provider: 't.provider',
  };
  const sortColumn = SORT_COLUMNS[sort_by] || SORT_COLUMNS.date;
  const sortDirection = sort_order === 'asc' ? 'ASC' : 'DESC';

  try {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    // Role-based scoping. Managers only see transactions from branches
    // they actually manage - without this they'd see every company
    // transaction, same class of gap already fixed for listUsers and
    // listBranches.
    if (req.user.role === 'agent') {
      conditions.push(`t.agent_id = $${paramIdx++}`);
      params.push(req.user.id);
    } else if (req.user.role === 'manager') {
      conditions.push(`t.branch_id IN (SELECT branch_id FROM branch_managers WHERE manager_id = $${paramIdx++})`);
      params.push(req.user.id);
    } else if (['business_owner', 'auditor'].includes(req.user.role)) {
      conditions.push(`t.company_id = $${paramIdx++}`);
      params.push(req.user.company_id);
    }

    if (provider) { conditions.push(`t.provider = $${paramIdx++}`); params.push(provider); }
    if (transaction_type) { conditions.push(`t.transaction_type = $${paramIdx++}`); params.push(transaction_type); }
    if (status) { conditions.push(`t.status = $${paramIdx++}`); params.push(status); }
    if (branch_id) { conditions.push(`t.branch_id = $${paramIdx++}`); params.push(branch_id); }
    if (agent_id && req.user.role !== 'agent') {
      conditions.push(`t.agent_id = $${paramIdx++}`);
      params.push(agent_id);
    }
    if (customer_phone) { conditions.push(`t.customer_phone = $${paramIdx++}`); params.push(customer_phone); }
    if (from_date) { conditions.push(`t.created_at >= $${paramIdx++}`); params.push(from_date); }
    if (to_date) { conditions.push(`t.created_at <= $${paramIdx++}`); params.push(to_date); }
    if (search) {
      conditions.push(`(t.reference ILIKE $${paramIdx} OR t.customer_phone ILIKE $${paramIdx} OR t.customer_name ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT t.id, t.reference, t.provider, t.transaction_type, t.status,
                t.amount, t.fee, t.customer_phone, t.customer_name,
                t.network_reference, t.receipt_url, t.created_at, t.completed_at,
                u.first_name || ' ' || u.last_name as agent_name,
                b.name as branch_name,
                cm.net_commission
         FROM transactions t
         LEFT JOIN users u ON t.agent_id = u.id
         LEFT JOIN branches b ON t.branch_id = b.id
         LEFT JOIN commissions cm ON cm.transaction_id = t.id
         ${whereClause}
         ORDER BY ${sortColumn} ${sortDirection}
         LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
        [...params, parseInt(limit), offset]
      ),
      query(
        `SELECT COUNT(*) FROM transactions t ${whereClause}`,
        params
      )
    ]);

    const total = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      data: dataResult.rows,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(total / parseInt(limit))
      }
    });

  } catch (error) {
    logger.error('List transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
};

// ─── Helper: Update Float After Transaction ───────────────────

async function updateFloat(client, branchId, provider, transactionType, amount, transactionId) {
  // Cash In: float decreases (we gave cash out, network received)
  // Cash Out: float increases (we received cash, network sent)
  const floatDelta = ['cash_out'].includes(transactionType) ? amount : -amount;

  const floatResult = await client.query(
    'SELECT id, current_balance FROM float_accounts WHERE branch_id = $1 AND provider = $2',
    [branchId, provider]
  );

  if (floatResult.rows.length === 0) return;

  const float = floatResult.rows[0];
  const balanceBefore = parseFloat(float.current_balance);
  const balanceAfter = balanceBefore + parseFloat(floatDelta);

  await client.query(
    'UPDATE float_accounts SET current_balance = $1, last_updated_at = NOW() WHERE id = $2',
    [balanceAfter, float.id]
  );

  await client.query(
    `INSERT INTO float_movements (
      float_account_id, movement_type, amount, balance_before,
      balance_after, transaction_id, performed_by
    ) VALUES ($1, 'debit', $2, $3, $4, $5, $5)`,
    [float.id, Math.abs(floatDelta), balanceBefore, balanceAfter, transactionId]
  );

  // Check low float threshold
  const floatAccount = await client.query(
    'SELECT low_balance_threshold FROM float_accounts WHERE id = $1',
    [float.id]
  );

  if (balanceAfter <= parseFloat(floatAccount.rows[0].low_balance_threshold)) {
    // Trigger low float notification (async, don't await)
    const { sendLowFloatAlert } = require('../services/notificationService');
    sendLowFloatAlert(branchId, provider, balanceAfter).catch(console.error);
  }
}

// ─── Helper: Calculate and Record Commission ──────────────────

async function calculateAndRecordCommission(client, transaction, agentId) {
  try {
    // Find applicable commission rule (company-specific first, then global)
    const ruleResult = await client.query(
      `SELECT * FROM commission_rules
       WHERE (company_id = $1 OR company_id IS NULL)
         AND (provider = $2 OR provider IS NULL)
         AND (transaction_type = $3 OR transaction_type IS NULL)
         AND is_active = TRUE
         AND effective_from <= CURRENT_DATE
         AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
       ORDER BY company_id NULLS LAST, provider NULLS LAST, transaction_type NULLS LAST
       LIMIT 1`,
      [transaction.company_id, transaction.provider, transaction.transaction_type]
    );

    if (ruleResult.rows.length === 0) return;

    const rule = ruleResult.rows[0];
    const { gross, provider_share, net } = await calculateCommission(
      parseFloat(transaction.amount),
      parseFloat(rule.rate_percent),
      rule.threshold_amount ? parseFloat(rule.threshold_amount) : null,
      rule.cap_amount ? parseFloat(rule.cap_amount) : null,
      parseFloat(rule.provider_share_percent)
    );

    await client.query(
      `INSERT INTO commissions (
        transaction_id, agent_id, branch_id, company_id, rule_id,
        gross_commission, provider_share, net_commission
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [transaction.id, agentId, transaction.branch_id, transaction.company_id,
       rule.id, gross, provider_share, net]
    );
  } catch (error) {
    logger.error('Commission calculation error:', error);
    // Don't throw — commission failure shouldn't block transaction completion
  }
}

// Send Money fee: entered by the agent (pre-filled with an auto-calculated
// 1% of the amount, no cap) at the time the transaction is initiated, and
// stored on the transaction record at that point. Applies only when sending
// to a number that is NOT the sending customers own number. Never blocks
// transaction completion if it fails - same pattern as
// calculateAndRecordCommission above.
async function calculateAndRecordSendMoneyFee(client, transaction, agentId) {
  try {
    if (transaction.transaction_type !== "send_money") return;
    const recipient = (transaction.recipient_phone || "").trim();
    const customer = (transaction.customer_phone || "").trim();
    if (!recipient || !customer || recipient === customer) return;

    const amount = parseFloat(transaction.amount);
    // The fee was captured at initiation (agent-editable, pre-filled with
    // 1% of amount, no cap). Fall back to the 1% default only if it is
    // missing/zero - e.g. an older client that did not send one.
    let fee = parseFloat(transaction.fee);
    if (!fee || fee <= 0) {
      fee = amount * 0.01;
      await client.query("UPDATE transactions SET fee = $1 WHERE id = $2", [fee, transaction.id]);
    }

    let balanceResult = await client.query(
      "SELECT * FROM agent_balances WHERE agent_id = $1 AND provider = $2",
      [agentId, transaction.provider]
    );
    if (balanceResult.rows.length === 0) {
      balanceResult = await client.query(
        "INSERT INTO agent_balances (agent_id, provider) VALUES ($1, $2) RETURNING *",
        [agentId, transaction.provider]
      );
    }
    const balance = balanceResult.rows[0];
    const cashBefore = parseFloat(balance.cash_at_hand);
    const cashAfter = cashBefore + fee;

    await client.query(
      "UPDATE agent_balances SET cash_at_hand = $1, last_updated_at = NOW() WHERE id = $2",
      [cashAfter, balance.id]
    );
    await client.query(
      `INSERT INTO agent_balance_movements
       (agent_id, provider, movement_type, balance_type, amount, balance_before, balance_after, transaction_id)
       VALUES ($1, $2, 'charge_collected', 'cash_at_hand', $3, $4, $5, $6)`,
      [agentId, transaction.provider, fee, cashBefore, cashAfter, transaction.id]
    );
  } catch (error) {
    logger.error("Send Money fee calculation error:", error);
  }
}

// ─── Helper: Sanitize USSD Log (remove any PIN-related data) ─
//
// The current engine (see ussd_service.dart) hardcodes a safe
// placeholder string for its 'pin_prompt_seen' log entries and never
// has a code path that could substitute a real PIN value there — the
// app architecturally never receives the PIN from the OS/network. This
// function is a defense-in-depth backstop, not the primary control: if
// a future change to the Flutter engine ever accidentally logged
// something PIN-like, this is what would catch it before it reaches
// storage. It must be kept in sync with whatever log entry shape the
// engine currently produces, or that backstop silently stops working
// while still claiming to be active.
function sanitizeUSSDLog(log) {
  if (!log) return null;
  if (!Array.isArray(log)) return log;

  return log.map(step => {
    const sanitized = { ...step };

    // Current format (single-dial engine, see migration 002):
    // { type: 'pin_prompt_seen', response: '[placeholder]', ... }
    if (step.type === 'pin_prompt_seen') {
      delete sanitized.response;
      delete sanitized.dialed;
      sanitized.response = '[PIN ENTRY — NOT LOGGED, NOT APP-VISIBLE]';
      return sanitized;
    }

    // Legacy format (pre-migration-002 app versions, kept during any
    // phased rollout where old and new clients briefly coexist):
    // { is_pin_step: true, type: 'pin', input: ... }
    if (step.is_pin_step || step.type === 'pin') {
      delete sanitized.input;
      delete sanitized.value;
      sanitized.note = '[PIN ENTRY - NOT LOGGED]';
    }

    return sanitized;
  });
}

// Exported for direct unit testing (see tests/unit/commission.test.js) —
// this ensures the test always verifies the real implementation, not a
// hand-copied duplicate that could silently drift out of sync with it.
module.exports.sanitizeUSSDLog = sanitizeUSSDLog;
