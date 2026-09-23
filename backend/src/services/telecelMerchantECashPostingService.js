const {
  getOrCreateTelecelMerchantWallet,
} = require("./telecelMerchantWalletService");

const SUPPORTED_TYPES = new Set([
  "float_to_working",
  "working_to_float",
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

async function updateAccount(
  client,
  account,
  delta,
) {
  const result = await client.query(
    `UPDATE sim_wallet_balance_accounts
        SET current_balance = current_balance + $1,
            last_updated_at = NOW()
      WHERE id = $2
        AND current_balance + $1 >= 0
      RETURNING *`,
    [delta, account.id],
  );

  if (result.rows.length !== 1) {
    throw accountingError(
      `Insufficient ${account.balance_code} balance`,
      "INSUFFICIENT_MERCHANT_BALANCE",
    );
  }

  return result.rows[0];
}

async function insertMovement(
  client,
  {
    balanceAccountId,
    transactionId,
    movementCode,
    amountDelta,
    closingBalance,
  },
) {
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
      balanceAccountId,
      transactionId,
      movementCode,
      amountDelta,
      closingBalance,
    ],
  );
}

async function postTelecelMerchantECash(
  client,
  transaction,
  agentId,
) {
  if (!transaction || !transaction.id) {
    throw new Error("transaction is required");
  }

  if (transaction.provider !== "telecel") {
    throw accountingError(
      "Merchant E-Cash posting requires Telecel",
      "MERCHANT_ACCOUNTING_PROVIDER_INVALID",
    );
  }

  if (transaction.sim_role !== "merchant") {
    throw accountingError(
      "Merchant E-Cash posting requires Merchant SIM role",
      "MERCHANT_ACCOUNTING_ROLE_INVALID",
    );
  }

  if (!SUPPORTED_TYPES.has(transaction.transaction_type)) {
    throw accountingError(
      "Unsupported Telecel Merchant E-Cash transaction type",
      "MERCHANT_ACCOUNTING_TYPE_INVALID",
    );
  }

  const amount = money(transaction.amount);

  const {
    simWallet,
    merchantAccount,
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

  // A generic account row can structurally contain 0.00 before AgentPro
  // has ever observed the real provider balance. Never post financial
  // movements against that placeholder value.
  const unknownAccounts = [
    merchantAccount,
    workingAccount,
  ].filter((account) => account.balance_state !== "known");

  if (unknownAccounts.length > 0) {
    throw accountingError(
      "Telecel Merchant balances must be initialized from a verified balance observation before E-Cash accounting can be posted",
      "MERCHANT_BALANCE_INITIALIZATION_REQUIRED",
    );
  }

  let merchantDelta;
  let workingDelta;

  if (transaction.transaction_type === "float_to_working") {
    // Telecel Merchant Account -> Working Account.
    merchantDelta = -amount;
    workingDelta = amount;
  } else {
    // Telecel Working Account -> Merchant Account.
    workingDelta = -amount;
    merchantDelta = amount;
  }

  // Debit first. The wallet resolver already locked both accounts.
  // Any later failure is expected to be rolled back by the caller's
  // surrounding database transaction.
  const debitAccount =
    merchantDelta < 0 ? merchantAccount : workingAccount;

  const debitDelta =
    merchantDelta < 0 ? merchantDelta : workingDelta;

  const creditAccount =
    merchantDelta > 0 ? merchantAccount : workingAccount;

  const creditDelta =
    merchantDelta > 0 ? merchantDelta : workingDelta;

  const updatedDebit = await updateAccount(
    client,
    debitAccount,
    debitDelta,
  );

  const updatedCredit = await updateAccount(
    client,
    creditAccount,
    creditDelta,
  );

  await insertMovement(client, {
    balanceAccountId: debitAccount.id,
    transactionId: transaction.id,
    movementCode:
      transaction.transaction_type === "float_to_working"
        ? "merchant_to_working"
        : "working_to_merchant",
    amountDelta: debitDelta,
    closingBalance: updatedDebit.current_balance,
  });

  await insertMovement(client, {
    balanceAccountId: creditAccount.id,
    transactionId: transaction.id,
    movementCode:
      transaction.transaction_type === "float_to_working"
        ? "merchant_to_working"
        : "working_to_merchant",
    amountDelta: creditDelta,
    closingBalance: updatedCredit.current_balance,
  });

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
      "Unable to link Telecel Merchant transaction to its SIM wallet",
      "MERCHANT_TRANSACTION_LINK_FAILED",
    );
  }

  return {
    simWalletId: simWallet.id,
    merchantAccount: {
      id: merchantAccount.id,
      balance:
        merchantDelta < 0
          ? updatedDebit.current_balance
          : updatedCredit.current_balance,
    },
    workingAccount: {
      id: workingAccount.id,
      balance:
        workingDelta < 0
          ? updatedDebit.current_balance
          : updatedCredit.current_balance,
    },
  };
}

module.exports = {
  postTelecelMerchantECash,
};
