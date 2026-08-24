const { v4: uuidv4 } = require("uuid");
const { query, withTransaction } = require("../config/database");
const { logger } = require("../utils/logger");
const { auditLog } = require("../services/auditService");
const {
  calculateAndPostCommission,
} = require("../services/commissionPostingService");
const {
  postCommissionTransfer,
} = require("../services/commissionTransferPostingService");
const { postCashIn } = require("../services/cashInPostingService");
const { postCashOut } = require("../services/cashOutPostingService");
const { postSendMoney } = require("../services/sendMoneyPostingService");
const { postAirtime } = require("../services/airtimePostingService");
const { postDataBundle } = require("../services/dataBundlePostingService");
const {
  postMerchantPayment,
} = require("../services/merchantPaymentPostingService");
const { postPayToAgent } = require("../services/payToAgentPostingService");
const {
  postWorkingFloatTransfer,
} = require("../services/workingFloatPostingService");
const { enqueueOutboxEvent } = require("../services/outboxService");
const { generateTransactionReceipt } = require("../services/reportService");
const {
  resolveAgentFinancialBranch,
} = require("../services/financialBranchService");

async function recordAgentSimUsage({
  agentId,
  companyId,
  provider,
  simIccid,
  transactionId,
  ipAddress,
  requestId,
}) {
  if (!simIccid) return;

  try {
    const [knownThisSim, hasAnyKnownSim] = await Promise.all([
      query(
        `SELECT 1
         FROM agent_sim_registry
         WHERE agent_id = $1
           AND provider = $2
           AND iccid = $3`,
        [agentId, provider, simIccid],
      ),
      query(
        `SELECT 1
         FROM agent_sim_registry
         WHERE agent_id = $1
           AND provider = $2
         LIMIT 1`,
        [agentId, provider],
      ),
    ]);

    if (knownThisSim.rows.length === 0 && hasAnyKnownSim.rows.length > 0) {
      await auditLog({
        userId: agentId,
        companyId,
        action: "NEW_SIM_DETECTED",
        entityType: "transaction",
        entityId: transactionId,
        newValues: {
          provider,
          sim_iccid: simIccid,
          message:
            "A different physical SIM than previously seen was used for this agent/provider combo",
        },
        ipAddress,
        requestId,
      });
    }

    await query(
      `INSERT INTO agent_sim_registry (
         agent_id,
         provider,
         iccid,
         transaction_count
       )
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (agent_id, provider, iccid)
       DO UPDATE SET
         last_seen_at = NOW(),
         transaction_count =
           agent_sim_registry.transaction_count + 1`,
      [agentId, provider, simIccid],
    );
  } catch (error) {
    logger.error("SIM registry check error (non-blocking):", error);
  }
}

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
    fee,
    payment_reference,
    merchant_id,
    sim_iccid,
    sim_slot,
    installation_id,
    sim_subscription_id,
    client_operation_id,
    sim_role,
  } = req.body;

  const agentId = req.user.id;
  const companyId = req.user.company_id;

  const businessSimRole = String(sim_role || "agent")
    .trim()
    .toLowerCase();

  if (["agent", "evd", "merchant"].includes(businessSimRole) == false) {
    return res.status(422).json({
      success: false,
      code: "INVALID_BUSINESS_SIM_ROLE",
      message: "sim_role must be agent, evd, or merchant",
    });
  }

  const isTransferChargeTransaction =
    (provider === "mtn" && transaction_type === "send_money") ||
    ((provider === "telecel" || provider === "at_money") &&
      transaction_type === "cash_in");

  const feeValue = isTransferChargeTransaction ? parseFloat(fee) || 0 : 0;

  const normalizeSlot = (value) =>
    value === null || value === undefined || value === ""
      ? null
      : Number(value);

  const normalizedRequestedIccid = String(sim_iccid || "").trim();

  const isSameSimIdentity = (existing) => {
    const existingIccid = String(existing.sim_iccid || "").trim();
    const sameSlot =
      normalizeSlot(existing.sim_slot) === normalizeSlot(sim_slot);

    // ICCID is authoritative when Android supplied it.
    if (normalizedRequestedIccid) {
      return existingIccid === normalizedRequestedIccid && sameSlot;
    }

    // Without ICCID, the operation must match the same installation,
    // Android subscription and slot. This remains an unresolved physical
    // identity and must never be merged into an ICCID-backed wallet.
    return (
      existingIccid === "" &&
      sameSlot &&
      String(existing.installation_id || "") ===
        String(installation_id || "") &&
      normalizeSlot(existing.sim_subscription_id) ===
        normalizeSlot(sim_subscription_id)
    );
  };

  const isSameClientOperation = (existing) =>
    existing.provider === provider &&
    existing.transaction_type === transaction_type &&
    Number(existing.amount) === Number(amount) &&
    String(existing.customer_phone || "") === String(customer_phone || "") &&
    String(existing.customer_name || "") === String(customer_name || "") &&
    String(existing.recipient_phone || "") === String(recipient_phone || "") &&
    String(existing.recipient_name || "") === String(recipient_name || "") &&
    String(existing.biller_code || "") === String(biller_code || "") &&
    String(existing.biller_name || "") === String(biller_name || "") &&
    String(existing.account_number || "") === String(account_number || "") &&
    String(existing.notes || "") === String(notes || "") &&
    Number(existing.fee || 0) === Number(feeValue) &&
    String(existing.payment_reference || "") ===
      String(payment_reference || "") &&
    String(existing.merchant_id || "") === String(merchant_id || "") &&
    isSameSimIdentity(existing);

  try {
    if (client_operation_id) {
      const existingResult = await query(
        `SELECT id, reference, status, created_at,
                provider, transaction_type, amount,
                customer_phone, customer_name,
                recipient_phone, recipient_name,
                biller_code, biller_name, account_number,
                notes, fee, payment_reference, merchant_id,
                sim_iccid, sim_slot,
                installation_id, sim_subscription_id,
                (
                  SELECT json_build_object(
                    'id', ut.id,
                    'ussd_string_pattern', COALESCE(
                      (
                        SELECT auo.ussd_string_pattern
                        FROM agent_ussd_overrides auo
                        WHERE auo.agent_id = transactions.agent_id
                          AND auo.provider = transactions.provider
                          AND auo.transaction_type = transactions.transaction_type
                        LIMIT 1
                      ),
                      ut.ussd_string_pattern
                    ),
                    'pin_prompt_strings', ut.pin_prompt_strings,
                    'success_strings', ut.success_strings,
                    'failure_strings', ut.failure_strings,
                    'timeout_seconds', ut.timeout_seconds,
                    'retry_count', ut.retry_count
                  )
                  FROM ussd_templates ut
                  WHERE ut.provider = transactions.provider
                    AND ut.transaction_type = transactions.transaction_type
                    AND ut.is_active = TRUE
                  LIMIT 1
                ) AS ussd_template
         FROM transactions
         WHERE agent_id = $1
           AND client_operation_id = $2`,
        [agentId, client_operation_id],
      );

      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];

        if (!isSameClientOperation(existing)) {
          return res.status(409).json({
            success: false,
            message:
              "client_operation_id has already been used for a different transaction",
          });
        }

        return res.status(200).json({
          success: true,
          message: "Existing transaction returned for retry.",
          data: {
            transaction_id: existing.id,
            reference: existing.reference,
            status: existing.status,
            created_at: existing.created_at,
            ussd_template: existing.ussd_template || null,
            automation_params: {
              amount: String(existing.amount ?? 0),
              customer_phone: existing.customer_phone || "",
              recipient_phone: existing.recipient_phone || "",
              biller_code: existing.biller_code || "",
              account_number: existing.account_number || "",
              payment_reference: existing.payment_reference || "",
              merchant_id: existing.merchant_id || "",
            },
            idempotent_replay: true,
          },
        });
      }
    }

    // Telecel and AT Money Cash Out are manual-recording operations.
    // They already post their exact SIM e-Float and agent cash effects through
    // /balances/cash-out-manual and must never create a second canonical
    // Cash Out that could duplicate or omit principal ledger movements.
    //
    // This intentionally runs AFTER idempotent replay resolution above so an
    // already-existing historical canonical operation can still replay safely.
    if (
      transaction_type === "cash_out" &&
      (provider === "telecel" || provider === "at_money")
    ) {
      return res.status(422).json({
        success: false,
        code: "CASH_OUT_MANUAL_REQUIRED",
        message:
          "Telecel and AT Money Cash Out must be recorded through the manual Cash Out flow.",
      });
    }

    // Telecel Agent Working Account / Float transfers are Telecel-only.
    //
    // This intentionally runs AFTER idempotent replay resolution so an
    // already-existing historical canonical operation can still replay safely.
    if (
      (transaction_type === "working_to_float" ||
        transaction_type === "float_to_working") &&
      provider !== "telecel"
    ) {
      return res.status(422).json({
        success: false,
        code: "WORKING_FLOAT_TELECEL_ONLY",
        message:
          "Working Account / Float transfers are only supported on Telecel.",
      });
    }

    // Agent Pay to Agent is currently an MTN-only transaction.
    // Telecel and AT Money Agent SIMs do not provide this Agent-mode flow.
    //
    // This intentionally runs AFTER idempotent replay resolution so an
    // already-existing historical canonical operation can still replay safely.
    if (transaction_type === "bill_payment" && provider !== "mtn") {
      return res.status(422).json({
        success: false,
        code: "PAY_TO_AGENT_MTN_ONLY",
        message: "Agent Pay to Agent is only supported on MTN.",
      });
    }

    // Agent Pay to Merchant is currently an MTN-only transaction.
    // Telecel and AT Money Pay to Merchant belong to personal-wallet
    // flows and must not create Agent-mode merchant_payment transactions.
    //
    // This intentionally runs AFTER idempotent replay resolution so an
    // already-existing historical canonical operation can still replay safely.
    if (transaction_type === "merchant_payment" && provider !== "mtn") {
      return res.status(422).json({
        success: false,
        code: "MERCHANT_PAYMENT_MTN_ONLY",
        message: "Agent Pay to Merchant is only supported on MTN.",
      });
    }

    // Every NEW canonical transaction must carry enough SIM identity
    // to target an exact electronic wallet later.
    //
    // This deliberately runs AFTER idempotent replay resolution so an
    // already-existing historical transaction can still replay safely.
    //
    // Identified:
    //   ICCID + observed SIM slot
    //
    // Unresolved:
    //   installation UUID + Android subscription ID + observed SIM slot
    //
    // Provider or slot alone is never an electronic-wallet identity.
    const normalizedRequestedSlot = normalizeSlot(sim_slot);

    const normalizedRequestedSubscriptionId =
      normalizeSlot(sim_subscription_id);

    const normalizedRequestedInstallationId = String(
      installation_id || "",
    ).trim();

    const hasValidRequestedSlot =
      Number.isInteger(normalizedRequestedSlot) && normalizedRequestedSlot >= 0;

    const hasIdentifiedSimIdentity =
      normalizedRequestedIccid.length > 0 && hasValidRequestedSlot;

    const hasUnresolvedSimIdentity =
      normalizedRequestedIccid.length === 0 &&
      normalizedRequestedInstallationId.length > 0 &&
      Number.isInteger(normalizedRequestedSubscriptionId) &&
      normalizedRequestedSubscriptionId >= 0 &&
      hasValidRequestedSlot;

    if (!hasIdentifiedSimIdentity && !hasUnresolvedSimIdentity) {
      return res.status(422).json({
        success: false,
        code: "SIM_IDENTITY_REQUIRED",
        message:
          "A physical SIM ICCID with SIM slot, or complete unresolved SIM identity " +
          "(installation_id, sim_subscription_id, sim_slot), is required",
      });
    }

    // Run independent transaction preflight queries concurrently.
    // These checks do not depend on one another, so awaiting them
    // sequentially only delays the USSD startup response.
    const [flagResult, branchResolution, templateResult, flowResult] =
      await Promise.all([
        query(
          `SELECT value
         FROM system_config
         WHERE key = 'disabled_transaction_types'`,
        ).catch((flagErr) => {
          // Feature flags deliberately fail open. A configuration read
          // problem must not block a genuine transaction.
          logger.error(
            "Feature flag check failed (allowing transaction):",
            flagErr,
          );
          return { rows: [] };
        }),

        resolveAgentFinancialBranch({
          queryFn: query,
          agentId,
          companyId,
        }),

        query(
          `SELECT
           ut.*,
           COALESCE(auo.ussd_string_pattern, ut.ussd_string_pattern)
             AS ussd_string_pattern
         FROM ussd_templates ut
         LEFT JOIN agent_ussd_overrides auo
           ON auo.agent_id = $3
          AND auo.provider = ut.provider
          AND auo.transaction_type = ut.transaction_type
         WHERE ut.provider = $1
           AND ut.transaction_type = $2
           AND ut.is_active = TRUE
           AND $4 = 'agent'`,
          [provider, transaction_type, agentId, businessSimRole],
        ),

        query(
          `SELECT 1
         FROM ussd_flows
         WHERE provider = $1
           AND transaction_type = $2
           AND is_active = TRUE
           AND COALESCE(business_sim_role, 'agent') = $4
           AND (
             (company_id = $3 AND owner_user_id IS NULL)
             OR
             (company_id IS NULL AND owner_user_id IS NULL)
           )
         LIMIT 1`,
          [provider, transaction_type, companyId, businessSimRole],
        ),
      ]);

    if (flagResult.rows.length > 0) {
      try {
        const disabled = JSON.parse(flagResult.rows[0].value);

        if (
          Array.isArray(disabled) &&
          disabled.includes(`${provider}:${transaction_type}`)
        ) {
          return res.status(403).json({
            success: false,
            message:
              "This transaction type has been temporarily disabled by your administrator. Please try again later.",
          });
        }
      } catch (flagParseError) {
        logger.error(
          "Feature flag parse failed (allowing transaction):",
          flagParseError,
        );
      }
    }

    if (!branchResolution.ok) {
      const message =
        branchResolution.code === "NO_ACTIVE_BRANCH"
          ? "You are not currently assigned to an active branch. Contact your business owner or manager."
          : "Your branch assignment is ambiguous. Contact your business owner or manager before processing financial transactions.";

      return res.status(409).json({
        success: false,
        message,
        code: branchResolution.code,
      });
    }

    const branch_id = branchResolution.branchId;

    if (templateResult.rows.length === 0 && flowResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message:
          `No USSD automation configured for ${provider} ` +
          `${transaction_type} (${businessSimRole})`,
      });
    }

    const template = templateResult.rows[0] || null;
    const reference = `APG-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Transfer charge is normalized above so both idempotency comparison
    // and the inserted transaction use exactly the same stored value.

    // Create transaction record. The unique client-operation index is the
    // final concurrency barrier: two simultaneous retries may both pass the
    // lookup above, but only one may create the financial transaction.
    let txResult;

    try {
      txResult = await withTransaction(async (client) => {
        const insertResult = await client.query(
          `INSERT INTO transactions (
          reference, agent_id, branch_id, company_id, provider,
          transaction_type, status, amount, customer_phone, customer_name,
          recipient_phone, recipient_name, biller_code, biller_name,
          account_number, notes, fee, payment_reference, merchant_id,
          sim_iccid, sim_slot, installation_id,
          sim_subscription_id, client_operation_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'initiated',
          $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20, $21, $22, $23
        )
        RETURNING id, reference, status, created_at`,
          [
            reference,
            agentId,
            branch_id,
            companyId,
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
            feeValue,
            payment_reference || "",
            merchant_id || "",
            sim_iccid || null,
            sim_slot ?? null,
            installation_id || null,
            normalizeSlot(sim_subscription_id),
            client_operation_id || null,
          ],
        );

        const transaction = insertResult.rows[0];

        await auditLog({
          userId: agentId,
          companyId,
          action: "TRANSACTION_INITIATED",
          entityType: "transaction",
          entityId: transaction.id,
          newValues: {
            reference,
            provider,
            transaction_type,
            amount,
            customer_phone,
          },
          ipAddress: req.ip,
          requestId: req.requestId,
          dbClient: client,
          strict: true,
        });

        return insertResult;
      });
    } catch (insertError) {
      if (
        client_operation_id &&
        insertError.code === "23505" &&
        insertError.constraint === "idx_transactions_agent_client_operation"
      ) {
        const replayResult = await query(
          `SELECT id, reference, status, created_at,
                  provider, transaction_type, amount,
                  customer_phone, customer_name,
                  recipient_phone, recipient_name,
                  biller_code, biller_name, account_number,
                  notes, fee, payment_reference, merchant_id,
                  sim_iccid, sim_slot,
                installation_id, sim_subscription_id,
                  (
                    SELECT json_build_object(
                      'id', ut.id,
                      'ussd_string_pattern', COALESCE(
                      (
                        SELECT auo.ussd_string_pattern
                        FROM agent_ussd_overrides auo
                        WHERE auo.agent_id = transactions.agent_id
                          AND auo.provider = transactions.provider
                          AND auo.transaction_type = transactions.transaction_type
                        LIMIT 1
                      ),
                      ut.ussd_string_pattern
                    ),
                      'pin_prompt_strings', ut.pin_prompt_strings,
                      'success_strings', ut.success_strings,
                      'failure_strings', ut.failure_strings,
                      'timeout_seconds', ut.timeout_seconds,
                      'retry_count', ut.retry_count
                    )
                    FROM ussd_templates ut
                    WHERE ut.provider = transactions.provider
                      AND ut.transaction_type = transactions.transaction_type
                      AND ut.is_active = TRUE
                    LIMIT 1
                  ) AS ussd_template
           FROM transactions
           WHERE agent_id = $1
             AND client_operation_id = $2`,
          [agentId, client_operation_id],
        );

        if (replayResult.rows.length > 0) {
          const existing = replayResult.rows[0];

          if (!isSameClientOperation(existing)) {
            return res.status(409).json({
              success: false,
              message:
                "client_operation_id has already been used for a different transaction",
            });
          }

          return res.status(200).json({
            success: true,
            message: "Existing transaction returned for concurrent retry.",
            data: {
              transaction_id: existing.id,
              reference: existing.reference,
              status: existing.status,
              created_at: existing.created_at,
              ussd_template: existing.ussd_template || null,
              automation_params: {
                amount: String(existing.amount ?? 0),
                customer_phone: existing.customer_phone || "",
                recipient_phone: existing.recipient_phone || "",
                biller_code: existing.biller_code || "",
                account_number: existing.account_number || "",
                payment_reference: existing.payment_reference || "",
                merchant_id: existing.merchant_id || "",
              },
              idempotent_replay: true,
            },
          });
        }
      }

      throw insertError;
    }

    const transaction = txResult.rows[0];

    // Return transaction details + USSD template for the Flutter app
    // The app will execute USSD automation using this template
    res.status(201).json({
      success: true,
      message: "Transaction initiated. Proceed with USSD execution.",
      data: {
        transaction_id: transaction.id,
        reference: transaction.reference,
        status: transaction.status,
        sim_role: businessSimRole,
        ussd_template: template
          ? {
              id: template.id,
              ussd_string_pattern: template.ussd_string_pattern,
              pin_prompt_strings: template.pin_prompt_strings,
              success_strings: template.success_strings,
              failure_strings: template.failure_strings,
              timeout_seconds: template.timeout_seconds,
              retry_count: template.retry_count,
            }
          : null,
        // Pre-filled values for USSD automation
        automation_params: {
          amount: amount.toString(),
          customer_phone: customer_phone || "",
          recipient_phone: recipient_phone || "",
          biller_code: biller_code || "",
          account_number: account_number || "",
          payment_reference: payment_reference || "",
          merchant_id: merchant_id || "",
        },
      },
    });

    // SIM fingerprinting is a security signal, not a prerequisite for
    // opening the USSD session. Run it after the response so registry
    // reads/writes cannot delay the dial. Errors are handled internally.
    void recordAgentSimUsage({
      agentId,
      companyId,
      provider,
      simIccid: sim_iccid,
      transactionId: transaction.id,
      ipAddress: req.ip,
      requestId: req.requestId,
    });

    return;
  } catch (error) {
    logger.error("Transaction initiation error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to initiate transaction" });
  }
};

// ─── Complete Transaction (called after USSD automation result) ─

exports.completeTransaction = async (req, res) => {
  const { transaction_id } = req.params;
  const {
    status, // 'success' or 'failed'
    network_reference,
    failure_reason,
    ussd_session_log, // USSD trace WITHOUT PIN (flutter removes PIN step log)
  } = req.body;

  const agentId = req.user.id;

  try {
    // CRITICAL: Validate no PIN data in session log before persisting it.
    const sanitizedLog = sanitizeUSSDLog(ussd_session_log);
    const sanitizedFailureReason = sanitizeFailureReason(
      failure_reason,
      status,
    );

    // status is validated by the route as one of: success, failed,
    // pending_confirmation. Do NOT collapse pending_confirmation into
    // failed — money may have moved even when the network response is
    // inconclusive.
    const finalStatus = status;

    let tx = null;
    let transactionNotFound = false;
    let idempotentReplay = false;
    let conflictingStatus = null;
    let manualCashOutRequired = false;

    await withTransaction(async (client) => {
      // Lock the transaction before checking its status. Without this lock,
      // two simultaneous completion requests can both observe "initiated"
      // and both execute financial posting.
      const lockedResult = await client.query(
        `SELECT *
         FROM transactions
         WHERE id = $1
           AND agent_id = $2
         FOR UPDATE`,
        [transaction_id, agentId],
      );

      if (lockedResult.rows.length === 0) {
        transactionNotFound = true;
        return;
      }

      tx = lockedResult.rows[0];

      if (tx.status !== "initiated" && tx.status !== "processing") {
        if (tx.status === finalStatus) {
          idempotentReplay = true;
          return;
        }

        conflictingStatus = tx.status;
        return;
      }

      // Historical Telecel/AT Money canonical Cash Out rows may still exist
      // from before the initiation guard was introduced. They must not be
      // newly completed here because their real principal movement belongs
      // to /balances/cash-out-manual.
      //
      // Already-final rows were handled above so safe same-status replay
      // remains available.
      if (
        tx.transaction_type === "cash_out" &&
        (tx.provider === "telecel" || tx.provider === "at_money")
      ) {
        manualCashOutRequired = true;
        return;
      }

      await client.query(
        `UPDATE transactions SET
          status = $1,
          network_reference = $2,
          failure_reason = $3,
          ussd_session_log = $4,
          completed_at = NOW()
         WHERE id = $5`,
        [
          finalStatus,
          network_reference,
          sanitizedFailureReason,
          JSON.stringify(sanitizedLog),
          transaction_id,
        ],
      );

      // Financial effects happen only after confirmed success. This section
      // is now protected by the transaction-row lock, preventing concurrent
      // duplicate posting.
      if (finalStatus === "success") {
        if (tx.transaction_type === "commission_transfer") {
          // A commission transfer is an internal electronic-wallet movement
          // on one exact physical/unresolved SIM:
          //
          //   commission - amount
          //   e-Float    + amount
          //
          // It is NOT branch treasury float activity and must not itself earn
          // another commission.
          const posting = await postCommissionTransfer(client, tx, agentId);

          // Keep the in-memory transaction consistent for notification/audit
          // payloads before the final DB reload below.
          tx.sim_wallet_id = posting.simWalletId;
        } else if (tx.transaction_type === "cash_in") {
          // Customer Cash In is an exchange on the exact selected SIM:
          //
          //   e-Float      - amount
          //   cash drawer  + amount
          //
          // Principal balances post first. Earned commission remains a
          // separate movement on the same exact SIM wallet.
          const posting = await postCashIn(client, tx, agentId);

          // Keep notification/audit payloads consistent before final reload.
          tx.sim_wallet_id = posting.simWalletId;

          await calculateAndPostCommission(client, tx, agentId);
        } else if (
          tx.transaction_type === "cash_out" &&
          tx.provider === "mtn"
        ) {
          // Canonical MTN customer Cash Out:
          //
          //   e-Float      + amount
          //   cash drawer  - amount
          //
          // Telecel and AT Money Cash Out never enter this branch;
          // they use the separate /balances/cash-out-manual path.
          const posting = await postCashOut(client, tx, agentId);

          tx.sim_wallet_id = posting.simWalletId;

          await calculateAndPostCommission(client, tx, agentId);
        } else if (tx.transaction_type === "send_money") {
          // Agent SIM Send Money for MTN, Telecel and AT Money:
          //
          //   exact SIM e-Float  - amount
          //   cash drawer        + amount
          //
          // Principal balances post first. Earned commission remains
          // a separate movement on the same exact SIM wallet.
          //
          // tx.fee remains recorded network-charge metadata only and
          // does not create an invented cash/e-Float movement.
          const posting = await postSendMoney(client, tx, agentId);

          tx.sim_wallet_id = posting.simWalletId;

          await calculateAndPostCommission(client, tx, agentId);
        } else if (tx.transaction_type === "airtime") {
          // Agent Airtime sale for MTN, Telecel and AT Money:
          //
          //   exact SIM e-Float  - amount
          //   cash drawer        + amount
          //
          // Principal accounting posts first. Earned commission remains
          // a separate movement on the same exact SIM wallet.
          const posting = await postAirtime(client, tx, agentId);

          tx.sim_wallet_id = posting.simWalletId;

          await calculateAndPostCommission(client, tx, agentId);
        } else if (tx.transaction_type === "data_bundle") {
          // Agent Data Bundle sale for MTN and Telecel:
          //
          //   exact SIM e-Float  - amount
          //   cash drawer        + amount
          //
          // Principal accounting posts first. Earned commission remains
          // a separate movement on the same exact SIM wallet.
          const posting = await postDataBundle(client, tx, agentId);

          tx.sim_wallet_id = posting.simWalletId;

          await calculateAndPostCommission(client, tx, agentId);
        } else if (
          tx.transaction_type === "working_to_float" ||
          tx.transaction_type === "float_to_working"
        ) {
          // Telecel Agent Move Money reallocates electronic value
          // between two balances on the same exact SIM:
          //
          // Working -> Float:
          //   working_balance  - amount
          //   e-Float          + amount
          //
          // Float -> Working:
          //   e-Float          - amount
          //   working_balance  + amount
          //
          // No cash, commission, or branch treasury movement.
          const posting = await postWorkingFloatTransfer(client, tx, agentId);

          tx.sim_wallet_id = posting.simWalletId;
        } else if (tx.transaction_type === "bill_payment") {
          // MTN Pay to Agent converts e-cash into physical cash:
          //
          //   exact SIM e-Float  - amount
          //   cash drawer        + amount
          //   earned commission  none
          //
          // Branch treasury is not involved.
          const posting = await postPayToAgent(client, tx, agentId);

          tx.sim_wallet_id = posting.simWalletId;
        } else if (tx.transaction_type === "merchant_payment") {
          // MTN Pay to Merchant is a business expense:
          //
          //   exact SIM e-Float  - amount
          //   cash drawer        no movement
          //   earned commission  none
          //
          // The merchant_payment transaction itself is the expense
          // source record. Branch treasury is not involved.
          const posting = await postMerchantPayment(client, tx, agentId);

          tx.sim_wallet_id = posting.simWalletId;
        } else {
          // These transaction types have not yet had their principal
          // e-Float/cash semantics migrated. Do not invent movements.
          await calculateAndPostCommission(client, tx, agentId);
        }

        // tx.fee is captured before the USSD transaction as network-charge
        // metadata. The app does not currently observe a structured final fee
        // or resulting wallet balance, so it must not invent a cash/e-float
        // movement from this value. Statement/SMS reconciliation can confirm
        // the real provider debit later.
      }

      // This is a required financial audit record. It must use the exact
      // PostgreSQL client that owns the transaction above. If this INSERT
      // fails, strict mode rethrows and withTransaction rolls back the
      // transaction status plus every principal/commission ledger mutation.
      await auditLog({
        userId: agentId,
        companyId: tx.company_id,
        action: `TRANSACTION_${finalStatus.toUpperCase()}`,
        entityType: "transaction",
        entityId: transaction_id,
        newValues: {
          status: finalStatus,
          network_reference,
          failure_reason: sanitizedFailureReason,
        },
        ipAddress: req.ip,
        requestId: req.requestId,
        dbClient: client,
        strict: true,
      });

      const notificationType = {
        success: "transaction_success",
        failed: "transaction_failed",
        pending_confirmation: "transaction_pending_confirmation",
      }[finalStatus];

      // Persist the completion notification intent on the same PostgreSQL
      // transaction as the financial posting and strict audit. If this
      // enqueue fails, withTransaction rolls everything back together.
      //
      // Keep the payload deliberately minimal. Never place PINs, resolved
      // USSD content, session logs, credentials, or raw provider responses
      // into the durable outbox.
      await enqueueOutboxEvent({
        dbClient: client,
        eventType: "notification.transaction.completed",
        aggregateType: "transaction",
        aggregateId: transaction_id,
        dedupeKey: `transaction:${transaction_id}:completion:${finalStatus}`,
        payload: {
          agent_id: agentId,
          type: notificationType,
          transaction: {
            id: tx.id,
            amount: tx.amount,
            transaction_type: tx.transaction_type,
            reference: tx.reference,
            failure_reason: sanitizedFailureReason,
          },
        },
      });
    });

    if (transactionNotFound) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    if (idempotentReplay) {
      return res.json({
        success: true,
        message: `Transaction already ${tx.status}`,
        data: {
          ...tx,
          idempotent_replay: true,
        },
      });
    }

    if (conflictingStatus) {
      return res.status(409).json({
        success: false,
        message: `Transaction already ${conflictingStatus}; cannot change completion to ${finalStatus}`,
      });
    }

    if (manualCashOutRequired) {
      return res.status(422).json({
        success: false,
        code: "CASH_OUT_MANUAL_REQUIRED",
        message:
          "Telecel and AT Money Cash Out must be recorded through the manual Cash Out flow.",
      });
    }

    // Generate receipt PDF only on confirmed success
    let receiptUrl = null;
    if (finalStatus === "success") {
      const updatedTx = await query(
        "SELECT * FROM transactions WHERE id = $1",
        [transaction_id],
      );
      receiptUrl = await generateTransactionReceipt(updatedTx.rows[0]);

      if (receiptUrl) {
        await query("UPDATE transactions SET receipt_url = $1 WHERE id = $2", [
          receiptUrl,
          transaction_id,
        ]);
      }
    }

    const finalTx = await query("SELECT * FROM transactions WHERE id = $1", [
      transaction_id,
    ]);

    const messages = {
      success: "Transaction completed successfully",
      failed: "Transaction failed",
      pending_confirmation:
        "Transaction outcome could not be confirmed. Please verify manually before retrying.",
    };

    res.json({
      success: true,
      message: messages[finalStatus],
      data: {
        ...finalTx.rows[0],
        receipt_url: receiptUrl,
      },
    });
  } catch (error) {
    logger.error("Transaction completion error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to complete transaction" });
  }
};

// ─── Get Transaction ──────────────────────────────────────────

exports.getTransaction = async (req, res) => {
  const { transaction_id } = req.params;

  try {
    let whereClause = "WHERE t.id = $1";
    const params = [transaction_id];

    // Scope access by role. Managers only see transactions from
    // branches they actually manage - without this they'd see every
    // company transaction, same class of gap already fixed for
    // listUsers and listBranches.
    if (req.user.role === "agent") {
      whereClause += " AND t.agent_id = $2";
      params.push(req.user.id);
    } else if (req.user.role === "manager") {
      whereClause +=
        " AND t.branch_id IN (SELECT branch_id FROM branch_managers WHERE manager_id = $2)";
      params.push(req.user.id);
    } else if (["business_owner", "auditor"].includes(req.user.role)) {
      whereClause += " AND t.company_id = $2";
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
      params,
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error("Get transaction error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch transaction" });
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
    sim_iccid,
    sort_by = "date",
    sort_order = "desc",
  } = req.query;

  const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
  const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  // Strict allowlist mapping a client-facing sort key to a safe SQL
  // column expression - never interpolate the raw sort_by value
  // directly into ORDER BY, which would be a SQL injection surface.
  const SORT_COLUMNS = {
    date: "t.created_at",
    amount: "t.amount",
    commission: "cm.net_commission",
    fee: "t.fee",
    provider: "t.provider",
  };
  const sortColumn = SORT_COLUMNS[sort_by] || SORT_COLUMNS.date;
  const sortDirection = sort_order === "asc" ? "ASC" : "DESC";

  try {
    const offset = (parsedPage - 1) * parsedLimit;
    const conditions = [];
    const params = [];
    let paramIdx = 1;

    // Role-based scoping. Managers only see transactions from branches
    // they actually manage - without this they'd see every company
    // transaction, same class of gap already fixed for listUsers and
    // listBranches.
    if (req.user.role === "agent") {
      conditions.push(`t.agent_id = $${paramIdx++}`);
      params.push(req.user.id);
    } else if (req.user.role === "manager") {
      conditions.push(
        `t.branch_id IN (SELECT branch_id FROM branch_managers WHERE manager_id = $${paramIdx++})`,
      );
      params.push(req.user.id);
    } else if (["business_owner", "auditor"].includes(req.user.role)) {
      conditions.push(`t.company_id = $${paramIdx++}`);
      params.push(req.user.company_id);
    }

    if (provider) {
      conditions.push(`t.provider = $${paramIdx++}`);
      params.push(provider);
    }
    if (transaction_type) {
      conditions.push(`t.transaction_type = $${paramIdx++}`);
      params.push(transaction_type);
    }
    if (status) {
      conditions.push(`t.status = $${paramIdx++}`);
      params.push(status);
    }
    if (branch_id) {
      conditions.push(`t.branch_id = $${paramIdx++}`);
      params.push(branch_id);
    }
    if (agent_id && req.user.role !== "agent") {
      conditions.push(`t.agent_id = $${paramIdx++}`);
      params.push(agent_id);
    }
    if (customer_phone) {
      conditions.push(`t.customer_phone = $${paramIdx++}`);
      params.push(customer_phone);
    }
    if (sim_iccid) {
      conditions.push(`t.sim_iccid = $${paramIdx++}`);
      params.push(sim_iccid);
    }
    if (from_date) {
      conditions.push(`t.created_at >= $${paramIdx++}`);
      params.push(from_date);
    }
    if (to_date) {
      conditions.push(`t.created_at <= $${paramIdx++}`);
      params.push(to_date);
    }
    if (search) {
      conditions.push(
        `(t.reference ILIKE $${paramIdx} OR t.customer_phone ILIKE $${paramIdx} OR t.customer_name ILIKE $${paramIdx})`,
      );
      params.push(`%${search}%`);
      paramIdx++;
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const [dataResult, countResult] = await Promise.all([
      query(
        `SELECT t.id, t.reference, t.provider, t.transaction_type, t.status,
                t.amount, t.fee, t.customer_phone, t.customer_name,
                t.sim_iccid,
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
        [...params, parsedLimit, offset],
      ),
      query(`SELECT COUNT(*) FROM transactions t ${whereClause}`, params),
    ]);

    const total = parseInt(countResult.rows[0].count);

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
    logger.error("List transactions error:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch transactions" });
  }
};

