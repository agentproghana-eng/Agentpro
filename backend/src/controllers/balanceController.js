const { v4: uuidv4 } = require("uuid");
const { query, withTransaction } = require("../config/database");
const { auditLog } = require("../services/auditService");
const {
  resolveAgentFinancialBranch
} = require("../services/financialBranchService");
const {
  getOrCreateAgentCashBalance,
  getOrCreateAgentSimWallet
} = require("../services/agentWalletService");
const { logger } = require("../utils/logger");

// Read the agent's one physical cash drawer.
//
// This endpoint is intentionally READ ONLY:
// - it never creates a cash balance just because a screen was opened;
// - it never falls back to legacy provider-level balance rows.
exports.getOwnCashBalance = async (req, res) => {
  const agentId = req.user.id;

  try {
    const result = await query(
      `SELECT id,
              cash_at_hand,
              last_updated_at
       FROM agent_cash_balances
       WHERE agent_id = $1
       LIMIT 1`,
      [agentId]
    );

    const cash = result.rows[0] || null;

    return res.json({
      success: true,
      data: {
        cash_balance_id: cash?.id || null,
        cash_at_hand:
          cash?.cash_at_hand || "0.00",
        last_updated_at:
          cash?.last_updated_at || null
      }
    });
  } catch (error) {
    logger.error(
      "Get own cash balance error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch cash balance"
    });
  }
};


// Read the tracked electronic balances for one exact SIM identity.
//
// This endpoint is intentionally READ ONLY:
// - it never creates a SIM wallet just because a screen was opened;
// - it never attributes legacy provider aggregates to a physical SIM;
// - legacy_unassigned money is returned separately for reconciliation.
exports.getOwnSimWalletBalance = async (req, res) => {
  const agentId = req.user.id;

  const provider =
    String(req.query.provider || "").trim();

  const normalizedIccid =
    String(req.query.sim_iccid || "").trim();

  const normalizedInstallationId =
    String(req.query.installation_id || "").trim();

  const parseOptionalNonNegativeInteger = (value) => {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }

    const parsed = Number(value);

    return Number.isInteger(parsed) && parsed >= 0
      ? parsed
      : null;
  };

  const normalizedSlot =
    parseOptionalNonNegativeInteger(req.query.sim_slot);

  const normalizedSubscriptionId =
    parseOptionalNonNegativeInteger(
      req.query.sim_subscription_id
    );

  if (!["mtn", "telecel", "at_money"].includes(provider)) {
    return res.status(422).json({
      success: false,
      message: "Invalid provider"
    });
  }

  if (normalizedSlot === null) {
    return res.status(422).json({
      success: false,
      message: "A valid SIM slot is required"
    });
  }

  // Without ICCID, provider + slot is not enough to identify an
  // electronic wallet. Require the complete conservative fallback.
  if (
    !normalizedIccid &&
    (
      !normalizedInstallationId ||
      normalizedSubscriptionId === null
    )
  ) {
    return res.status(422).json({
      success: false,
      code: "SIM_IDENTITY_REQUIRED",
      message:
        "A physical SIM ICCID or complete unresolved SIM identity " +
        "(installation_id, sim_subscription_id, sim_slot) is required"
    });
  }

  try {
    let exactResult;

    if (normalizedIccid) {
      // ICCID is the durable identity. Slot/device fields are observation
      // metadata and must not split an ICCID-backed wallet.
      exactResult = await query(
        `SELECT id,
                identity_status,
                sim_iccid,
                installation_id,
                sim_subscription_id,
                last_known_sim_slot,
                working_balance,
                e_float_balance,
                commission_balance,
                last_updated_at
         FROM agent_sim_wallets
         WHERE agent_id = $1
           AND provider = $2
           AND identity_status = 'identified'
           AND sim_iccid = $3
         LIMIT 1`,
        [
          agentId,
          provider,
          normalizedIccid
        ]
      );
    } else {
      exactResult = await query(
        `SELECT id,
                identity_status,
                sim_iccid,
                installation_id,
                sim_subscription_id,
                last_known_sim_slot,
                working_balance,
                e_float_balance,
                commission_balance,
                last_updated_at
         FROM agent_sim_wallets
         WHERE agent_id = $1
           AND provider = $2
           AND identity_status = 'unresolved'
           AND installation_id = $3
           AND sim_subscription_id = $4
           AND last_known_sim_slot = $5
         LIMIT 1`,
        [
          agentId,
          provider,
          normalizedInstallationId,
          normalizedSubscriptionId,
          normalizedSlot
        ]
      );
    }

    // Historical provider-level balances remain deliberately separate.
    const legacyResult = await query(
      `SELECT id,
              working_balance,
              e_float_balance,
              commission_balance,
              last_updated_at
       FROM agent_sim_wallets
       WHERE agent_id = $1
         AND provider = $2
         AND identity_status = 'legacy_unassigned'
       LIMIT 1`,
      [
        agentId,
        provider
      ]
    );

    const exact =
      exactResult.rows[0] || null;

    const legacy =
      legacyResult.rows[0] || null;

    const legacyWorking =
      legacy
        ? Number(legacy.working_balance || 0)
        : 0;

    const legacyEFloat =
      legacy
        ? Number(legacy.e_float_balance || 0)
        : 0;

    const legacyCommission =
      legacy
        ? Number(legacy.commission_balance || 0)
        : 0;

    const reconciliationRequired =
      legacy !== null &&
      (
        legacyWorking !== 0 ||
        legacyEFloat !== 0 ||
        legacyCommission !== 0
      );

    return res.json({
      success: true,
      data: {
        provider,

        requested_identity_status:
          normalizedIccid
            ? "identified"
            : "unresolved",

        sim_slot: normalizedSlot,

        exact_wallet_exists: exact !== null,
        sim_wallet_id: exact?.id || null,

        identity_status:
          exact?.identity_status ||
          (
            normalizedIccid
              ? "identified"
              : "unresolved"
          ),

        working_balance:
          exact?.working_balance || "0.00",

        e_float_balance:
          exact?.e_float_balance || "0.00",

        commission_balance:
          exact?.commission_balance || "0.00",

        last_updated_at:
          exact?.last_updated_at || null,

        legacy_unassigned: legacy
          ? {
              sim_wallet_id: legacy.id,
              working_balance:
                legacy.working_balance,
              e_float_balance:
                legacy.e_float_balance,
              commission_balance:
                legacy.commission_balance,
              last_updated_at:
                legacy.last_updated_at
            }
          : null,

        reconciliation_required:
          reconciliationRequired
      }
    });
  } catch (error) {
    logger.error(
      "Get exact SIM wallet balance error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch SIM wallet balance"
    });
  }
};


