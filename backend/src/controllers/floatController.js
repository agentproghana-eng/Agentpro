const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const { sendLowFloatAlert } = require('../services/notificationService');

// ── Get Float Overview for a Company ─────────────────────────

exports.getFloatOverview = async (req, res) => {
  const companyId = req.user.role === 'superuser'
    ? req.params.company_id
    : req.user.company_id;
  const { branch_id } = req.query;
  try {
    const conditions = ["b.company_id = $1", "b.status = 'active'"];
    const params = [companyId];

    if (req.user.role === 'manager') {
      params.push(req.user.id);
      conditions.push(`b.id IN (SELECT branch_id FROM branch_managers WHERE manager_id = $${params.length})`);
    }

    if (branch_id) {
      params.push(branch_id);
      conditions.push(`b.id = $${params.length}`);
    }

    const result = await query(
      `SELECT fa.*, b.name as branch_name, b.id as branch_id
       FROM float_accounts fa
       INNER JOIN branches b ON fa.branch_id = b.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY b.name, fa.provider`,
      params
    );

    // Aggregate totals per provider
    const totals = result.rows.reduce((acc, row) => {
      if (!acc[row.provider]) acc[row.provider] = 0;
      acc[row.provider] += parseFloat(row.current_balance);
      return acc;
    }, {});

    const grandTotal = Object.values(totals).reduce((s, v) => s + v, 0);

    res.json({
      success: true,
      data: {
        accounts: result.rows,
        totals_by_provider: totals,
        grand_total: grandTotal,
      },
    });
  } catch (error) {
    logger.error('Float overview error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch float overview' });
  }
};

// ── Get Float for a Branch ────────────────────────────────────