// ─── Helper: Calculate and Record Commission ──────────────────

// ─── Helper: Sanitize transaction failure reasons ─────────────
//
// failure_reason comes from a mobile client, so it must never be trusted as
// arbitrary text. Older builds could include raw provider responses or
// exception strings containing phone numbers, balances, account details,
// dial strings, or device internals.
//
// Keep only stable diagnostic categories generated by AgentPro itself.
// Anything unknown is reduced to a generic status-appropriate message rather
// than copied into transactions, notifications, or audit logs.
function sanitizeFailureReason(reason, status) {
  if (status === "success") return null;

  const raw = typeof reason === "string" ? reason.trim() : "";
  const normalized = raw.toLowerCase();

  if (!raw) {
    return status === "pending_confirmation"
      ? "The transaction outcome could not be confirmed."
      : "The transaction failed.";
  }

  if (
    normalized.includes(
      "no final network result was received after pin entry",
    ) ||
    normalized.includes("could not confirm the outcome after pin entry")
  ) {
    return "The transaction outcome could not be confirmed after PIN entry.";
  }

  if (normalized.includes("network returned an unrecognized response")) {
    return "The network returned an unrecognized transaction result.";
  }

  if (
    normalized.includes("no response received from the network") ||
    normalized.includes("no response received from the ussd session")
  ) {
    return "No response was received from the network.";
  }

  if (normalized.includes("network reported that the transaction failed")) {
    return "The network reported that the transaction failed.";
  }

  if (normalized.includes("manually confirmed as failed")) {
    return "Manually confirmed as failed by the user.";
  }

  if (normalized.includes("ussd template is misconfigured")) {
    return "USSD automation is not configured correctly for this transaction.";
  }

  if (
    normalized.includes("no ussd automation is configured") ||
    normalized.includes("no ussd flow configured")
  ) {
    return "No USSD automation is configured for this transaction.";
  }

  if (
    normalized.includes("accessibility permission is required") ||
    normalized.includes("accessibility service is not enabled")
  ) {
    return "Accessibility permission is required for USSD automation.";
  }

  if (
    normalized.includes("sim") &&
    (normalized.includes("required") ||
      normalized.includes("unavailable") ||
      normalized.includes("not found") ||
      normalized.includes("could not"))
  ) {
    return "The required SIM could not be prepared for this transaction.";
  }

  if (status === "pending_confirmation") {
    return "The transaction outcome could not be confirmed.";
  }

  return "The transaction failed due to an automation error.";
}