// Manual Cash Out for providers where e-cash moves directly SIM-to-SIM
// (Telecel, AirtelTigo) and cannot be captured by USSD automation. The
// agent enters the cash they handed over; e-Float goes UP by that
// amount (the customer's e-cash just arrived), Cash at Hand goes DOWN
// by the same amount (that cash just left the agent's hand).
exports.recordCashOutManual = async (req, res) => {
  const {
    provider,
    amount,
    reference,
    notes,
    client_operation_id,
    sim_iccid,
    sim_slot,
    installation_id,
    sim_subscription_id
  } = req.body;

  const agentId = req.user.id;
  const companyId = req.user.company_id;
  const amt = parseFloat(amount);
  const customerPhone = String(reference || "").trim();
  const normalizedNotes = String(notes || "").trim();
  const normalizedIccid = String(sim_iccid || "").trim();
  const normalizedSlot =
    sim_slot === null || sim_slot === undefined || sim_slot === ""
      ? null
      : Number(sim_slot);
  const normalizedInstallationId = String(installation_id || "").trim();
  const normalizedSubscriptionId =
    sim_subscription_id === null ||
    sim_subscription_id === undefined ||
    sim_subscription_id === ""
      ? null
      : Number(sim_subscription_id);

  const isSameSimIdentity = (existing) => {
    const existingIccid = String(existing.sim_iccid || "").trim();
    const existingSlot =
      existing.sim_slot === null || existing.sim_slot === undefined
        ? null
        : Number(existing.sim_slot);

    if (normalizedIccid) {
      return (
        existingIccid === normalizedIccid &&
        existingSlot === normalizedSlot
      );
    }

    const existingSubscriptionId =
      existing.sim_subscription_id === null ||
      existing.sim_subscription_id === undefined
        ? null
        : Number(existing.sim_subscription_id);

    return (
      existingIccid === "" &&
      existingSlot === normalizedSlot &&
      String(existing.installation_id || "") === normalizedInstallationId &&
      existingSubscriptionId === normalizedSubscriptionId
    );
  };

  const isSameOperation = (existing) =>
    existing.provider === provider &&
    existing.transaction_type === "cash_out" &&
    Number(existing.amount) === amt &&
    String(existing.customer_phone || "") === customerPhone &&
    String(existing.notes || "") === normalizedNotes &&
    isSameSimIdentity(existing) &&
    existing.status === "success";

  try {
    const result = await withTransaction(async (client) => {
      // Fast replay path. A completed manual Cash Out must never post its
      // two balance movements a second time.
      const existingResult = await client.query(
        `SELECT id, reference, status, amount, provider, transaction_type,
                customer_phone, notes, sim_iccid, sim_slot,
                installation_id, sim_subscription_id,
                branch_id, company_id, created_at, completed_at
         FROM transactions
         WHERE agent_id = $1
           AND client_operation_id = $2
         FOR UPDATE`,
        [agentId, client_operation_id]
      );

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];

        if (!isSameOperation(existing)) {
          throw {
            statusCode: 409,
            code: "CLIENT_OPERATION_CONFLICT",
            message:
              "client_operation_id has already been used for a different transaction"
          };
        }

        return {
          transaction: existing,
          idempotentReplay: true
        };
      }

      const branchResolution = await resolveAgentFinancialBranch({
        queryFn: client.query.bind(client),
        agentId,
        companyId
      });

      if (!branchResolution.ok) {
        throw {
          statusCode: 409,
          code: branchResolution.code,
          message:
            branchResolution.code === "NO_ACTIVE_BRANCH"
              ? "You are not currently assigned to an active branch. Contact your business owner or manager."
              : "Your branch assignment is ambiguous. Contact your business owner or manager before recording financial transactions."
        };
      }

      const internalReference = `APG-MAN-${uuidv4().toUpperCase()}`;

      // ON CONFLICT is the concurrency barrier for two simultaneous retries
      // carrying the same operation ID. Only one request may create/post.
      const txResult = await client.query(
        `INSERT INTO transactions (
           reference, agent_id, branch_id, company_id, provider,
           transaction_type, status, amount, fee,
           customer_phone, notes, sim_iccid, sim_slot,
           installation_id, sim_subscription_id,
           client_operation_id, completed_at
         ) VALUES (
           $1, $2, $3, $4, $5,
           'cash_out', 'success', $6, 0,
           $7, $8, $9, $10,
           $11, $12, $13, NOW()
         )
         ON CONFLICT (agent_id, client_operation_id)
           WHERE client_operation_id IS NOT NULL
         DO NOTHING
         RETURNING id, reference, status, amount, provider, transaction_type,
                   customer_phone, notes, sim_iccid, sim_slot,
                   installation_id, sim_subscription_id,
                   branch_id, company_id, created_at, completed_at`,
        [
          internalReference,
          agentId,
          branchResolution.branchId,
          companyId,
          provider,
          amt,
          customerPhone,
          normalizedNotes,
          normalizedIccid || null,
          normalizedSlot,
          normalizedInstallationId || null,
          normalizedSubscriptionId,
          client_operation_id
        ]
      );

      // Another request may have won the unique-index race while this one
      // was resolving the branch. In that case, return the winner and do
      // not touch balances.
      if (txResult.rows.length === 0) {
        const winnerResult = await client.query(
          `SELECT id, reference, status, amount, provider, transaction_type,
                  customer_phone, notes, sim_iccid, sim_slot,
                  installation_id, sim_subscription_id,
                  branch_id, company_id, created_at, completed_at
           FROM transactions
           WHERE agent_id = $1
             AND client_operation_id = $2
           FOR UPDATE`,
          [agentId, client_operation_id]
        );

        const winner = winnerResult.rows[0];

        if (!winner || !isSameOperation(winner)) {
          throw {
            statusCode: 409,
            code: "CLIENT_OPERATION_CONFLICT",
            message:
              "client_operation_id has already been used for a different transaction"
          };
        }

        return {
          transaction: winner,
          idempotentReplay: true
        };
      }

      const transaction = txResult.rows[0];

      // Resolve and lock the exact electronic wallet used by this operation.
      // ICCID is authoritative when available. Otherwise the wallet service
      // requires the complete unresolved installation/subscription/slot
      // identity and refuses provider-only accounting.
      const simWallet = await getOrCreateAgentSimWallet(
        client,
        {
          agentId,
          provider,
          simIccid: normalizedIccid,
          installationId: normalizedInstallationId,
          simSubscriptionId: normalizedSubscriptionId,
          simSlot: normalizedSlot
        }
      );

      // Physical cash is one drawer per agent, independent of provider/SIM.
      const cashBalance = await getOrCreateAgentCashBalance(
        client,
        agentId
      );

      // Persist the transaction -> wallet provenance before posting balances.
      // All of this remains inside the same database transaction.
      const transactionWalletLink = await client.query(
        `UPDATE transactions
         SET sim_wallet_id = $1
         WHERE id = $2
           AND agent_id = $3
           AND provider = $4
         RETURNING id`,
        [
          simWallet.id,
          transaction.id,
          agentId,
          provider
        ]
      );

      if (transactionWalletLink.rows.length !== 1) {
        throw new Error(
          "Unable to link Manual Cash Out transaction to SIM wallet"
        );
      }

      const eFloatBefore = parseFloat(
        simWallet.e_float_balance
      );
      const eFloatAfter = eFloatBefore + amt;

      const cashBefore = parseFloat(
        cashBalance.cash_at_hand
      );
      const cashAfter = cashBefore - amt;

      const simProvenanceStatus =
        normalizedIccid
          ? "identified"
          : "unresolved";

      const eFloatUpdate = await client.query(
        `UPDATE agent_sim_wallets
         SET e_float_balance = $1,
             last_updated_at = NOW()
         WHERE id = $2
           AND agent_id = $3
           AND provider = $4
         RETURNING id`,
        [
          eFloatAfter,
          simWallet.id,
          agentId,
          provider
        ]
      );

      if (eFloatUpdate.rows.length !== 1) {
        throw new Error(
          "Unable to update Manual Cash Out SIM wallet"
        );
      }

      const cashUpdate = await client.query(
        `UPDATE agent_cash_balances
         SET cash_at_hand = $1,
             last_updated_at = NOW()
         WHERE id = $2
           AND agent_id = $3
         RETURNING id`,
        [
          cashAfter,
          cashBalance.id,
          agentId
        ]
      );

      if (cashUpdate.rows.length !== 1) {
        throw new Error(
          "Unable to update Manual Cash Out cash drawer"
        );
      }

      // Electronic side:
      // customer e-cash arrived on this exact SIM wallet.
      await client.query(
        `INSERT INTO agent_balance_movements (
           agent_id,
           provider,
           movement_type,
           balance_type,
           amount,
           balance_before,
           balance_after,
           reference,
           notes,
           transaction_id,
           sim_wallet_id,
           sim_iccid,
           installation_id,
           sim_subscription_id,
           sim_slot,
           sim_provenance_status
         ) VALUES (
           $1,
           $2,
           'cash_out_manual',
           'e_float',
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           $13,
           $14
         )`,
        [
          agentId,
          provider,
          amt,
          eFloatBefore,
          eFloatAfter,
          transaction.reference,
          normalizedNotes,
          transaction.id,
          simWallet.id,
          normalizedIccid || null,
          normalizedInstallationId || null,
          normalizedSubscriptionId,
          normalizedSlot,
          simProvenanceStatus
        ]
      );

      // Physical side:
      // cash left the agent's single drawer. Provider/SIM fields remain
      // provenance for the transaction, not the identity of the cash balance.
      await client.query(
        `INSERT INTO agent_balance_movements (
           agent_id,
           provider,
           movement_type,
           balance_type,
           amount,
           balance_before,
           balance_after,
           reference,
           notes,
           transaction_id,
           cash_balance_id,
           sim_iccid,
           installation_id,
           sim_subscription_id,
           sim_slot,
           sim_provenance_status
         ) VALUES (
           $1,
           $2,
           'cash_out_manual',
           'cash_at_hand',
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           $13,
           $14
         )`,
        [
          agentId,
          provider,
          -amt,
          cashBefore,
          cashAfter,
          transaction.reference,
          normalizedNotes,
          transaction.id,
          cashBalance.id,
          normalizedIccid || null,
          normalizedInstallationId || null,
          normalizedSubscriptionId,
          normalizedSlot,
          simProvenanceStatus
        ]
      );

      return {
        transaction,
        idempotentReplay: false
      };
    });

    const transaction = result.transaction;

    return res.status(result.idempotentReplay ? 200 : 201).json({
      success: true,
      message: result.idempotentReplay
        ? "Existing Cash Out returned for retry."
        : "Cash Out recorded successfully.",
      data: {
        transaction_id: transaction.id,
        reference: transaction.reference,
        status: transaction.status,
        created_at: transaction.created_at,
        completed_at: transaction.completed_at,
        idempotent_replay: result.idempotentReplay
      }
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        ...(error.code ? { code: error.code } : {})
      });
    }

    logger.error("Manual cash out error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to record Cash Out"
    });
  }
};


