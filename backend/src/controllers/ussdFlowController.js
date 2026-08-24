const { query, withTransaction } = require("../config/database");
const { logger } = require("../utils/logger");
const { auditLog } = require("../services/auditService");
const { validateFlowSteps } = require("../utils/ussdFlowValidation");
const { validateFlowMetadata } = require("../utils/ussdFlowMetadataValidation");
const {
  getFlowBuilderCapabilities,
  getFlowBuilderEligibility,
  getGlobalFlowBuilderEligibility,
} = require("../utils/ussdFlowCapabilities");

// Mirrors the ussd_flow_action enum - kept in sync manually since
// node-postgres doesn't validate enum membership until the query
// actually runs; validating here gives a clear 422 instead of a
// confusing database error.

// ── List flows ────────────────────────────────────────────────
// This Business/Global endpoint never exposes Personal-owned rows.
// Superuser sees all Global + Company flows. Business owners see every
// Global flow (read-only to them) plus their own company's flows.
exports.listFlows = async (req, res) => {
  try {
    const conditions = ["f.owner_user_id IS NULL"];
    const params = [];
    let idx = 1;

    if (req.user.role !== "superuser") {
      // Business owners may see only:
      // - true Global flows: no company and no personal owner
      // - their own Company flows: matching company and no personal owner
      //
      // Personal flows also have company_id NULL, so company_id alone
      // must never be used as the definition of "Global".
      conditions.push(
        `(
          (f.company_id IS NULL AND f.owner_user_id IS NULL)
          OR
          (f.company_id = $${idx++} AND f.owner_user_id IS NULL)
        )`,
      );
      params.push(req.user.company_id);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT f.*, c.name as company_name,
              u.first_name || ' ' || u.last_name as created_by_name
       FROM ussd_flows f
       LEFT JOIN companies c ON f.company_id = c.id
       LEFT JOIN users u ON f.created_by = u.id
       ${where}
       ORDER BY f.company_id NULLS FIRST, f.provider, f.transaction_type`,
      params,
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("List USSD flows error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch USSD flows" });
  }
};

// ── Get one flow, with its steps ─────────────────────────────────
exports.getFlow = async (req, res) => {
  const { id } = req.params;
  try {
    const flowResult = await query(
      "SELECT * FROM ussd_flows WHERE id = $1 AND owner_user_id IS NULL",
      [id],
    );
    if (flowResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Flow not found" });
    }
    const flow = flowResult.rows[0];

    if (req.user.role !== "superuser") {
      // Personal-owned flows are never part of Business Flow Builder,
      // even though Personal rows also have company_id NULL.
      if (flow.owner_user_id !== null) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      if (flow.company_id !== null && flow.company_id !== req.user.company_id) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }
    }

    const stepsResult = await query(
      "SELECT * FROM ussd_flow_steps WHERE flow_id = $1 ORDER BY step_order",
      [id],
    );

    res.json({ success: true, data: { ...flow, steps: stepsResult.rows } });
  } catch (error) {
    logger.error("Get USSD flow error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch USSD flow" });
  }
};

// ── Flow Builder capabilities ────────────────────────────────────
// Providers come directly from PostgreSQL's provider enum. Transaction
// types come from the mode-aware ussd_flow_capabilities registry.
exports.getCapabilities = async (req, res) => {
  try {
    const data = await getFlowBuilderCapabilities("business");
    res.json({ success: true, data });
  } catch (error) {
    logger.error("Get Business USSD flow capabilities error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch USSD flow capabilities",
    });
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
  const {
    provider,
    transaction_type,
    dial_code,
    success_markers,
    failure_markers,
    bundle_category,
    recipient_mode,
    business_sim_role,
    account_mode,
    steps,
  } = req.body;

  const businessSimRole = String(business_sim_role || "agent")
    .trim()
    .toLowerCase();

  if (!["agent", "evd", "merchant"].includes(businessSimRole)) {
    return res.status(422).json({
      success: false,
      code: "INVALID_BUSINESS_SIM_ROLE",
      message: "business_sim_role must be agent, evd, or merchant",
    });
  }

  if (!provider || !transaction_type || !dial_code) {
    return res.status(422).json({
      success: false,
      message: "provider, transaction_type, and dial_code are required",
    });
  }

  const metadataError = validateFlowMetadata({
    dial_code,
    success_markers: success_markers ?? [],
    failure_markers: failure_markers ?? [],
  });

  if (metadataError) {
    return res.status(422).json({
      success: false,
      code: "USSD_FLOW_INVALID_METADATA",
      message: metadataError,
    });
  }

  const stepError = validateFlowSteps(steps);
  if (stepError) {
    return res.status(422).json({ success: false, message: stepError });
  }

  const companyId = req.user.role === "superuser" ? null : req.user.company_id;

  if (
    req.user.role !== "superuser" &&
    (typeof companyId !== "string" || companyId.trim().length === 0)
  ) {
    return res.status(403).json({
      success: false,
      code: "BUSINESS_IDENTITY_REQUIRED",
      message:
        "A valid company identity is required to create a Business USSD flow.",
    });
  }

  try {
    const isGlobalTarget = req.user.role === "superuser";

    const eligibility = isGlobalTarget
      ? await getGlobalFlowBuilderEligibility(provider, transaction_type)
      : await getFlowBuilderEligibility("business", provider, transaction_type);

    if (!eligibility.provider_registered) {
      return res.status(422).json({
        success: false,
        code: "USSD_PROVIDER_NOT_REGISTERED",
        message:
          "Provider is not registered for USSD Flow Builder configuration.",
      });
    }

    if (!eligibility.transaction_type_builder_enabled) {
      return res.status(422).json({
        success: false,
        code: "USSD_FLOW_TYPE_NOT_ENABLED",
        message: isGlobalTarget
          ? "Transaction type is not enabled for any Global USSD Flow Builder account mode."
          : "Transaction type is not enabled for Business USSD Flow Builder configuration.",
      });
    }

    let resolvedGlobalAccountMode = "business";

    if (isGlobalTarget) {
      const businessEnabled = eligibility.business_enabled === true;

      const personalEnabled = eligibility.personal_enabled === true;

      if (businessEnabled && personalEnabled) {
        const requestedGlobalAccountMode = String(account_mode || "")
          .trim()
          .toLowerCase();

        if (
          ["business", "personal"].includes(requestedGlobalAccountMode) ===
          false
        ) {
          return res.status(422).json({
            success: false,
            code: "GLOBAL_ACCOUNT_MODE_REQUIRED",
            message:
              "account_mode must be business or personal when a Global transaction type is enabled in both modes.",
          });
        }

        resolvedGlobalAccountMode = requestedGlobalAccountMode;
      } else if (personalEnabled) {
        resolvedGlobalAccountMode = "personal";
      }
    }

    const persistedBusinessSimRole =
      isGlobalTarget && resolvedGlobalAccountMode === "personal"
        ? null
        : businessSimRole;

    const flow = await withTransaction(async (client) => {
      const flowResult = await client.query(
        `INSERT INTO ussd_flows (
           company_id,
           provider,
           transaction_type,
           dial_code,
           success_markers,
           failure_markers,
           bundle_category,
           recipient_mode,
           business_sim_role,
           created_by
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          companyId,
          provider,
          transaction_type,
          dial_code,
          success_markers || [],
          failure_markers || [],
          bundle_category || null,
          recipient_mode || null,
          persistedBusinessSimRole,
          req.user.id,
        ],
      );
      const newFlow = flowResult.rows[0];

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        await client.query(
          `INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            newFlow.id,
            i,
            step.match_all,
            step.action,
            step.action_value || null,
          ],
        );
      }

      return newFlow;
    });

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: "USSD_FLOW_CREATED",
      entityType: "ussd_flow",
      entityId: flow.id,
      newValues: {
        provider,
        transaction_type,
        bundle_category: bundle_category || null,
        recipient_mode: recipient_mode || null,
        business_sim_role: persistedBusinessSimRole,
        account_mode: isGlobalTarget ? resolvedGlobalAccountMode : "business",
        company_id: companyId,
        step_count: steps.length,
      },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.status(201).json({ success: true, data: flow });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "An active flow already exists for this provider, transaction type, and flow variant.",
      });
    }
    if (error.code === "22P02") {
      return res.status(422).json({
        success: false,
        code: "USSD_SCHEMA_VALUE_NOT_REGISTERED",
        message:
          "Provider or transaction type is not registered in the database schema yet. Add the new value through a database migration before creating this USSD configuration.",
      });
    }
    logger.error("Create USSD flow error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to create USSD flow" });
  }
};

// ── Update a flow (replaces its steps wholesale if provided) ─────
// Business owners can only edit flows scoped to their OWN company.
// Global flows are read-only to them. Superuser can edit any Global or
// Company flow, but Personal-owned rows are never part of this endpoint.
exports.updateFlow = async (req, res) => {
  const { id } = req.params;
  const {
    dial_code,
    success_markers,
    failure_markers,
    bundle_category,
    recipient_mode,
    business_sim_role,
    is_active,
    steps,
  } = req.body;

  const hasBundleCategory = Object.prototype.hasOwnProperty.call(
    req.body,
    "bundle_category",
  );
  const hasRecipientMode = Object.prototype.hasOwnProperty.call(
    req.body,
    "recipient_mode",
  );
  const hasBusinessSimRole = Object.prototype.hasOwnProperty.call(
    req.body,
    "business_sim_role",
  );

  const requestedBusinessSimRole = hasBusinessSimRole
    ? String(business_sim_role || "")
        .trim()
        .toLowerCase()
    : null;

  if (
    hasBusinessSimRole &&
    !["agent", "evd", "merchant"].includes(requestedBusinessSimRole)
  ) {
    return res.status(422).json({
      success: false,
      code: "INVALID_BUSINESS_SIM_ROLE",
      message: "business_sim_role must be agent, evd, or merchant",
    });
  }

  try {
    const existing = await query(
      "SELECT * FROM ussd_flows WHERE id = $1 AND owner_user_id IS NULL",
      [id],
    );
    if (existing.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Flow not found" });
    }
    const flow = existing.rows[0];

    if (req.user.role !== "superuser") {
      if (flow.company_id === null) {
        return res.status(403).json({
          success: false,
          message:
            "Global flows are read-only. Create your own company flow instead.",
        });
      }
      if (flow.company_id !== req.user.company_id) {
        return res
          .status(403)
          .json({ success: false, message: "Access denied" });
      }
    }

    const effectiveDialCode =
      dial_code !== undefined ? dial_code : flow.dial_code;
    const effectiveSuccessMarkers =
      success_markers !== undefined ? success_markers : flow.success_markers;
    const effectiveFailureMarkers =
      failure_markers !== undefined ? failure_markers : flow.failure_markers;

    const shouldValidateMetadata =
      dial_code !== undefined ||
      success_markers !== undefined ||
      failure_markers !== undefined ||
      (is_active === true && flow.is_active !== true);

    if (shouldValidateMetadata && effectiveDialCode !== undefined) {
      const metadataError = validateFlowMetadata({
        dial_code: effectiveDialCode,
        success_markers: effectiveSuccessMarkers ?? [],
        failure_markers: effectiveFailureMarkers ?? [],
      });

      if (metadataError) {
        return res.status(422).json({
          success: false,
          code: "USSD_FLOW_INVALID_METADATA",
          message: metadataError,
        });
      }
    }

    // Reactivation is a new decision to make this flow executable again.
    // Re-check the current Flow Builder capability instead of reviving a
    // provider/type that has subsequently been disabled.
    if (is_active === true && flow.is_active !== true) {
      const isGlobalFlow = flow.company_id === null;

      const eligibility = isGlobalFlow
        ? await getGlobalFlowBuilderEligibility(
            flow.provider,
            flow.transaction_type,
          )
        : await getFlowBuilderEligibility(
            "business",
            flow.provider,
            flow.transaction_type,
          );

      if (!eligibility.provider_registered) {
        return res.status(422).json({
          success: false,
          code: "USSD_PROVIDER_NOT_REGISTERED",
          message:
            "Provider is no longer registered for USSD Flow Builder configuration.",
        });
      }

      if (!eligibility.transaction_type_builder_enabled) {
        return res.status(422).json({
          success: false,
          code: "USSD_FLOW_TYPE_NOT_ENABLED",
          message: isGlobalFlow
            ? "This transaction type is no longer enabled for Global USSD Flow Builder configuration."
            : "This transaction type is no longer enabled for Business USSD Flow Builder configuration.",
        });
      }
    }

    // If reactivation does not replace the steps, validate the persisted
    // configuration before making it executable again. This protects
    // historical flows created before today's stricter safety rules.
    if (is_active === true && flow.is_active !== true && steps === undefined) {
      const persistedStepsResult = await query(
        `SELECT match_all, action, action_value
         FROM ussd_flow_steps
         WHERE flow_id = $1
         ORDER BY step_order`,
        [id],
      );

      const persistedStepError = validateFlowSteps(persistedStepsResult.rows);

      if (persistedStepError) {
        return res.status(422).json({
          success: false,
          code: "USSD_FLOW_INVALID_CONFIGURATION",
          message:
            "This flow cannot be reactivated because its saved steps are no longer safe. Edit and save the flow before reactivating it.",
        });
      }
    }

    if (steps !== undefined) {
      const stepError = validateFlowSteps(steps);
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
           bundle_category = CASE WHEN $4 THEN $5 ELSE bundle_category END,
           recipient_mode = CASE WHEN $6 THEN $7 ELSE recipient_mode END,
           business_sim_role =
             CASE WHEN $8 THEN $9 ELSE business_sim_role END,
           is_active = COALESCE($10, is_active),
           updated_at = NOW()
         WHERE id = $11
         RETURNING *`,
        [
          dial_code,
          success_markers,
          failure_markers,
          hasBundleCategory,
          bundle_category || null,
          hasRecipientMode,
          recipient_mode || null,
          hasBusinessSimRole,
          requestedBusinessSimRole,
          is_active,
          id,
        ],
      );

      if (steps !== undefined) {
        await client.query("DELETE FROM ussd_flow_steps WHERE flow_id = $1", [
          id,
        ]);
        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          await client.query(
            `INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
             VALUES ($1, $2, $3, $4, $5)`,
            [id, i, step.match_all, step.action, step.action_value || null],
          );
        }
      }

      return result.rows[0];
    });

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: "USSD_FLOW_UPDATED",
      entityType: "ussd_flow",
      entityId: id,
      newValues: {
        dial_code,
        ...(hasBundleCategory
          ? { bundle_category: bundle_category || null }
          : {}),
        ...(hasRecipientMode ? { recipient_mode: recipient_mode || null } : {}),
        is_active,
        steps_replaced: steps !== undefined,
      },
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message:
          "An active flow already exists for this provider, transaction type, and flow variant.",
      });
    }

    logger.error("Update USSD flow error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to update USSD flow" });
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
    const existing = await query(
      "SELECT * FROM ussd_flows WHERE id = $1 AND owner_user_id IS NULL",
      [id],
    );
    if (existing.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Flow not found" });
    }
    const flow = existing.rows[0];

    if (req.user.role !== "superuser") {
      if (flow.company_id === null) {
        return res
          .status(403)
          .json({ success: false, message: "Global flows are read-only." });
      }
      if (flow.company_id !== req.user.company_id) {
        return res
          .status(403)
          .json({ success: false, message: "Access denied" });
      }
    }

    await query(
      "UPDATE ussd_flows SET is_active = false, updated_at = NOW() WHERE id = $1",
      [id],
    );

    await auditLog({
      userId: req.user.id,
      companyId: req.user.company_id,
      action: "USSD_FLOW_DEACTIVATED",
      entityType: "ussd_flow",
      entityId: id,
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    res.json({ success: true, message: "Flow deactivated" });
  } catch (error) {
    logger.error("Delete USSD flow error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete USSD flow" });
  }
};

