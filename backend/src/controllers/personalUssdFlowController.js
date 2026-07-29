const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const { validateSteps } = require('./ussdFlowController');

// Dedicated CRUD for a Personal subscriber's own USSD flows - always
// scoped to owner_user_id = req.user.id, with no company_id or
// superuser/global complexity at all (unlike the Agent side's
// ussdFlowController). This avoids the real ambiguity that would arise
// for someone holding both Business and Personal capability at once
// (Option A) if flow creation tried to infer ownership from
// req.user.company_id alone - here there is no ambiguity, since these
// routes only ever mean "my own personal flow."

// ── List My Flows ─────────────────────────────────────────────

exports.listFlows = async (req, res) => {
  try {
    const result = await query(
      `SELECT f.*, (SELECT COUNT(*) FROM ussd_flow_steps s WHERE s.flow_id = f.id) as step_count
       FROM ussd_flows f
       WHERE f.owner_user_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('List personal USSD flows error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch flows' });
  }
};

// ── Get a Flow (with its steps) ──────────────────────────────

exports.getFlow = async (req, res) => {
  const { id } = req.params;
  try {
    const flowResult = await query(
      'SELECT * FROM ussd_flows WHERE id = $1 AND owner_user_id = $2',
      [id, req.user.id]
    );
    if (flowResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Flow not found' });
    }
    const flow = flowResult.rows[0];
    const stepsResult = await query(
      'SELECT * FROM ussd_flow_steps WHERE flow_id = $1 ORDER BY step_order',
      [id]
    );
    res.json({ success: true, data: { ...flow, steps: stepsResult.rows } });
  } catch (error) {
    logger.error('Get personal USSD flow error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch flow' });
  }
};

// ── Create My Flow ────────────────────────────────────────────

exports.createFlow = async (req, res) => {
  const { provider, transaction_type, dial_code, success_markers, failure_markers, steps } = req.body;

  if (!provider || !transaction_type || !dial_code) {
    return res.status(422).json({ success: false, message: 'provider, transaction_type, and dial_code are required' });
  }

  const stepError = validateSteps(steps);
  if (stepError) {
    return res.status(422).json({ success: false, message: stepError });
  }

  try {
    const flow = await withTransaction(async (client) => {
      const flowResult = await client.query(
        `INSERT INTO ussd_flows (owner_user_id, provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [req.user.id, provider, transaction_type, dial_code, success_markers || [], failure_markers || [], req.user.id]
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
      companyId: null,
      action: 'PERSONAL_USSD_FLOW_CREATED',
      entityType: 'ussd_flow',
      entityId: flow.id,
      newValues: { provider, transaction_type, step_count: steps.length },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: flow });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ success: false, message: 'You already have an active flow for this provider and transaction type' });
    }
    logger.error('Create personal USSD flow error:', error);
    res.status(500).json({ success: false, message: 'Failed to create flow' });
  }
};

// ── Update My Flow ────────────────────────────────────────────

exports.updateFlow = async (req, res) => {
  const { id } = req.params;
  const { dial_code, success_markers, failure_markers, is_active, steps } = req.body;

  try {
    const existing = await query(
      'SELECT * FROM ussd_flows WHERE id = $1 AND owner_user_id = $2',
      [id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Flow not found' });
    }

    if (steps !== undefined) {
      const stepError = validateSteps(steps);
      if (stepError) {
        return res.status(422).json({ success: false, message: stepError });
      }
    }

    await withTransaction(async (client) => {
      await client.query(
        `UPDATE ussd_flows SET
           dial_code = COALESCE($1, dial_code),
           success_markers = COALESCE($2, success_markers),
           failure_markers = COALESCE($3, failure_markers),
           is_active = COALESCE($4, is_active),
           updated_at = NOW()
         WHERE id = $5`,
        [dial_code || null, success_markers || null, failure_markers || null, is_active ?? null, id]
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
    });

    await auditLog({
      userId: req.user.id,
      companyId: null,
      action: 'PERSONAL_USSD_FLOW_UPDATED',
      entityType: 'ussd_flow',
      entityId: id,
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({ success: true, message: 'Flow updated' });
  } catch (error) {
    logger.error('Update personal USSD flow error:', error);
    res.status(500).json({ success: false, message: 'Failed to update flow' });
  }
};

// ── Delete My Flow ────────────────────────────────────────────

exports.deleteFlow = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      'DELETE FROM ussd_flows WHERE id = $1 AND owner_user_id = $2 RETURNING id',
      [id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Flow not found' });
    }

    await auditLog({
      userId: req.user.id,
      companyId: null,
      action: 'PERSONAL_USSD_FLOW_DELETED',
      entityType: 'ussd_flow',
      entityId: id,
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({ success: true, message: 'Flow deleted' });
  } catch (error) {
    logger.error('Delete personal USSD flow error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete flow' });
  }
};