// ─── Helper: Sanitize USSD Log ────────────────────────────────
//
// Persist diagnostic metadata only. Never persist resolved USSD strings,
// raw provider responses, transaction inputs, or client-supplied notes.
// PIN markers are replaced with fixed server-owned placeholders.
//
function sanitizeUSSDLog(log) {
  if (!log) return null;
  if (!Array.isArray(log)) return null;

  return log.map((step) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      return { type: "invalid_log_entry" };
    }

    // Keep only non-sensitive diagnostic metadata. Older mobile clients
    // could send:
    //   dialed   - fully resolved USSD strings containing customer data
    //   response - raw provider text containing balances/account details
    //   input/value/note - legacy step payloads
    //
    // Those fields are deliberately not copied into persisted storage.
    const sanitized = {};

    if (typeof step.type === "string" && step.type.trim()) {
      sanitized.type = step.type.trim();
    } else {
      sanitized.type = "unknown";
    }

    if (typeof step.timestamp === "string" && step.timestamp.trim()) {
      sanitized.timestamp = step.timestamp;
    }

    // Preserve only a fixed PIN marker, never data supplied by the client.
    if (step.type === "pin_prompt_seen") {
      sanitized.response = "[PIN ENTRY — NOT LOGGED, NOT APP-VISIBLE]";
    } else if (step.is_pin_step || step.type === "pin") {
      sanitized.note = "[PIN ENTRY - NOT LOGGED]";
    }

    return sanitized;
  });
}

// Exported for direct unit testing (see tests/unit/commission.test.js) —
// this ensures the test always verifies the real implementation, not a
// hand-copied duplicate that could silently drift out of sync with it.
module.exports.sanitizeUSSDLog = sanitizeUSSDLog;
module.exports.sanitizeFailureReason = sanitizeFailureReason;