// ── Resolve the active flow for a provider/transaction_type ──────
// Called by an agent's device at transaction time (not the builder UI)
// to find out how to automate a USSD dial for anything not already
// hardcoded (MTN/Telecel). Precedence: the calling user's own company's
// flow wins if one exists; otherwise falls back to the global flow;
// otherwise 404 (nothing configured, caller should fall back to
// whatever non-automated path it already has).
exports.resolveFlow = async (req, res) => {
  const {
    provider,
    transaction_type,
    bundle_category,
    recipient_mode,
    sim_role,
  } = req.query;

  const businessSimRole = String(sim_role || "agent")
    .trim()
    .toLowerCase();

  if (!["agent", "evd", "merchant"].includes(businessSimRole)) {
    return res.status(422).json({
      success: false,
      code: "INVALID_BUSINESS_SIM_ROLE",
      message: "sim_role must be agent, evd, or merchant",
    });
  }

  if (!provider || !transaction_type) {
    return res.status(422).json({
      success: false,
      message: "provider and transaction_type are required",
    });
  }

  try {
    let flow = null;

    if (req.user.company_id) {
      // Business mode resolves only the caller's Company override first.
      // owner_user_id IS NULL is explicit so Personal-owned or malformed
      // mixed-ownership rows can never cross into Business execution.
      const companyResult = await query(
        `SELECT * FROM ussd_flows
         WHERE company_id = $1
           AND owner_user_id IS NULL
           AND provider = $2
           AND transaction_type = $3
           AND business_sim_role = $4
           AND is_active = TRUE
           AND COALESCE(bundle_category,'') = COALESCE($5,'')
           AND COALESCE(recipient_mode,'') = COALESCE($6,'')`,
        [
          req.user.company_id,
          provider,
          transaction_type,
          businessSimRole,
          bundle_category || null,
          recipient_mode || null,
        ],
      );

      if (companyResult.rows.length > 0) {
        flow = companyResult.rows[0];
      }
    }

    if (!flow) {
      // Global means BOTH ownership columns are NULL.
      const globalResult = await query(
        `SELECT * FROM ussd_flows
         WHERE company_id IS NULL
           AND owner_user_id IS NULL
           AND provider = $1
           AND transaction_type = $2
           AND business_sim_role = $3
           AND is_active = TRUE
           AND COALESCE(bundle_category,'') = COALESCE($4,'')
           AND COALESCE(recipient_mode,'') = COALESCE($5,'')`,
        [
          provider,
          transaction_type,
          businessSimRole,
          bundle_category || null,
          recipient_mode || null,
        ],
      );

      if (globalResult.rows.length > 0) {
        flow = globalResult.rows[0];
      }
    }

    if (!flow) {
      return res.status(404).json({
        success: false,
        message:
          `No USSD flow configured for ${provider} ` +
          `${transaction_type} (${businessSimRole})`,
      });
    }

    // Validate stored flow metadata at runtime as well. Historical rows may
    // predate the current builder validation rules.
    if (flow.dial_code !== undefined) {
      const runtimeMetadataError = validateFlowMetadata({
        dial_code: flow.dial_code,
        success_markers: flow.success_markers ?? [],
        failure_markers: flow.failure_markers ?? [],
      });

      if (runtimeMetadataError) {
        logger.warn("Unsafe Business USSD flow metadata blocked at runtime", {
          flowId: flow.id,
          reason: runtimeMetadataError,
        });

        return res.status(409).json({
          success: false,
          code: "USSD_FLOW_INVALID_CONFIGURATION",
          message:
            "The active USSD flow metadata is invalid and cannot be executed.",
        });
      }
    }

    const stepsResult = await query(
      `SELECT match_all, action, action_value
       FROM ussd_flow_steps
       WHERE flow_id = $1
       ORDER BY step_order`,
      [flow.id],
    );

    const runtimeStepError = validateFlowSteps(stepsResult.rows);

    if (runtimeStepError) {
      logger.warn("Unsafe Business USSD flow blocked at runtime", {
        flowId: flow.id,
        reason: runtimeStepError,
      });

      return res.status(409).json({
        success: false,
        code: "USSD_FLOW_INVALID_CONFIGURATION",
        message:
          "The active USSD flow configuration is invalid and cannot be executed.",
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
    logger.error("Resolve USSD flow error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to resolve USSD flow",
    });
  }
};
