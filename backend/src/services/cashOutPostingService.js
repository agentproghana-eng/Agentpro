const {
  getOrCreateAgentCashBalance,
  getOrCreateAgentSimWallet
} = require("./agentWalletService");

function money(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error("Invalid monetary value");
  }

  return Math.round((number + Number.EPSILON) * 100) / 100;
}

// Posts the agent-side accounting effect of a confirmed canonical MTN Cash Out.
//
// Exact selected MTN SIM wallet:
//   e-Float       + amount
//
// Single physical cash drawer:
//   cash at hand  - amount
//
// Telecel and AT Money Cash Out use /balances/cash-out-manual instead and
// must never enter this posting service.
//
// Earned commission is posted separately.
async function postCashOut(
  client,
  transaction,
  agentId
) {
  if (!transaction) {
    throw new Error(
      "Transaction is required for Cash Out posting"
    );
  }

  if (transaction.transaction_type !== "cash_out") {
    throw new Error(
      "postCashOut can only post cash_out transactions"
    );
  }

  if (!agentId) {
    throw new Error(
      "agentId is required for Cash Out posting"
    );
  }

  // Canonical Cash Out is currently MTN only.
  // Telecel/AT Money have a separate already-posting manual path.
  if (transaction.provider !== "mtn") {
    throw new Error(
      "Canonical Cash Out posting is only supported for MTN"
    );
  }

  const amount = money(transaction.amount);

  if (amount <= 0) {
    throw new Error(
      "Cash Out amount must be positive"
    );
  }

  // Keep one global lock order for principal cash/electronic exchanges:
  // exact SIM wallet first, then the agent's single cash drawer.
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

  const cashBalance =
    await getOrCreateAgentCashBalance(
      client,
      agentId
    );

  if (
    transaction.sim_wallet_id &&
    transaction.sim_wallet_id !== simWallet.id
  ) {
    throw new Error(
      "Cash Out transaction SIM wallet does not match its stored SIM identity"
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
      "Unable to link Cash Out transaction to SIM wallet"
    );
  }

  const eFloatBefore =
    money(simWallet.e_float_balance);

  const eFloatAfter =
    money(eFloatBefore + amount);

  const cashBefore =
    money(cashBalance.cash_at_hand);

  const cashAfter =
    money(cashBefore - amount);

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
      "Unable to update Cash Out SIM wallet"
    );
  }

  const cashUpdate =
    await client.query(
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
      "Unable to update Cash Out cash drawer"
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

  // Electronic side: customer e-money arrives on this exact MTN SIM.
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
       'cash_out',
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
      amount,
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

  // Physical side: cash leaves the agent's single cash drawer.
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
       'cash_out',
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
      transaction.provider,
      -amount,
      cashBefore,
      cashAfter,
      reference,
      notes,
      transaction.id,
      cashBalance.id,
      normalizedIccid || null,
      installationId,
      simSubscriptionId,
      simSlot,
      simProvenanceStatus
    ]
  );

  return {
    simWalletId: simWallet.id,
    cashBalanceId: cashBalance.id,
    amount,
    eFloatBefore,
    eFloatAfter,
    cashBefore,
    cashAfter,
    simProvenanceStatus
  };
}

module.exports = {
  postCashOut
};
