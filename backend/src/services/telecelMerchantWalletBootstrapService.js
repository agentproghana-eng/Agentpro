const {
  getOrCreateTelecelMerchantWallet,
} = require("./telecelMerchantWalletService");

function bootstrapError(message, code) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  return error;
}

/*
 * Trusted setup boundary for Telecel Merchant accounting.
 *
 * This creates only:
 *   - the role-scoped physical SIM wallet
 *   - Merchant Account container
 *   - Working Account container
 *
 * It MUST NOT initialize, infer, copy or fabricate provider balances.
 * Actual balances become known only through the reconciliation boundary.
 */
async function bootstrapTelecelMerchantWallet(
  client,
  {
    agentId,
    simIccid,
    installationId,
    simSubscriptionId,
    simSlot,
  },
) {
  const result =
    await getOrCreateTelecelMerchantWallet(
      client,
      {
        agentId,
        simIccid,
        installationId,
        simSubscriptionId,
        simSlot,
      },
    );

  for (const account of [
    result.merchantAccount,
    result.workingAccount,
  ]) {
    /*
     * Existing known accounts are valid and must never be reset.
     * Newly-created structural accounts must remain unknown.
     */
    if (
      account.balance_state !== undefined &&
      !["unknown", "known"].includes(
        account.balance_state,
      )
    ) {
      throw bootstrapError(
        "Telecel Merchant balance account has invalid provenance state",
        "MERCHANT_BALANCE_STATE_INVALID",
      );
    }
  }

  return result;
}

module.exports = {
  bootstrapTelecelMerchantWallet,
};
