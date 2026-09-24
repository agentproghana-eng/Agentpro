const {
  resolveExistingTelecelMerchantWallet,
} = require("./telecelMerchantObservationWalletService");

function readinessError(message, code) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  return error;
}

const REQUIRED_BALANCE_CODES = Object.freeze([
  "merchant_account",
  "working_account",
]);

/**
 * Fail-closed pre-USSD readiness check for Telecel Merchant E-Cash.
 *
 * This check is deliberately lookup-only:
 * - it never creates a wallet;
 * - it never creates a balance account;
 * - it never initializes a balance;
 * - it never changes financial state.
 *
 * Both balances must already have trusted reconciliation provenance before
 * AgentPro permits a provider transfer that would later require ledger posting.
 */
async function requireTelecelMerchantECashReadiness(
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

  const simWallet =
    await resolveExistingTelecelMerchantWallet(client, {
      agentId,
      simIccid,
      installationId,
      simSubscriptionId,
      simSlot,
    });

  const accounts = await client.query(
    `SELECT
       id,
       balance_code,
       balance_state,
       balance_source,
       balance_observed_at,
       balance_initialized_at
     FROM sim_wallet_balance_accounts
     WHERE sim_wallet_id = $1
       AND balance_code = ANY($2::text[])
     FOR UPDATE`,
    [simWallet.id, REQUIRED_BALANCE_CODES],
  );

  if (accounts.rows.length !== REQUIRED_BALANCE_CODES.length) {
    throw readinessError(
      "Telecel Merchant balances must be initialized before Transfer E-Cash can start",
      "MERCHANT_BALANCE_INITIALIZATION_REQUIRED",
    );
  }

  const byCode = Object.fromEntries(
    accounts.rows.map((row) => [row.balance_code, row]),
  );

  for (const balanceCode of REQUIRED_BALANCE_CODES) {
    const account = byCode[balanceCode];

    if (
      !account ||
      account.balance_state !== "known" ||
      !account.balance_source ||
      !account.balance_observed_at ||
      !account.balance_initialized_at
    ) {
      throw readinessError(
        "Telecel Merchant balances must be initialized before Transfer E-Cash can start",
        "MERCHANT_BALANCE_INITIALIZATION_REQUIRED",
      );
    }
  }

  return {
    simWallet,
    merchantAccount: byCode.merchant_account,
    workingAccount: byCode.working_account,
  };
}

module.exports = {
  requireTelecelMerchantECashReadiness,
};
