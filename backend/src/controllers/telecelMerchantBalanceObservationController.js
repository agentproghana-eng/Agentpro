const {
  withTransaction,
} = require("../config/database");

const {
  verifyBusinessSimRoleAssignment,
} = require("../services/simRoleTrustService");

const {
  resolveExistingTelecelMerchantWallet,
} = require(
  "../services/telecelMerchantObservationWalletService"
);

const {
  reconcileTelecelMerchantBalances,
} = require(
  "../services/telecelMerchantBalanceReconciliationService"
);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeInteger(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const normalized = Number(value);

  return Number.isInteger(normalized) &&
    normalized >= 0
    ? normalized
    : null;
}

exports.ingestBalanceObservation = async (
  req,
  res,
  next,
) => {
  try {
    const agentId = req.user.id;
    const companyId =
      req.user.company_id || null;

    const {
      source_reference,
      observed_at,
      merchant_account_balance,
      working_account_balance,
      sim_iccid,
      installation_id,
      sim_subscription_id,
      sim_slot,
    } = req.body;

    const normalizedIccid =
      normalizeText(sim_iccid);

    const normalizedInstallationId =
      normalizeText(installation_id);

    const normalizedSubscriptionId =
      normalizeInteger(sim_subscription_id);

    const normalizedSlot =
      normalizeInteger(sim_slot);

    const identified =
      normalizedIccid.length > 0 &&
      normalizedSlot !== null;

    const unresolved =
      normalizedIccid.length === 0 &&
      normalizedInstallationId.length > 0 &&
      normalizedSubscriptionId !== null &&
      normalizedSlot !== null;

    if (!identified && !unresolved) {
      return res.status(422).json({
        success: false,
        code: "SIM_IDENTITY_REQUIRED",
        message:
          "A physical SIM ICCID with SIM slot, or complete unresolved SIM identity " +
          "(installation_id, sim_subscription_id, sim_slot), is required",
      });
    }

    /*
     * Reuse AgentPro's existing Business SIM trust boundary before
     * touching any financial wallet or balance.
     */
    const roleVerification =
      await verifyBusinessSimRoleAssignment({
        userId: agentId,
        provider: "telecel",
        claimedRole: "merchant",
        simSlot: normalizedSlot,
        simIccid: normalizedIccid || null,
        installationId:
          normalizedInstallationId || null,
        simSubscriptionId:
          normalizedSubscriptionId,
      });

    if (roleVerification.ok === false) {
      return res
        .status(roleVerification.status)
        .json({
          success: false,
          code: roleVerification.code,
          message: roleVerification.message,
        });
    }

    const result = await withTransaction(
      async (client) => {
        /*
         * Observation ingestion is lookup-only for wallet identity.
         * It must never create a Merchant wallet from client input.
         */
        const wallet =
          await resolveExistingTelecelMerchantWallet(
            client,
            {
              agentId,
              simIccid:
                normalizedIccid || null,
              installationId:
                normalizedInstallationId || null,
              simSubscriptionId:
                normalizedSubscriptionId,
              simSlot: normalizedSlot,
            },
          );

        return reconcileTelecelMerchantBalances(
          client,
          {
            simWalletId: wallet.id,
            agentId,
            companyId,
            merchantAccountBalance:
              merchant_account_balance,
            workingAccountBalance:
              working_account_balance,
            source: "telecel_balance_sms",
            sourceReference:
              normalizeText(source_reference),
            observedAt: observed_at,
            ipAddress: req.ip,
            requestId:
              req.requestId || null,
          },
        );
      },
    );

    return res.status(200).json({
      success: true,
      data: {
        observation_id:
          result.observationId,
        idempotent_replay:
          result.idempotentReplay === true,
      },
    });
  } catch (error) {
    if (error?.statusCode) {
      return res
        .status(error.statusCode)
        .json({
          success: false,
          code: error.code,
          message: error.message,
        });
    }

    return next(error);
  }
};
