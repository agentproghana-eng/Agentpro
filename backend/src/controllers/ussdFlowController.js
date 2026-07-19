const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');

// Mirrors the ussd_flow_action enum - kept in sync manually since
// node-postgres doesn't validate enum membership until the query
// actually runs; validating here gives a clear 422 instead of a
// confusing database error.
const VALID_ACTIONS = [
  'send_digit', 'send_customer_phone', 'send_amount',
  'send_operator_id', 'send_literal', 'pin_prompt', 'auto_confirm_once',
];

function validateSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return 'At least one step is required';
  }
  for (const step of steps) {
    if (!Array.isArray(step.match_all) || step.match_all.length === 0) {
      return 'Each step needs at least one match_all condition';
    }
    if (!VALID_ACTIONS.includes(step.action)) {
      return `Invalid action: ${step.action}`;
    }
    if (['send_digit', 'send_literal', 'auto_confirm_once'].includes(step.action) && !step.action_value) {
      return `Step with action "${step.action}" requires action_value`;
    }
  }
  return null;
}

// ── List flows ────────────────────────────────────────────────
// Superuser sees every flow. Business owners see every global flow
// (company_id IS NULL - read-only to them) plus their own company's
// flows. Never another company's flows.
exports.listFlows = async (req, res) => {
  try {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (req.user.role !== 'superuser') {
      conditions.push(`(f.company_id IS NULL OR f.company_id = $${idx++})`);
      params.push(req.user.company_id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT f.*, c.name as company_name,
              u.first_name || ' ' || u.last_name as created_by_name
       FROM ussd_flows f
       LEFT JOIN companies c ON f.company_id = c.id
       LEFT JOIN users u ON f.created_by = u.id
       ${where}
       ORDER BY f.company_id NULLS FIRST, f.provider, f.transaction_type`,
      params
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('List USSD flows error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch USSD flows' });
  }
};

// ── Get one flow, with its steps ─────────────────────────────────
exports.getFlow = async (req, res) => {
  const { id } = req.params;
  try {
    const flowResult = await query('SELECT * FROM ussd_flows WHERE id = $1', [id]);
    if (flowResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Flow not found' });
    }
    const flow = flowResult.rows[0];

    if (req.user.role !== 'superuser' && flow.company_id !== null && flow.company_id !== req.user.company_id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const stepsResult = await query(
      'SELECT * FROM ussd_flow_steps WHERE flow_id = $1 ORDER BY step_order',
      [id]
    );

    res.json({ success: true, data: { ...flow, steps: stepsResult.rows } });
  } catch (error) {
    logger.error('Get USSD flow error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch USSD flow' });
  }
};

// ── Create a flow + its steps ────────────────────────────────────
// Superuser creates GLOBAL flows only via this endpoint (company_id is
// always null, regardless of what's in the request body). Business
// owners always create flows scoped to their own company - company_id
// is taken from req.user, never trusted from the client, so a business
// owner can never create a flow for another company no matter what
// they send.
exports.createFlow = async (req, res) => {
  const { provider, transaction_type, dial_code, success_markers, failure_markers, steps } = req.body;

  if (!provider || !transaction_type || !dial_code) {
    return res.status(422).json({ success: false, message: 'provider, transaction_type, and dial_code are required' });
  }

  const stepError = validateSteps(steps);
  if (stepError) {
    return res.status(422).json({ success: false, message: stepError });
  }

  const companyId = req.user.role === 'superuser' ? null : req.user.company_id;

  try {
    const flow = await withTransaction(async (client) => {
      const flowResult = await client.query(
        `INSERT INTO ussd_flows (company_id, provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [companyId, provider, transaction_type, dial_code, success_markers || [], failure_markers || [], req.user.id]
      );
      const newFlow = flowResult.rows[0];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await client.query(
          `INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
           VALUES ($1, $2, $3, $4, $5)`,
          [newFlow.id, i, step.match_all, step.action, step.action_value || null]
        );
      }

      return newFlow;
    });

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: 'USSD_FLOW_CREATED',
      entityType: 'ussd_flow',
      entityId: flow.id,
      newValues: { provider, transaction_type, company_id: companyId, step_count: steps.length },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: flow });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'An active flow already exists for this provider and transaction type' });
    }
    logger.error('Create USSD flow error:', error);
    res.status(500).json({ success: false, message: 'Failed to create USSD flow' });
  }
};

// ── Update a flow (replaces its steps wholesale if provided) ─────
// Business owners can only edit flows scoped to their OWN company -
// global flows (company_id IS NULL) are read-only to them, matching
// the same rule enforced on create. Superuser can edit any flow.
exports.updateFlow = async (req, res) => {
  const { id } = req.params;
  const { dial_code, success_markers, failure_markers, is_active, steps } = req.body;

  try {
    const existing = await query('SELECT * FROM ussd_flows WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Flow not found' });
    }
    const flow = existing.rows[0];

    if (req.user.role !== 'superuser') {
      if (flow.company_id === null) {
        return res.status(403).json({ success: false, message: 'Global flows are read-only. Create your own company flow instead.' });
      }
      if (flow.company_id !== req.user.company_id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (steps !== undefined) {
      const stepError = validateSteps(steps);
      if (stepError) {
        return res.status(422).json({ success: false, message: stepError });
      }
    }

    const updated = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE ussd_flows SET
           dial_code = COALESCE($1, dial_code),
           success_markers = COALESCE($2, success_markers),
           failure_markers = COALESCE($3, failure_markers),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
         WHERE id = $5 RETURNING *`,
        [dial_code, success_markers, failure_markers, is_active, id]
      );

      if (steps !== undefined) {
        await client.query('DELETE FROM ussd_flow_steps WHERE flow_id = $1', [id]);
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          await client.query(
            `INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, i, step.match_all, step.action, step.action_value || null]
          );
        }
      }

      return result.rows[0];
    });

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: 'USSD_FLOW_UPDATED',
      entityType: 'ussd_flow',
      entityId: id,
      newValues: { dial_code, is_active, steps_replaced: steps !== undefined },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    logger.error('Update USSD flow error:', error);
    res.status(500).json({ success: false, message: 'Failed to update USSD flow' });
  }
};

// ── Delete (soft) a flow ──────────────────────────────────────────
// Deliberately soft-delete (is_active = false) rather than a hard
// DELETE - preserves history for audit, and the unique partial indexes
// (WHERE is_active = true) let a fresh flow be created for the same
// provider+type without a leftover row blocking it.
exports.deleteFlow = async (req, res) => {
  const { id } = req.params;
  try {
    const existing = await query('SELECT * FROM ussd_flows WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Flow not found' });
    }
    const flow = existing.rows[0];

    if (req.user.role !== 'superuser') {
      if (flow.company_id === null) {
        return res.status(403).json({ success: false, message: 'Global flows are read-only.' });
      }
      if (flow.company_id !== req.user.company_id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    await query('UPDATE ussd_flows SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: 'USSD_FLOW_DEACTIVATED',
      entityType: 'ussd_flow',
      entityId: id,
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({ success: true, message: 'Flow deactivated' });
  } catch (error) {
    logger.error('Delete USSD flow error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete USSD flow' });
  }
};
