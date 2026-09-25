function accountingError(message, code) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  return error;
}

function normalizeOptionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeOptionalNonNegativeInteger(value, fieldName) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = Number(value);

  if (!Number.isInteger(normalized) || normalized < 0) {
    throw accountingError(
      `${fieldName} must be a non-negative integer`,
      "SIM_IDENTITY_INVALID",
    );
  }

  return normalized;
}

async function requireTelecelMerchantOutgoingReadiness(
  client,
  {
    agentId,
    amount,
    simIccid,
    installationId,
    simSubscriptionId,
    simSlot,
  },
) {
  const normalizedAmount = Number(amount);

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw accountingError(
      "Transaction amount must be greater than zero",
      "INVALID_TRANSACTION_AMOUNT",
    );
  }

  const normalizedIccid = normalizeOptionalText(simIccid);
  const normalizedInstallationId =
    normalizeOptionalText(installationId);
  const normalizedSubscriptionId =
    normalizeOptionalNonNegativeInteger(
      simSubscriptionId,
      "sim_subscription_id",
    );
  const normalizedSlot =
    normalizeOptionalNonNegativeInteger(
      simSlot,
      "sim_slot",
    );

  let result;

  if (normalizedIccid) {
    result = await client.query(
      `SELECT
         swa.current_balance,
         swa.balance_state,
         swa.balance_source,
         swa.balance_observed_at,
         swa.balance_initialized_at
       FROM agent_sim_wallets sw
       JOIN sim_wallet_balance_accounts swa
         ON swa.sim_wallet_id = sw.id
       WHERE sw.agent_id = $1
         AND sw.provider = 'telecel'
         AND sw.sim_role = 'merchant'
         AND sw.identity_status = 'identified'
         AND sw.sim_iccid = $2
         AND swa.balance_code = 'working_account'
       LIMIT 1`,
      [agentId, normalizedIccid],
    );
  } else {
    if (
      !normalizedInstallationId ||
      normalizedSubscriptionId === null ||
      normalizedSlot === null
    ) {
      throw accountingError(
        "A physical SIM ICCID or complete unresolved SIM identity is required for Telecel Merchant accounting",
        "SIM_IDENTITY_REQUIRED",
      );
    }

    result = await client.query(
      `SELECT
         swa.current_balance,
         swa.balance_state,
         swa.balance_source,
         swa.balance_observed_at,
         swa.balance_initialized_at
       FROM agent_sim_wallets sw
       JOIN sim_wallet_balance_accounts swa
         ON swa.sim_wallet_id = sw.id
       WHERE sw.agent_id = $1
         AND sw.provider = 'telecel'
         AND sw.sim_role = 'merchant'
         AND sw.identity_status = 'unresolved'
         AND sw.installation_id = $2
         AND sw.sim_subscription_id = $3
         AND sw.last_known_sim_slot = $4
         AND swa.balance_code = 'working_account'
       LIMIT 1`,
      [
        agentId,
        normalizedInstallationId,
        normalizedSubscriptionId,
        normalizedSlot,
      ],
    );
  }

  if (result.rows.length !== 1) {
    throw accountingError(
      "Telecel Merchant Working Account balance must be initialized before this payment can start",
      "MERCHANT_WORKING_BALANCE_INITIALIZATION_REQUIRED",
    );
  }

  const account = result.rows[0];

  if (
    account.balance_state !== "known" ||
    !account.balance_source ||
    !account.balance_observed_at ||
    !account.balance_initialized_at
  ) {
    throw accountingError(
      "Telecel Merchant Working Account balance must be initialized before this payment can start",
      "MERCHANT_WORKING_BALANCE_INITIALIZATION_REQUIRED",
    );
  }

  if (Number(account.current_balance) < normalizedAmount) {
    throw accountingError(
      "Insufficient Telecel Merchant Working Account balance",
      "INSUFFICIENT_MERCHANT_WORKING_BALANCE",
    );
  }

  return {
    workingAccountBalance: Number(account.current_balance),
  };
}

module.exports = {
  requireTelecelMerchantOutgoingReadiness,
};