exports.getBranchFloat = async (req, res) => {
  const { branch_id } = req.params;

  try {
    const result = await query(
      `SELECT fa.*, b.name as branch_name, b.company_id
       FROM float_accounts fa
       INNER JOIN branches b ON fa.branch_id = b.id
       WHERE fa.branch_id = $1`,
      [branch_id]
    );

    // Enforce company scope
    if (result.rows.length > 0 && req.user.role !== 'superuser') {
      if (result.rows[0].company_id !== req.user.company_id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    const total = result.rows.reduce((s, r) => s + parseFloat(r.current_balance), 0);

    res.json({
      success: true,
      data: { accounts: result.rows, total },
    });
  } catch (error) {
    logger.error('Branch float error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch branch float' });
  }
};

// ── Top Up Float ──────────────────────────────────────────────

exports.topUpFloat = async (req, res) => {
  const { branch_id, provider, amount, reference, notes } = req.body;
  const userId = req.user.id;

  try {
    // Validate branch belongs to user's company
    const branchResult = await query(
      'SELECT * FROM branches WHERE id = $1 AND company_id = $2 AND status = $3',
      [branch_id, req.user.company_id, 'active']
    );

    if (branchResult.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Branch not found or access denied' });
    }

    await withTransaction(async (client) => {
      // Get or create float account
      let floatResult = await client.query(
        'SELECT * FROM float_accounts WHERE branch_id = $1 AND provider = $2',
        [branch_id, provider]
      );

      if (floatResult.rows.length === 0) {
        floatResult = await client.query(
          'INSERT INTO float_accounts (branch_id, provider, current_balance) VALUES ($1, $2, 0) RETURNING *',
          [branch_id, provider]
        );
      }

      const float = floatResult.rows[0];
      const balanceBefore = parseFloat(float.current_balance);
      const balanceAfter = balanceBefore + parseFloat(amount);

      await client.query(
        'UPDATE float_accounts SET current_balance = $1, last_updated_at = NOW() WHERE id = $2',
        [balanceAfter, float.id]
      );

      await client.query(
        `INSERT INTO float_movements (
          float_account_id, movement_type, amount, balance_before,
          balance_after, reference, notes, performed_by
        ) VALUES ($1, 'top_up', $2, $3, $4, $5, $6, $7)`,
        [float.id, amount, balanceBefore, balanceAfter, reference, notes, userId]
      );
    });

    await auditLog({
      userId,
      companyId: req.user.company_id,
      action: 'FLOAT_TOP_UP',
      entityType: 'float_account',
      newValues: { branch_id, provider, amount, reference },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({ success: true, message: 'Float topped up successfully' });
  } catch (error) {
    logger.error('Float top-up error:', error);
    res.status(500).json({ success: false, message: 'Failed to top up float' });
  }
};

// ── Float Movement History ────────────────────────────────────

exports.getFloatHistory = async (req, res) => {
  const { branch_id, provider, from_date, to_date, page = 1, limit = 30 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (branch_id) {
      conditions.push(`fa.branch_id = $${idx++}`);
      params.push(branch_id);
    }
    if (provider) {
      conditions.push(`fa.provider = $${idx++}`);
      params.push(provider);
    }
    if (from_date) {
      conditions.push(`fm.created_at >= $${idx++}`);
      params.push(from_date);
    }
    if (to_date) {
      conditions.push(`fm.created_at <= $${idx++}`);
      params.push(to_date);
    }

    // Company scope
    if (req.user.role !== 'superuser') {
      conditions.push(`b.company_id = $${idx++}`);
      params.push(req.user.company_id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [data, count] = await Promise.all([
      query(
        `SELECT fm.*, fa.provider, b.name as branch_name,
                u.first_name || ' ' || u.last_name as performed_by_name
         FROM float_movements fm
         INNER JOIN float_accounts fa ON fm.float_account_id = fa.id
         INNER JOIN branches b ON fa.branch_id = b.id
         LEFT JOIN users u ON fm.performed_by = u.id
         ${where}
         ORDER BY fm.created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
      query(
        `SELECT COUNT(*) FROM float_movements fm
         INNER JOIN float_accounts fa ON fm.float_account_id = fa.id
         INNER JOIN branches b ON fa.branch_id = b.id
         ${where}`,
        params
      ),
    ]);

    res.json({
      success: true,
      data: data.rows,
      meta: {
        total: parseInt(count.rows[0].count),
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(parseInt(count.rows[0].count) / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Float history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch float history' });
  }
};

// ── Update Low Float Threshold ────────────────────────────────

exports.updateThreshold = async (req, res) => {
  const { branch_id, provider, threshold } = req.body;

  try {
    const result = await query(
      `UPDATE float_accounts SET low_balance_threshold = $1
       WHERE branch_id = $2 AND provider = $3
       RETURNING *`,
      [threshold, branch_id, provider]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Float account not found' });
    }

    res.json({ success: true, message: 'Threshold updated', data: result.rows[0] });
  } catch (error) {
    logger.error('Threshold update error:', error);
    res.status(500).json({ success: false, message: 'Failed to update threshold' });
  }
};

// ── Submit Float Request (Agent → Manager) ────────────────────

exports.submitFloatRequest = async (req, res) => {
  const { branch_id, provider, amount_requested, reason } = req.body;

  try {
    const result = await query(
      `INSERT INTO float_requests (branch_id, requested_by, provider, amount_requested, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [branch_id, req.user.id, provider, amount_requested, reason]
    );

    res.status(201).json({ success: true, data: result.rows[0], message: 'Float request submitted' });
  } catch (error) {
    logger.error('Float request error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit float request' });
  }
};

// ── Review Float Request (Manager) ───────────────────────────

exports.reviewFloatRequest = async (req, res) => {
  const { request_id } = req.params;
  const { status, review_notes } = req.body; // 'approved' or 'rejected'

  try {
    const result = await query(
      `UPDATE float_requests
       SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3
       WHERE id = $4 RETURNING *`,
      [status, req.user.id, review_notes, request_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Float request not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('Float request review error:', error);
    res.status(500).json({ success: false, message: 'Failed to review float request' });
  }
};
