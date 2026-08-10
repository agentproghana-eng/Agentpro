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

// Posts a confirmed Telecel Agent Move Money operation.
//
// Telecel keeps Working Account and operational Float as two
// separate electronic balances on the same physical Agent SIM.
//
// Working Account -> Float:
//   working_balance  - amount
//   e-Float          + amount
//
// Float -> Working Account:
//   e-Float          - amount
//   working_balance  + amount
//
// There is:
//   no physical cash movement
//   no earned commission
//   no branch-treasury movement
//
// Negative exact-SIM balances are intentionally allowed. Historical
// provider-level balances may still remain in legacy_unassigned wallets,
// and must never be silently attributed to the selected physical SIM.
async function postWorkingFloatTransfer(
  client,
  transaction,
  agentId
) {
  if (!transaction) {
    throw new Error(
      "Transaction is required for Working/Float transfer posting"
    );
  }

  const transactionType = transaction.transaction_type;

  if (
    transactionType !== "working_to_float" &&
    transactionType !== "float_to_working"
  ) {
    throw new Error(
      "postWorkingFloatTransfer can only post " +
        "working_to_float or float_to_working transactions"
    );
  }

  if (!agentId) {
    throw new Error(
      "agentId is required for Working/Float transfer posting"
    );
  }

  if (transaction.provider !== "telecel") {
    throw new Error(
      "Working Account / Float transfer posting is only supported for Telecel"
    );
  }

  const amount = money(transaction.amount);

  if (amount <= 0) {
    throw new Error(
      "Working Account / Float transfer amount must be positive"
    );
  }

  // Resolve and lock the exact identified/unresolved Telecel SIM wallet.
  // New activity must never post into legacy_unassigned.
  const simWallet = await getOrCreateAgentSimWallet(
    client,
    {
      agentId,
      provider: transaction.provider,
      simIccid: transaction.sim_iccid,
      installationId: transaction.installation_id,
      simSubscriptionId: transaction.sim_subscription_id,
      simSlot: transaction.sim_slot
    }
  );

  // If the transaction was already linked by migration/backfill, its wallet
  // must agree with the exact SIM identity stored on the transaction.
  if (
    transaction.sim_wallet_id &&
    transaction.sim_wallet_id !== simWallet.id
  ) {
    throw new Error(
      "Working/Float transaction SIM wallet does not match its stored SIM identity"
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
      "Unable to link Working/Float transaction to SIM wallet"
    );
  }

  const workingBefore =
    money(simWallet.working_balance);

  const eFloatBefore =
    money(simWallet.e_float_balance);

  let workingAfter;
  let eFloatAfter;

  if (transactionType === "working_to_float") {
    workingAfter =
      money(workingBefore - amount);

    eFloatAfter =
      money(eFloatBefore + amount);
  } else {
    workingAfter =
      money(workingBefore + amount);

    eFloatAfter =
      money(eFloatBefore - amount);
  }

  const walletUpdate =
    await client.query(
      `UPDATE agent_sim_wallets
       SET working_balance = $1,
           e_float_balance = $2,
           last_updated_at = NOW()
       WHERE id = $3
         AND agent_id = $4
         AND provider = $5
       RETURNING id`,
      [
        workingAfter,
        eFloatAfter,
        simWallet.id,
        agentId,
        transaction.provider
      ]
    );

  if (walletUpdate.rows.length !== 1) {
    throw new Error(
      "Unable to update Working/Float SIM wallet"
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

  const provenanceValues = {
    simWalletId: simWallet.id,
    simIccid: normalizedIccid || null,
    installationId:
      transaction.installation_id || null,
    simSubscriptionId:
      transaction.sim_subscription_id === undefined
        ? null
        : transaction.sim_subscription_id,
    simSlot:
      transaction.sim_slot === undefined
        ? null
        : transaction.sim_slot,
    status: simProvenanceStatus
  };

  const insertMovement = async ({
    balanceType,
    movementAmount,
    balanceBefore,
    balanceAfter
  }) => {
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
         $14,
         $15,
         $16
       )`,
      [
        agentId,
        transaction.provider,
        transactionType,
        balanceType,
        movementAmount,
        balanceBefore,
        balanceAfter,
        reference,
        notes,
        transaction.id,
        provenanceValues.simWalletId,
        provenanceValues.simIccid,
        provenanceValues.installationId,
        provenanceValues.simSubscriptionId,
        provenanceValues.simSlot,
        provenanceValues.status
      ]
    );
  };

  if (transactionType === "working_to_float") {
    // Source: Working Account.
    await insertMovement({
      balanceType: "working_balance",
      movementAmount: -amount,
      balanceBefore: workingBefore,
      balanceAfter: workingAfter
    });

    // Destination: operational Float.
    await insertMovement({
      balanceType: "e_float",
      movementAmount: amount,
      balanceBefore: eFloatBefore,
      balanceAfter: eFloatAfter
    });
  } else {
    // Source: operational Float.
    await insertMovement({
      balanceType: "e_float",
      movementAmount: -amount,
      balanceBefore: eFloatBefore,
      balanceAfter: eFloatAfter
    });

    // Destination: Working Account.
    await insertMovement({
      balanceType: "working_balance",
      movementAmount: amount,
      balanceBefore: workingBefore,
      balanceAfter: workingAfter
    });
  }

  return {
    simWalletId: simWallet.id,
    transactionType,
    amount,
    workingBefore,
    workingAfter,
    eFloatBefore,
    eFloatAfter,
    simProvenanceStatus
  };
}

module.exports = {
  postWorkingFloatTransfer
};