// Agent self-declares e-float bought from a super-agent - a real
// event the app cannot otherwise observe.
//
// This is a canonical financial event, not a branch-float transfer and
// not a customer Cash In. It therefore receives its own transaction row,
// stable client idempotency key, exact SIM-wallet target, and linked ledger
// movement.
exports.recordFloatReceived = async (req, res) => {
  const {
    provider,
    amount,
    reference,
    notes,
    client_operation_id,
    sim_iccid,
    sim_slot,
    installation_id,
    sim_subscription_id
  } = req.body;

  const agentId = req.user.id;
  const companyId = req.user.company_id;

  const amt = parseFloat(amount);
  const normalizedExternalReference =
    String(reference || "").trim();
  const normalizedNotes =
    String(notes || "").trim();
  const normalizedIccid =
    String(sim_iccid || "").trim();

  const normalizedSlot =
    sim_slot === null ||
    sim_slot === undefined ||
    sim_slot === ""
      ? null
      : Number(sim_slot);

  const normalizedInstallationId =
    String(installation_id || "").trim();

  const normalizedSubscriptionId =
    sim_subscription_id === null ||
    sim_subscription_id === undefined ||
    sim_subscription_id === ""
      ? null
      : Number(sim_subscription_id);

  const isSameSimIdentity = (existing) => {
    const existingIccid =
      String(existing.sim_iccid || "").trim();

    const existingSlot =
      existing.sim_slot === null ||
      existing.sim_slot === undefined
        ? null
        : Number(existing.sim_slot);

    // ICCID is authoritative when available.
    if (normalizedIccid) {
      return (
        existingIccid === normalizedIccid &&
        existingSlot === normalizedSlot
      );
    }

    const existingSubscriptionId =
      existing.sim_subscription_id === null ||
      existing.sim_subscription_id === undefined
        ? null
        : Number(existing.sim_subscription_id);

    return (
      existingIccid === "" &&
      existingSlot === normalizedSlot &&
      String(existing.installation_id || "") ===
        normalizedInstallationId &&
      existingSubscriptionId === normalizedSubscriptionId
    );
  };

  const isSameOperation = (existing) =>
    existing.provider === provider &&
    existing.transaction_type === "float_received" &&
    Number(existing.amount) === amt &&
    String(existing.network_reference || "") ===
      normalizedExternalReference &&
    String(existing.notes || "") === normalizedNotes &&
    isSameSimIdentity(existing) &&
    existing.status === "success";

  try {
    const result = await withTransaction(async (client) => {
      // A retry of an already-completed declaration must return the same
      // canonical transaction without crediting e-Float a second time.
      const existingResult = await client.query(
        `SELECT id, reference, network_reference, status, amount,
                provider, transaction_type, notes,
                sim_iccid, sim_slot,
                installation_id, sim_subscription_id,
                sim_wallet_id,
                branch_id, company_id,
                created_at, completed_at
         FROM transactions
         WHERE agent_id = $1
           AND client_operation_id = $2
         FOR UPDATE`,
        [
          agentId,
          client_operation_id
        ]
      );

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];

        if (!isSameOperation(existing)) {
          throw {
            statusCode: 409,
            code: "CLIENT_OPERATION_CONFLICT",
            message:
              "client_operation_id has already been used for a different transaction"
          };
        }

        return {
          transaction: existing,
          idempotentReplay: true
        };
      }

      const branchResolution =
        await resolveAgentFinancialBranch({
          queryFn: client.query.bind(client),
          agentId,
          companyId
        });

      if (!branchResolution.ok) {
        throw {
          statusCode: 409,
          code: branchResolution.code,
          message:
            branchResolution.code === "NO_ACTIVE_BRANCH"
              ? "You are not currently assigned to an active branch. Contact your business owner or manager."
              : "Your branch assignment is ambiguous. Contact your business owner or manager before recording financial transactions."
        };
      }

      const internalReference =
        `APG-FLT-${uuidv4().toUpperCase()}`;

      // The unique client-operation constraint is also the concurrency
      // barrier when two identical retries arrive together.
      const txResult = await client.query(
        `INSERT INTO transactions (
           reference,
           network_reference,
           agent_id,
           branch_id,
           company_id,
           provider,
           transaction_type,
           status,
           amount,
           fee,
           notes,
           sim_iccid,
           sim_slot,
           installation_id,
           sim_subscription_id,
           client_operation_id,
           completed_at
         ) VALUES (
           $1,
           $2,
           $3,
           $4,
           $5,
           $6,
           'float_received',
           'success',
           $7,
           0,
           $8,
           $9,
           $10,
           $11,
           $12,
           $13,
           NOW()
         )
         ON CONFLICT (agent_id, client_operation_id)
           WHERE client_operation_id IS NOT NULL
         DO NOTHING
         RETURNING id, reference, network_reference, status, amount,
                   provider, transaction_type, notes,
                   sim_iccid, sim_slot,
                   installation_id, sim_subscription_id,
                   sim_wallet_id,
                   branch_id, company_id,
                   created_at, completed_at`,
        [
          internalReference,
          normalizedExternalReference || null,
          agentId,
          branchResolution.branchId,
          companyId,
          provider,
          amt,
          normalizedNotes,
          normalizedIccid || null,
          normalizedSlot,
          normalizedInstallationId || null,
          normalizedSubscriptionId,
          client_operation_id
        ]
      );

      // A concurrent identical request may have committed the unique
      // operation ID first. Return that winner without touching balances.
      if (txResult.rows.length === 0) {
        const winnerResult = await client.query(
          `SELECT id, reference, network_reference, status, amount,
                  provider, transaction_type, notes,
                  sim_iccid, sim_slot,
                  installation_id, sim_subscription_id,
                  sim_wallet_id,
                  branch_id, company_id,
                  created_at, completed_at
           FROM transactions
           WHERE agent_id = $1
             AND client_operation_id = $2
           FOR UPDATE`,
          [
            agentId,
            client_operation_id
          ]
        );

        const winner = winnerResult.rows[0];

        if (!winner || !isSameOperation(winner)) {
          throw {
            statusCode: 409,
            code: "CLIENT_OPERATION_CONFLICT",
            message:
              "client_operation_id has already been used for a different transaction"
          };
        }

        return {
          transaction: winner,
          idempotentReplay: true
        };
      }

      const transaction = txResult.rows[0];

      // Resolve and lock only the exact physical/unresolved SIM wallet.
      // The wallet service never selects legacy_unassigned for new money.
      const simWallet = await getOrCreateAgentSimWallet(
        client,
        {
          agentId,
          provider,
          simIccid: normalizedIccid,
          installationId: normalizedInstallationId,
          simSubscriptionId: normalizedSubscriptionId,
          simSlot: normalizedSlot
        }
      );

      const transactionWalletLink =
        await client.query(
          `UPDATE transactions
           SET sim_wallet_id = $1
           WHERE id = $2
             AND agent_id = $3
             AND provider = $4
           RETURNING id`,
          [
            simWallet.id,
            transaction.id,
            agentId,
            provider
          ]
        );

      if (transactionWalletLink.rows.length !== 1) {
        throw new Error(
          "Unable to link Float Received transaction to SIM wallet"
        );
      }

      const eFloatBefore =
        parseFloat(simWallet.e_float_balance);
      const eFloatAfter =
        eFloatBefore + amt;

      const walletUpdate =
        await client.query(
          `UPDATE agent_sim_wallets
           SET e_float_balance = $1,
               last_updated_at = NOW()
           WHERE id = $2
             AND agent_id = $3
             AND provider = $4
           RETURNING id`,
          [
            eFloatAfter,
            simWallet.id,
            agentId,
            provider
          ]
        );

      if (walletUpdate.rows.length !== 1) {
        throw new Error(
          "Unable to update Float Received SIM wallet"
        );
      }

      const simProvenanceStatus =
        normalizedIccid
          ? "identified"
          : "unresolved";

      await client.query(
        `INSERT INTO agent_balance_movements (
           agent_id,
           provider,
           movement_type,
           balance_type,
           amount,
           balance_before,
           balance_after,
           reference,
           notes,
           transaction_id,
           sim_wallet_id,
           sim_iccid,
           installation_id,
           sim_subscription_id,
           sim_slot,
           sim_provenance_status
         ) VALUES (
           $1,
           $2,
           'float_received',
           'e_float',
           $3,
           $4,
           $5,
           $6,
           $7,
           $8,
           $9,
           $10,
           $11,
           $12,
           $13,
           $14
         )`,
        [
          agentId,
          provider,
          amt,
          eFloatBefore,
          eFloatAfter,
          normalizedExternalReference ||
            transaction.reference,
          normalizedNotes,
          transaction.id,
          simWallet.id,
          normalizedIccid || null,
          normalizedInstallationId || null,
          normalizedSubscriptionId,
          normalizedSlot,
          simProvenanceStatus
        ]
      );

      return {
        transaction: {
          ...transaction,
          sim_wallet_id: simWallet.id
        },
        idempotentReplay: false
      };
    });

    const transaction = result.transaction;

    return res
      .status(result.idempotentReplay ? 200 : 201)
      .json({
        success: true,
        message: result.idempotentReplay
          ? "Existing Float Received declaration returned for retry."
          : "Float received recorded successfully.",
        data: {
          transaction_id: transaction.id,
          reference: transaction.reference,
          status: transaction.status,
          created_at: transaction.created_at,
          completed_at: transaction.completed_at,
          idempotent_replay: result.idempotentReplay
        }
      });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        ...(error.code ? { code: error.code } : {})
      });
    }

    logger.error("Float received error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to record float received"
    });
  }
};


