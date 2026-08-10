const {
  getOrCreateAgentSimWallet
} = require("./agentWalletService");

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error("Invalid monetary value");
  }

  return Math.round((number + Number.EPSILON) * 100) / 100;
}

// Posts the agent-side accounting effect of a confirmed MTN
// Pay to Merchant business expense.
//
// Exact selected MTN SIM wallet:
//   e-Float  - amount
//
// Cash drawer:
//   no movement
//
// Earned commission:
//   none
//
// The successful merchant_payment transaction itself remains the
// expense source record, including merchant ID, reference and amount.
//
// A negative exact-SIM e-Float balance is intentionally allowed.
// Historic provider-level balance may still live in legacy_unassigned,
// and new physical-SIM activity must never silently steal that balance.
async function postMerchantPayment(
  client,
  transaction,
  agentId
) {
  if (!transaction) {
    throw new Error(
      "Transaction is required for Merchant Payment posting"
    );
  }

  if (transaction.transaction_type !== "merchant_payment") {
    throw new Error(
      "postMerchantPayment can only post merchant_payment transactions"
    );
  }

  if (!agentId) {
    throw new Error(
      "agentId is required for Merchant Payment posting"
    );
  }

  if (transaction.provider !== "mtn") {
    throw new Error(
      "Merchant Payment posting is only supported for MTN"
    );
  }

  const amount = money(transaction.amount);

  if (amount <= 0) {
    throw new Error(
      "Merchant Payment amount must be positive"
    );
  }

  // This expense touches only the exact selected SIM wallet.
  // There is deliberately no cash-drawer lock.
  const simWallet =
    await getOrCreateAgentSimWallet(
      client,
      {
        agentId,
        provider: transaction.provider,
        simIccid: transaction.sim_iccid,
        installationId:
          transaction.installation_id,
        simSubscriptionId:
          transaction.sim_subscription_id,
        simSlot: transaction.sim_slot
      }
    );

  // A transaction already linked by migration/backfill must agree
  // with the exact wallet resolved from its stored SIM identity.
  if (
    transaction.sim_wallet_id &&
    transaction.sim_wallet_id !== simWallet.id
  ) {
    throw new Error(
      "Merchant Payment transaction SIM wallet does not match its stored SIM identity"
    );
  }

  const transactionWalletLink =
    await client.query(
      `UPDATE transactions
       SET sim_wallet_id = $1
       WHERE id = $2
         AND agent_id = $3
         AND provider = $4
         AND (
           sim_wallet_id IS NULL
           OR sim_wallet_id = $1
         )
       RETURNING id`,
      [
        simWallet.id,
        transaction.id,
        agentId,
        transaction.provider
      ]
    );

  if (transactionWalletLink.rows.length !== 1) {
    throw new Error(
      "Unable to link Merchant Payment transaction to SIM wallet"
    );
  }

  const eFloatBefore =
    money(simWallet.e_float_balance);

  const eFloatAfter =
    money(eFloatBefore - amount);

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
        transaction.provider
      ]
    );

  if (walletUpdate.rows.length !== 1) {
    throw new Error(
      "Unable to update Merchant Payment SIM wallet"
    );
  }

  const normalizedIccid =
    String(transaction.sim_iccid || "").trim();

  const simProvenanceStatus =
    normalizedIccid
      ? "identified"
      : "unresolved";

  const reference =
    transaction.reference || null;

  const notes =
    transaction.notes || null;

  const installationId =
    transaction.installation_id || null;

  const simSubscriptionId =
    transaction.sim_subscription_id === undefined
      ? null
      : transaction.sim_subscription_id;

  const simSlot =
    transaction.sim_slot === undefined
      ? null
      : transaction.sim_slot;

  // Business expense: e-Float leaves this exact MTN SIM wallet.
  // There is intentionally no cash movement.
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
       'merchant_payment',
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
      transaction.provider,
      -amount,
      eFloatBefore,
      eFloatAfter,
      reference,
      notes,
      transaction.id,
      simWallet.id,
      normalizedIccid || null,
      installationId,
      simSubscriptionId,
      simSlot,
      simProvenanceStatus
    ]
  );

  return {
    simWalletId: simWallet.id,
    amount,
    eFloatBefore,
    eFloatAfter,
    simProvenanceStatus
  };
}

module.exports = {
  postMerchantPayment
};
