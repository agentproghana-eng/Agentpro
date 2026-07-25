const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');

// Sums cash_at_hand across every provider balance the agent has - the
// "expected" cash figure a shift reconciles against. Physical cash is
// one drawer regardless of how many provider wallets feed into it, so
// this is a single total, not a per-provider breakdown.
async function getExpectedCash(client, agentId) {
  const result = await client.query(
    'SELECT COALESCE(SUM(cash_at_hand), 0) AS total FROM agent_balances WHERE agent_id = $1',
    [agentId]
  );
  return parseFloat(result.rows[0].total);
}

async function getVarianceThreshold() {
  const result = await query(`SELECT value FROM system_config WHERE key = 'shift_variance_flag_threshold'`);
  return parseFloat(result.rows[0]?.value || '20.00');
}

exports.openShift = async (req, res) => {
  const agentId = req.user.id;
  const companyId = req.user.company_id;

  try {
    const branchResult = await query(
      `SELECT branch_id FROM agent_branches WHERE agent_id = $1 AND is_primary = true LIMIT 1`,
      [agentId]
    );
    const branchId = branchResult.rows[0]?.branch_id || null;

    const shift = await withTransaction(async (client) => {
      const openingCash = await getExpectedCash(client, agentId);
      const result = await client.query(
        `INSERT INTO shifts (agent_id, branch_id, company_id, opening_cash_expected)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [agentId, branchId, companyId, openingCash]
      );
      return result.rows[0];
    });

    await auditLog({
      userId: agentId, companyId, action: 'SHIFT_OPENED', entityType: 'shift', entityId: shift.id,
      newValues: { opening_cash_expected: shift.opening_cash_expected },
      ipAddress: req.ip, requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: shift });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'You already have an open shift. Close it before opening a new one.' });
    }
    logger.error('Open shift error:', error);
    res.status(500).json({ success: false, message: 'Failed to open shift' });
  }
};

exports.getCurrentShift = async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM shifts WHERE agent_id = $1 AND status = 'open' LIMIT 1`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows[0] || null });
  } catch (error) {
    logger.error('Get current shift error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch current shift' });
  }
};

exports.closeShift = async (req, res) => {
  const { shift_id } = req.params;
  const { closing_cash_actual, notes } = req.body;
  const agentId = req.user.id;

  if (closing_cash_actual === undefined || closing_cash_actual === null || isNaN(parseFloat(closing_cash_actual))) {
    return res.status(422).json({ success: false, message: 'closing_cash_actual is required and must be a number' });
  }

  try {
    const shiftResult = await query(
      `SELECT * FROM shifts WHERE id = $1 AND agent_id = $2 AND status = 'open'`,
      [shift_id, agentId]
    );
    if (shiftResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Open shift not found' });
    }
    const shift = shiftResult.rows[0];

    const closed = await withTransaction(async (client) => {
      const closingExpected = await getExpectedCash(client, agentId);
      const actual = parseFloat(closing_cash_actual);
      const variance = actual - closingExpected;

      const txCountResult = await client.query(
        `SELECT COUNT(*) FROM transactions WHERE agent_id = $1 AND created_at >= $2`,
        [agentId, shift.opened_at]
      );

      const result = await client.query(
        `UPDATE shifts SET
           status = 'closed',
           closing_cash_expected = $1,
           closing_cash_actual = $2,
           variance = $3,
           transaction_count = $4,
           notes = $5,
           closed_at = NOW()
         WHERE id = $6 RETURNING *`,
        [closingExpected, actual, variance, parseInt(txCountResult.rows[0].count), notes || null, shift_id]
      );
      return result.rows[0];
    });

    const threshold = await getVarianceThreshold();
    const flagged = Math.abs(closed.variance) >= threshold;

    await auditLog({
      userId: agentId, companyId: req.user.company_id, action: 'SHIFT_CLOSED', entityType: 'shift', entityId: shift_id,
      newValues: { closing_cash_expected: closed.closing_cash_expected, closing_cash_actual: closed.closing_cash_actual, variance: closed.variance, flagged },
      ipAddress: req.ip, requestId: req.requestId,
    });

    res.json({ success: true, data: { ...closed, flagged, threshold } });
  } catch (error) {
    logger.error('Close shift error:', error);
    res.status(500).json({ success: false, message: 'Failed to close shift' });
  }
};

exports.listShifts = async (req, res) => {
  const { agent_id, branch_id, flagged_only, page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const threshold = await getVarianceThreshold();

    const conditions = [`status = 'closed'`];
    const params = [];
    let idx = 1;

    if (req.user.role !== 'superuser') {
      conditions.push(`company_id = $${idx++}`);
      params.push(req.user.company_id);
    }
    if (agent_id) { conditions.push(`agent_id = $${idx++}`); params.push(agent_id); }
    if (branch_id) { conditions.push(`branch_id = $${idx++}`); params.push(branch_id); }
    if (flagged_only === 'true') {
      conditions.push(`ABS(variance) >= $${idx++}`);
      params.push(threshold);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [data, count] = await Promise.all([
      query(
        `SELECT s.*, u.first_name, u.last_name, b.name as branch_name
         FROM shifts s
         JOIN users u ON u.id = s.agent_id
         LEFT JOIN branches b ON b.id = s.branch_id
         ${where}
         ORDER BY s.closed_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, parseInt(limit), offset]
      ),
      query(`SELECT COUNT(*) FROM shifts s ${where}`, params),
    ]);

    res.json({
      success: true,
      data: data.rows.map(r => ({ ...r, flagged: Math.abs(r.variance) >= threshold })),
      meta: { total: parseInt(count.rows[0].count), page: parseInt(page), limit: parseInt(limit), threshold },
    });
  } catch (error) {
    logger.error('List shifts error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch shifts' });
  }
};