// Cash at hand can be adjusted two ways:
// - "cash_set": agent states what cash at hand currently is - takes
//   effect immediately, no approval needed (routine self-report).
// - "cash_injection" / "cash_withdrawal": adding or removing real
//   money from the till - requires manager/owner approval before it
//   takes effect, since this is a bigger financial event.
exports.submitCashAdjustment = async (req, res) => {
  const { adjustment_type, amount, reason } = req.body;
  const agentId = req.user.id;

  const validTypes = ["cash_set", "cash_injection", "cash_withdrawal"];
  if (!validTypes.includes(adjustment_type)) {
    return res.status(422).json({
      success: false,
      message: "Invalid adjustment_type"
    });
  }

  if (
    amount === undefined ||
    amount === null ||
    parseFloat(amount) < 0
  ) {
    return res.status(422).json({
      success: false,
      message: "A valid amount is required"
    });
  }

  try {
    const result = await withTransaction(async (client) => {
      // Physical cash is one drawer per agent. Cash-only adjustments
      // have no provider dimension; provider is stored as NULL.
      const cashBalance = await getOrCreateAgentCashBalance(
        client,
        agentId
      );

      const amt = parseFloat(amount);
      const cashBefore = parseFloat(cashBalance.cash_at_hand);

      if (adjustment_type === "cash_set") {
        await client.query(
          `UPDATE agent_cash_balances
           SET cash_at_hand = $1,
               last_updated_at = NOW()
           WHERE id = $2`,
          [amt, cashBalance.id]
        );

        await client.query(
          `INSERT INTO agent_balance_movements (
             agent_id,
             provider,
             movement_type,
             balance_type,
             amount,
             balance_before,
             balance_after,
             notes,
             status,
             cash_balance_id
           ) VALUES (
             $1,
             $2,
             'cash_set',
             'cash_at_hand',
             $3,
             $4,
             $5,
             $6,
             'completed',
             $7
           )`,
          [
            agentId,
            null,
            amt - cashBefore,
            cashBefore,
            amt,
            reason,
            cashBalance.id
          ]
        );

        return { immediate: true };
      }

      // Injection/withdrawal is only a pending request here. The physical
      // drawer is unchanged until an authorized reviewer approves it.
      const signedAmt =
        adjustment_type === "cash_withdrawal"
          ? -amt
          : amt;

      const movementResult = await client.query(
        `INSERT INTO agent_balance_movements (
           agent_id,
           provider,
           movement_type,
           balance_type,
           amount,
           balance_before,
           balance_after,
           notes,
           status,
           cash_balance_id
         ) VALUES (
           $1,
           $2,
           $3,
           'cash_at_hand',
           $4,
           $5,
           $5,
           $6,
           'pending',
           $7
         )
         RETURNING id`,
        [
          agentId,
          null,
          adjustment_type,
          signedAmt,
          cashBefore,
          reason,
          cashBalance.id
        ]
      );

      return {
        immediate: false,
        movementId: movementResult.rows[0].id
      };
    });

    if (result.immediate) {
      return res.json({
        success: true,
        message: "Cash at hand updated"
      });
    }

    return res.status(201).json({
      success: true,
      message: "Submitted for manager/owner approval",
      data: {
        movement_id: result.movementId
      }
    });
  } catch (error) {
    logger.error("Cash adjustment error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to submit cash adjustment"
    });
  }
};

