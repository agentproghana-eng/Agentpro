const { query, withTransaction } = require('../config/database');
const { logger } = require('../utils/logger');
const { auditLog } = require('../services/auditService');
const { validateFlowSteps } = require('../utils/ussdFlowValidation');
const { validateFlowMetadata } = require('../utils/ussdFlowMetadataValidation');
const {
  getFlowBuilderCapabilities,
  getFlowBuilderEligibility,
} = require('../utils/ussdFlowCapabilities');

// Dedicated CRUD for a Personal subscriber's own USSD flows - always
// scoped to owner_user_id = req.user.id, with no company_id or
// superuser/global complexity at all (unlike the Agent side's
// ussdFlowController). This avoids the real ambiguity that would arise
// for someone holding both Business and Personal capability at once
// (Option A) if flow creation tried to infer ownership from
// req.user.company_id alone - here there is no ambiguity, since these
// routes only ever mean "my own personal flow."

// ── Resolve My Active Flow ─────────────────────────────────────
// Runtime resolver for Personal mode only. This endpoint lives behind
// requirePersonalAccount + requirePaidPersonalPlan, so a caller cannot
// select Personal resolution semantics through the Business endpoint.
//
// Precedence:
//   1. this authenticated user's Personal override
//   2. true Global default
//
// Company-owned flows are never considered here.
exports.resolveFlow = async (req, res) => {
  const {
    provider,
    transaction_type,
    bundle_category,
    recipient_mode,
  } = req.query;

  if (!provider || !transaction_type) {
    return res.status(422).json({
      success: false,
      message: 'provider and transaction_type are required',
    });
  }

  try {
    let flow = null;

    const personalResult = await query(
      `SELECT * FROM ussd_flows
       WHERE owner_user_id = $1
         AND company_id IS NULL
         AND provider = $2
         AND transaction_type = $3
         AND is_active = TRUE
         AND COALESCE(bundle_category,'') = COALESCE($4,'')
         AND COALESCE(recipient_mode,'') = COALESCE($5,'')`,
      [
        req.user.id,
        provider,
        transaction_type,
        bundle_category || null,
        recipient_mode || null,
      ]
    );

    if (personalResult.rows.length > 0) {
      flow = personalResult.rows[0];
    }

    if (!flow) {
      const globalResult = await query(
        `SELECT * FROM ussd_flows
         WHERE company_id IS NULL
           AND owner_user_id IS NULL
           AND provider = $1
           AND transaction_type = $2
           AND is_active = TRUE
           AND COALESCE(bundle_category,'') = COALESCE($3,'')
           AND COALESCE(recipient_mode,'') = COALESCE($4,'')`,
        [
          provider,
          transaction_type,
          bundle_category || null,
          recipient_mode || null,
        ]
      );

      if (globalResult.rows.length > 0) {
        flow = globalResult.rows[0];
      }
    }

    if (!flow) {
      return res.status(404).json({
        success: false,
        message:
          'No USSD flow configured for this provider and transaction type',
      });
    }

    // Revalidate historical metadata before a Personal or Global flow is
    // allowed to reach the device runtime.
    if (flow.dial_code !== undefined) {
      const runtimeMetadataError = validateFlowMetadata({
        dial_code: flow.dial_code,
        success_markers: flow.success_markers ?? [],
        failure_markers: flow.failure_markers ?? [],
      });

      if (runtimeMetadataError) {
        logger.warn('Unsafe Personal USSD flow metadata blocked at runtime', {
          flowId: flow.id,
          reason: runtimeMetadataError,
        });

        return res.status(409).json({
          success: false,
          code: 'USSD_FLOW_INVALID_CONFIGURATION',
          message:
            'The active USSD flow metadata is invalid and cannot be executed.',
        });
      }
    }

    const stepsResult = await query(
      `SELECT match_all, action, action_value
       FROM ussd_flow_steps
       WHERE flow_id = $1
       ORDER BY step_order`,
      [flow.id]
    );

    const runtimeStepError = validateFlowSteps(stepsResult.rows);

    if (runtimeStepError) {
      logger.warn('Unsafe Personal USSD flow blocked at runtime', {
        flowId: flow.id,
        reason: runtimeStepError,
      });

      return res.status(409).json({
        success: false,
        code: 'USSD_FLOW_INVALID_CONFIGURATION',
        message:
          'The active USSD flow configuration is invalid and cannot be executed.',
      });
    }

    res.json({
      success: true,
      data: {
        ...flow,
        steps: stepsResult.rows,
      },
    });
  } catch (error) {
    logger.error('Resolve personal USSD flow error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to resolve USSD flow',
    });
  }
};

