const {
  getOrCreateTelecelMerchantWallet,
} = require("./telecelMerchantWalletService");

const SUPPORTED_TYPES = new Set([
  "airtime",
  "data_bundle",
  "send_money_same_network",
  "send_money_cross_network",
  "send_money_to_bank",
]);

function accountingError(message, code) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  return error;
}

function money(value) {
  const normalized = Number(value);

  if (!Number.isFinite(normalized) || normalized <= 0) {
    throw accountingError(
      "Transaction amount must be greater than zero",
      "INVALID_TRANSACTION_AMOUNT",
    );
  }

  return normalized;
}

async function postTelecelMerchantOutgoing(
  client,
  transaction,
  agentId,
) {
  if (!transaction || !transaction.id) {
    throw new Error("transaction is required");
  }

  if (transaction.provider !== "telecel") {
    throw accountingError(
      "Merchant outgoing posting requires Telecel",
      "MERCHANT_ACCOUNTING_PROVIDER_INVALID",
    );
  }

  if (transaction.sim_role !== "merchant") {
    throw accountingError(
      "Merchant outgoing posting requires Merchant SIM role",
      "MERCHANT_ACCOUNTING_ROLE_INVALID",
    );
  }

  if (!SUPPORTED_TYPES.has(transaction.transaction_type)) {
    throw accountingError(
      "Unsupported Telecel Merchant outgoing transaction type",
      "MERCHANT_ACCOUNTING_TYPE_INVALID",
    );
  }

  const amount = money(transaction.amount);

  const {
    simWallet,
    workingAccount,
  } = await getOrCreateTelecelMerchantWallet(
    client,
    {
      agentId,
      simIccid: transaction.sim_iccid,
      installationId: transaction.installation_id,
      simSubscriptionId: transaction.sim_subscription_id,
      simSlot: transaction.sim_slot,
    },
  );

  // Merchant Send Money and Bank Transfer are business electronic
  // payments. They spend the Merchant SIM Working Account.
  //
  // They do NOT represent an Agent cash exchange:
  //   Working Account  - principal
  //   Merchant Account   no movement
  //   physical cash      no movement
  //   Agent e-Float      no movement
  //
  // transaction.fee is pre-USSD metadata and is deliberately not
  // posted here. A later provider balance observation reconciles the
  // actual provider-side debit including any provider charge.
  if (
    workingAccount.balance_state !== "known" ||
    !workingAccount.balance_source ||
    !workingAccount.balance_observed_at ||
    !workingAccount.balance_initialized_at
  ) {
    throw accountingError(
      "Telecel Merchant Working Account must be initialized from a verified balance observation before outgoing accounting can be posted",
      "MERCHANT_WORKING_BALANCE_INITIALIZATION_REQUIRED",
    );
  }

  const updated = await client.query(
    `UPDATE sim_wallet_balance_accounts
        SET current_balance = current_balance - $1,
            last_updated_at = NOW()
      WHERE id = $2
        AND balance_code = 'working_account'
        AND balance_state = 'known'
        AND current_balance - $1 >= 0
      RETURNING *`,
    [
      amount,
      workingAccount.id,
    ],
  );

  if (updated.rows.length !== 1) {
    throw accountingError(
      "Insufficient working_account balance",
      "INSUFFICIENT_MERCHANT_BALANCE",
    );
  }

  const updatedWorking = updated.rows[0];

  await client.query(
    `INSERT INTO sim_wallet_balance_movements (
       balance_account_id,
       transaction_id,
       movement_code,
       amount_delta,
       closing_balance
     )
     VALUES ($1, $2, $3, $4, $5)`,
    [
      workingAccount.id,
      transaction.id,
      "merchant_outgoing_payment",
      -amount,
      updatedWorking.current_balance,
    ],
  );

  const linkedTransaction = await client.query(
    `UPDATE transactions
        SET sim_wallet_id = $1
      WHERE id = $2
        AND agent_id = $3
        AND provider = 'telecel'
        AND sim_role = 'merchant'
        AND transaction_type = $4
      RETURNING id`,
    [
      simWallet.id,
      transaction.id,
      agentId,
      transaction.transaction_type,
    ],
  );

  if (linkedTransaction.rows.length !== 1) {
    throw accountingError(
      "Unable to link Telecel Merchant outgoing transaction to its SIM wallet",
      "MERCHANT_TRANSACTION_LINK_FAILED",
    );
  }

  return {
    simWalletId: simWallet.id,
    workingAccount: {
      id: workingAccount.id,
      balance: updatedWorking.current_balance,
    },
  };
}

module.exports = {
  SUPPORTED_TYPES,
  postTelecelMerchantOutgoing,
};
