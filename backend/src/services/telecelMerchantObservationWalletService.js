function observationError(message, code) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  return error;
}

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

/**
 * Resolve an EXISTING Telecel Merchant wallet for a trusted balance
 * observation.
 *
 * This service deliberately never creates a wallet or balance account.
 * SMS observations may reconcile known financial identities; they may not
 * provision new financial identities.
 */
async function resolveExistingTelecelMerchantWallet(
  client,
  {
    agentId,
    simIccid = null,
    installationId = null,
    simSubscriptionId = null,
    simSlot = null,
  },
) {
  if (!client || typeof client.query !== "function") {
    throw new Error("transaction client is required");
  }

  const normalizedAgentId = normalizeText(agentId);
  const normalizedIccid = normalizeText(simIccid);
  const normalizedInstallationId =
    normalizeText(installationId);
  const normalizedSubscriptionId =
    normalizeInteger(simSubscriptionId);
  const normalizedSlot = normalizeInteger(simSlot);

  if (!normalizedAgentId) {
    throw observationError(
      "Authenticated user is required",
      "MERCHANT_BALANCE_WALLET_INVALID",
    );
  }

  const identified =
    normalizedIccid.length > 0 &&
    normalizedSlot !== null;

  const unresolved =
    normalizedIccid.length === 0 &&
    normalizedInstallationId.length > 0 &&
    normalizedSubscriptionId !== null &&
    normalizedSlot !== null;

  if (!identified && !unresolved) {
    throw observationError(
      "Exact Telecel Merchant SIM identity is required",
      "SIM_IDENTITY_REQUIRED",
    );
  }

  let result;

  if (identified) {
    result = await client.query(
      `SELECT *
         FROM agent_sim_wallets
        WHERE agent_id = $1
          AND provider = 'telecel'
          AND sim_role = 'merchant'
          AND identity_status = 'identified'
          AND sim_iccid = $2
          AND last_known_sim_slot = $3
        FOR UPDATE`,
      [
        normalizedAgentId,
        normalizedIccid,
        normalizedSlot,
      ],
    );
  } else {
    result = await client.query(
      `SELECT *
         FROM agent_sim_wallets
        WHERE agent_id = $1
          AND provider = 'telecel'
          AND sim_role = 'merchant'
          AND identity_status = 'unresolved'
          AND installation_id = $2
          AND sim_subscription_id = $3
          AND last_known_sim_slot = $4
        FOR UPDATE`,
      [
        normalizedAgentId,
        normalizedInstallationId,
        normalizedSubscriptionId,
        normalizedSlot,
      ],
    );
  }

  if (result.rows.length !== 1) {
    throw observationError(
      "Exact existing Telecel Merchant SIM wallet was not found",
      "MERCHANT_BALANCE_WALLET_INVALID",
    );
  }

  return result.rows[0];
}

module.exports = {
  resolveExistingTelecelMerchantWallet,
};