// Manager/owner approves or rejects a pending cash injection or
// withdrawal. Only on approval does the balance actually change -
// rejecting leaves cash at hand untouched.
exports.reviewCashAdjustment = async (req, res) => {
  const { movement_id } = req.params;
  const { action, review_notes } = req.body;
  const reviewerId = req.user.id;
  const reviewerCompanyId = req.user.company_id;
  const isSuperuser = req.user.role === "superuser";

  if (!["approve", "reject"].includes(action)) {
    return res.status(422).json({
      success: false,
      message: "action must be approve or reject"
    });
  }

  const requestedStatus = action === "approve" ? "approved" : "rejected";

  try {
    const result = await withTransaction(async (client) => {
      // The movement itself is the concurrency lock. Every reviewer of this
      // adjustment must serialize here before inspecting or changing status.
      const movementResult = await client.query(
        `SELECT abm.*
         FROM agent_balance_movements abm
         INNER JOIN users u ON u.id = abm.agent_id
         WHERE abm.id = $1
           AND abm.movement_type IN ('cash_injection', 'cash_withdrawal')
           ${isSuperuser ? "" : "AND u.company_id = $2"}
         FOR UPDATE`,
        isSuperuser
          ? [movement_id]
          : [movement_id, reviewerCompanyId]
      );

      if (movementResult.rows.length === 0) {
        throw {
          statusCode: 404,
          code: "ADJUSTMENT_NOT_FOUND",
          message: "Cash adjustment not found"
        };
      }

      const movement = movementResult.rows[0];

      // Same final decision is an idempotent replay. Do not touch balances.
      if (movement.status === requestedStatus) {
        return {
          status: movement.status,
          idempotentReplay: true
        };
      }

      // A finalized opposite decision may never be overwritten.
      if (movement.status !== "pending") {
        throw {
          statusCode: 409,
          code: "ADJUSTMENT_ALREADY_REVIEWED",
          message: `Adjustment has already been ${movement.status}`
        };
      }

      if (action === "approve") {
        // The movement lock above serializes reviews. Now lock the
        // agent's one physical cash drawer before changing its balance.
        const cashBalance = await getOrCreateAgentCashBalance(
          client,
          movement.agent_id
        );

        if (
          movement.cash_balance_id &&
          movement.cash_balance_id !== cashBalance.id
        ) {
          throw new Error(
            "Cash adjustment movement does not match the agent cash drawer"
          );
        }

        const cashBefore =
          parseFloat(cashBalance.cash_at_hand);

        const cashAfter =
          cashBefore + parseFloat(movement.amount);

        await client.query(
          `UPDATE agent_cash_balances
           SET cash_at_hand = $1,
               last_updated_at = NOW()
           WHERE id = $2`,
          [
            cashAfter,
            cashBalance.id
          ]
        );

        await client.query(
          `UPDATE agent_balance_movements
           SET status = 'approved',
               balance_before = $1,
               balance_after = $2,
               reviewed_by = $3,
               reviewed_at = NOW(),
               review_notes = $4
           WHERE id = $5`,
          [
            cashBefore,
            cashAfter,
            reviewerId,
            review_notes,
            movement_id
          ]
        );
      } else {
        await client.query(
          `UPDATE agent_balance_movements
           SET status = 'rejected',
               reviewed_by = $1,
               reviewed_at = NOW(),
               review_notes = $2
           WHERE id = $3`,
          [
            reviewerId,
            review_notes,
            movement_id
          ]
        );
      }

      return {
        status: requestedStatus,
        idempotentReplay: false
      };
    });

    return res.json({
      success: true,
      message: result.idempotentReplay
        ? `Adjustment already ${result.status}`
        : `Adjustment ${result.status}`,
      data: {
        status: result.status,
        idempotent_replay: result.idempotentReplay
      }
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        ...(error.code ? { code: error.code } : {})
      });
    }

    logger.error("Review cash adjustment error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to review adjustment"
    });
  }
};


// List pending cash injections/withdrawals awaiting manager/owner review,
// scoped to the reviewer's own company.
exports.listPendingAdjustments = async (req, res) => {
  try {
    const result = await query(
      `SELECT abm.id, abm.agent_id, abm.movement_type, abm.amount,
              abm.notes, abm.created_at, u.first_name, u.last_name
       FROM agent_balance_movements abm
       JOIN users u ON u.id = abm.agent_id
       WHERE abm.status = $1 AND u.company_id = $2
       ORDER BY abm.created_at DESC`,
      ["pending", req.user.company_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error("List pending adjustments error:", error);
    res.status(500).json({ success: false, message: "Failed to fetch pending adjustments" });
  }
};