// ── Flow Builder capabilities ────────────────────────────────────
// Personal mode gets the same registered provider enum but only the
// transaction types enabled for Personal Flow Builder configuration.
exports.getCapabilities = async (req, res) => {
  try {
    const data = await getFlowBuilderCapabilities('personal');
    res.json({ success: true, data });
  } catch (error) {
    logger.error('Get Personal USSD flow capabilities error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch USSD flow capabilities',
    });
  }
};

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
  const {
    provider,
    transaction_type,
    dial_code,
    success_markers,
    failure_markers,
    bundle_category,
    recipient_mode,
    steps,
  } = req.body;

  if (!provider || !transaction_type || !dial_code) {
    return res.status(422).json({ success: false, message: 'provider, transaction_type, and dial_code are required' });
  }

  const metadataError = validateFlowMetadata({
    dial_code,
    success_markers: success_markers ?? [],
    failure_markers: failure_markers ?? [],
  });

  if (metadataError) {
    return res.status(422).json({
      success: false,
      code: 'USSD_FLOW_INVALID_METADATA',
      message: metadataError,
    });
  }

  const stepError = validateFlowSteps(steps);
  if (stepError) {
    return res.status(422).json({ success: false, message: stepError });
  }

  try {
    const eligibility = await getFlowBuilderEligibility(
      'personal',
      provider,
      transaction_type
    );

    if (!eligibility.provider_registered) {
      return res.status(422).json({
        success: false,
        code: 'USSD_PROVIDER_NOT_REGISTERED',
        message: 'Provider is not registered for USSD Flow Builder configuration.',
      });
    }

    if (!eligibility.transaction_type_builder_enabled) {
      return res.status(422).json({
        success: false,
        code: 'USSD_FLOW_TYPE_NOT_ENABLED',
        message:
          'Transaction type is not enabled for Personal USSD Flow Builder configuration.',
      });
    }

    const flow = await withTransaction(async (client) => {
      const flowResult = await client.query(
        `INSERT INTO ussd_flows (
           owner_user_id,
           provider,
           transaction_type,
           dial_code,
           success_markers,
           failure_markers,
           bundle_category,
           recipient_mode,
           created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          req.user.id,
          provider,
          transaction_type,
          dial_code,
          success_markers || [],
          failure_markers || [],
          bundle_category || null,
          recipient_mode || null,
          req.user.id,
        ]
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
      newValues: {
        provider,
        transaction_type,
        bundle_category: bundle_category || null,
        recipient_mode: recipient_mode || null,
        step_count: steps.length,
      },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: flow });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message:
          'You already have an active flow for this provider, transaction type, and flow variant.',
      });
    }
    if (error.code === '22P02') {
      return res.status(422).json({
        success: false,
        code: 'USSD_SCHEMA_VALUE_NOT_REGISTERED',
        message: 'Provider or transaction type is not registered in the database schema yet. Add the new value through a database migration before creating this USSD configuration.',
      });
    }
    logger.error('Create personal USSD flow error:', error);
    res.status(500).json({ success: false, message: 'Failed to create flow' });
  }
};

// ── Update My Flow ────────────────────────────────────────────

exports.updateFlow = async (req, res) => {
  const { id } = req.params;
  const {
    dial_code,
    success_markers,
    failure_markers,
    bundle_category,
    recipient_mode,
    is_active,
    steps,
  } = req.body;

  const hasBundleCategory =
      Object.prototype.hasOwnProperty.call(req.body, 'bundle_category');
  const hasRecipientMode =
      Object.prototype.hasOwnProperty.call(req.body, 'recipient_mode');

  try {
    const existing = await query(
      'SELECT * FROM ussd_flows WHERE id = $1 AND owner_user_id = $2',
      [id, req.user.id]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Flow not found' });
    }

    const flow = existing.rows[0];

    const effectiveDialCode =
      dial_code !== undefined ? dial_code : flow.dial_code;
    const effectiveSuccessMarkers =
      success_markers !== undefined
        ? success_markers
        : flow.success_markers;
    const effectiveFailureMarkers =
      failure_markers !== undefined
        ? failure_markers
        : flow.failure_markers;

    const shouldValidateMetadata =
      dial_code !== undefined ||
      success_markers !== undefined ||
      failure_markers !== undefined ||
      (is_active === true && flow.is_active !== true);

    if (
      shouldValidateMetadata &&
      effectiveDialCode !== undefined
    ) {
      const metadataError = validateFlowMetadata({
        dial_code: effectiveDialCode,
        success_markers: effectiveSuccessMarkers ?? [],
        failure_markers: effectiveFailureMarkers ?? [],
      });

      if (metadataError) {
        return res.status(422).json({
          success: false,
          code: 'USSD_FLOW_INVALID_METADATA',
          message: metadataError,
        });
      }
    }

    // An inactive Personal flow may only be brought back when its provider
    // and transaction type are still enabled for Personal Flow Builder.
    if (is_active === true && flow.is_active !== true) {
      const eligibility = await getFlowBuilderEligibility(
        'personal',
        flow.provider,
        flow.transaction_type
      );

      if (!eligibility.provider_registered) {
        return res.status(422).json({
          success: false,
          code: 'USSD_PROVIDER_NOT_REGISTERED',
          message:
            'Provider is no longer registered for USSD Flow Builder configuration.',
        });
      }

      if (!eligibility.transaction_type_builder_enabled) {
        return res.status(422).json({
          success: false,
          code: 'USSD_FLOW_TYPE_NOT_ENABLED',
          message:
            'This transaction type is no longer enabled for Personal USSD Flow Builder configuration.',
        });
      }
    }

    // If reactivation does not replace the steps, validate the persisted
    // configuration before making it executable again. This protects
    // historical Personal flows created before today's stricter safety rules.
    if (is_active === true && flow.is_active !== true && steps === undefined) {
      const persistedStepsResult = await query(
        `SELECT match_all, action, action_value
         FROM ussd_flow_steps
         WHERE flow_id = $1
         ORDER BY step_order`,
        [id]
      );

      const persistedStepError =
        validateFlowSteps(persistedStepsResult.rows);

      if (persistedStepError) {
        return res.status(422).json({
          success: false,
          code: 'USSD_FLOW_INVALID_CONFIGURATION',
          message:
            'This flow cannot be reactivated because its saved steps are no longer safe. Edit and save the flow before reactivating it.',
        });
      }
    }

    if (steps !== undefined) {
      const stepError = validateFlowSteps(steps);
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
           bundle_category = CASE WHEN $4 THEN $5 ELSE bundle_category END,
           recipient_mode = CASE WHEN $6 THEN $7 ELSE recipient_mode END,
           is_active = COALESCE($8, is_active),
           updated_at = NOW()
         WHERE id = $9`,
        [
          dial_code || null,
          success_markers || null,
          failure_markers || null,
          hasBundleCategory,
          bundle_category || null,
          hasRecipientMode,
          recipient_mode || null,
          is_active ?? null,
          id,
        ]
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
      newValues: {
        dial_code,
        ...(hasBundleCategory
          ? { bundle_category: bundle_category || null }
          : {}),
        ...(hasRecipientMode
          ? { recipient_mode: recipient_mode || null }
          : {}),
        is_active,
        steps_replaced: steps !== undefined,
      },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({ success: true, message: 'Flow updated' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message:
          'You already have an active flow for this provider, transaction type, and flow variant.',
      });
    }

    logger.error('Update personal USSD flow error:', error);
    res.status(500).json({ success: false, message: 'Failed to update flow' });
  }
};

// ── Deactivate My Flow ────────────────────────────────────────
// Keep the row and its steps for audit/history consistency with Business
// flows. The partial active-flow uniqueness indexes allow another active
// variant to be created later while this inactive row remains preserved.

exports.deleteFlow = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await query(
      `UPDATE ussd_flows
       SET is_active = false, updated_at = NOW()
       WHERE id = $1 AND owner_user_id = $2
       RETURNING id`,
      [id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Flow not found' });
    }

    await auditLog({
      userId: req.user.id,
      companyId: null,
      action: 'PERSONAL_USSD_FLOW_DEACTIVATED',
      entityType: 'ussd_flow',
      entityId: id,
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({ success: true, message: 'Flow deactivated' });
  } catch (error) {
    logger.error('Deactivate personal USSD flow error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate flow',
    });
  }
};
