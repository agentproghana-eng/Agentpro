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

// Posts the real accounting effect of a confirmed network commission transfer.
//
// This is NOT earned commission and it is NOT branch float activity.
//
// Exact selected SIM wallet:
//   commission  - amount
//   e-Float     + amount
//
// A negative exact-SIM commission balance is intentionally allowed here.
// Historical provider-level commission may still live in a legacy_unassigned
// wallet and must never be silently attributed to this physical SIM.
async function postCommissionTransfer(
  client,
  transaction,
  agentId
) {
  if (!transaction) {
    throw new Error("Transaction is required for commission transfer posting");
  }

  if (transaction.transaction_type !== "commission_transfer") {
    throw new Error(
      "postCommissionTransfer can only post commission_transfer transactions"
    );
  }

  if (!agentId) {
    throw new Error("agentId is required for commission transfer posting");
  }

  if (!transaction.provider) {
    throw new Error("Provider is required for commission transfer posting");
  }

  const amount = money(transaction.amount);

  if (amount <= 0) {
    throw new Error("Commission transfer amount must be positive");
  }

  // Resolve and lock the exact identified/unresolved SIM wallet.
  // This service never selects legacy_unassigned for new financial activity.
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

  // If migration/backfill already linked this transaction, that link must
  // agree with the wallet resolved from the transaction's stored SIM identity.
  if (
    transaction.sim_wallet_id &&
    transaction.sim_wallet_id !== simWallet.id
  ) {
    throw new Error(
      "Commission Transfer transaction SIM wallet does not match its stored SIM identity"
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
      "Unable to link Commission Transfer transaction to SIM wallet"
    );
  }

  const commissionBefore =
    money(simWallet.commission_balance);
  const commissionAfter =
    money(commissionBefore - amount);

  const eFloatBefore =
    money(simWallet.e_float_balance);
  const eFloatAfter =
    money(eFloatBefore + amount);

  const walletUpdate =
    await client.query(
      `UPDATE agent_sim_wallets
       SET commission_balance = $1,
           e_float_balance = $2,
           last_updated_at = NOW()
       WHERE id = $3
         AND agent_id = $4
         AND provider = $5
       RETURNING id`,
      [
        commissionAfter,
        eFloatAfter,
        simWallet.id,
        agentId,
        transaction.provider
      ]
    );

  if (walletUpdate.rows.length !== 1) {
    throw new Error(
      "Unable to update Commission Transfer SIM wallet"
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
    installationId: transaction.installation_id || null,
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
         'commission_transfer',
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
         $15
       )`,
      [
        agentId,
        transaction.provider,
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

  // One transfer, two sides of the same exact electronic wallet.
  await insertMovement({
    balanceType: "commission",
    movementAmount: -amount,
    balanceBefore: commissionBefore,
    balanceAfter: commissionAfter
  });

  await insertMovement({
    balanceType: "e_float",
    movementAmount: amount,
    balanceBefore: eFloatBefore,
    balanceAfter: eFloatAfter
  });

  return {
    simWalletId: simWallet.id,
    amount,
    commissionBefore,
    commissionAfter,
    eFloatBefore,
    eFloatAfter,
    simProvenanceStatus
  };
}

module.exports = {
  postCommissionTransfer
};
