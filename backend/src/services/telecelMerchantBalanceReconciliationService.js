const { auditLog } = require("./auditService");

function reconciliationError(message, code) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  return error;
}

function normalizedMoney(value, label) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw reconciliationError(
      `${label} must be a non-negative amount`,
      "MERCHANT_BALANCE_OBSERVATION_INVALID",
    );
  }

  return amount;
}

function requiredText(value, label) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw reconciliationError(
      `${label} is required`,
      "MERCHANT_BALANCE_OBSERVATION_INVALID",
    );
  }

  return normalized;
}

async function reconcileTelecelMerchantBalances(
  client,
  {
    simWalletId,
    agentId,
    companyId = null,
    merchantAccountBalance,
    workingAccountBalance,
    source,
    sourceReference,
    observedAt,
    ipAddress = null,
    requestId = null,
  },
) {
  if (!client || typeof client.query !== "function") {
    throw new Error("transaction client is required");
  }

  const walletId = requiredText(
    simWalletId,
    "simWalletId",
  );
  const actorId = requiredText(
    agentId,
    "agentId",
  );
  const observationSource = requiredText(
    source,
    "source",
  );
  const observationReference = requiredText(
    sourceReference,
    "sourceReference",
  );

  if (
    !/^[a-z][a-z0-9_]{0,63}$/.test(
      observationSource,
    )
  ) {
    throw reconciliationError(
      "Balance observation source is invalid",
      "MERCHANT_BALANCE_OBSERVATION_INVALID",
    );
  }

  const merchantBalance = normalizedMoney(
    merchantAccountBalance,
    "Merchant Account balance",
  );
  const workingBalance = normalizedMoney(
    workingAccountBalance,
    "Working Account balance",
  );

  const observedDate = new Date(observedAt);

  if (
    !observedAt ||
    Number.isNaN(observedDate.getTime())
  ) {
    throw reconciliationError(
      "A valid observedAt timestamp is required",
      "MERCHANT_BALANCE_OBSERVATION_INVALID",
    );
  }

  // Allow only modest device/provider clock skew. A far-future
  // observation could otherwise block later legitimate reconciliation.
  const maximumFutureSkewMs = 5 * 60 * 1000;

  if (
    observedDate.getTime() >
    Date.now() + maximumFutureSkewMs
  ) {
    throw reconciliationError(
      "Balance observation timestamp is too far in the future",
      "MERCHANT_BALANCE_OBSERVATION_INVALID",
    );
  }

  // One trusted observation initializes both accounts atomically.
  // Give both accounts the same first-initialization timestamp.
  const reconciliationRecordedAt =
    new Date().toISOString();

  // Lock and verify the exact financial identity. Never reconcile
  // an Agent, EVD, Subscriber, or non-Telecel wallet through this path.
  const walletResult = await client.query(
    `SELECT id, agent_id, provider, sim_role
       FROM agent_sim_wallets
      WHERE id = $1
        AND agent_id = $2
        AND provider = 'telecel'
        AND sim_role = 'merchant'
      FOR UPDATE`,
    [
      walletId,
      actorId,
    ],
  );

  if (walletResult.rows.length !== 1) {
    throw reconciliationError(
      "Exact Telecel Merchant SIM wallet was not found",
      "MERCHANT_BALANCE_WALLET_INVALID",
    );
  }

  const accountsResult = await client.query(
    `SELECT *
       FROM sim_wallet_balance_accounts
      WHERE sim_wallet_id = $1
        AND balance_code = ANY($2::varchar[])
      ORDER BY balance_code
      FOR UPDATE`,
    [
      walletId,
      [
        "merchant_account",
        "working_account",
      ],
    ],
  );

  if (accountsResult.rows.length !== 2) {
    throw reconciliationError(
      "Telecel Merchant balance accounts are incomplete",
      "MERCHANT_BALANCE_ACCOUNTS_INCOMPLETE",
    );
  }

  const accounts = Object.fromEntries(
    accountsResult.rows.map((row) => [
      row.balance_code,
      row,
    ]),
  );

  if (
    !accounts.merchant_account ||
    !accounts.working_account
  ) {
    throw reconciliationError(
      "Telecel Merchant balance accounts are incomplete",
      "MERCHANT_BALANCE_ACCOUNTS_INCOMPLETE",
    );
  }

  // Replay protection is scoped to the exact Merchant SIM wallet.
  // Never put sensitive SMS contents in source_reference.
  const existingObservation = await client.query(
    `SELECT
       id,
       merchant_account_balance::text,
       working_account_balance::text,
       observed_at
     FROM telecel_merchant_balance_observations
     WHERE sim_wallet_id = $1
       AND source = $2
       AND source_reference = $3`,
    [
      walletId,
      observationSource,
      observationReference,
    ],
  );

  if (existingObservation.rows.length === 1) {
    const existing =
      existingObservation.rows[0];

    const sameObservation =
      Number(existing.merchant_account_balance) ===
        merchantBalance &&
      Number(existing.working_account_balance) ===
        workingBalance &&
      new Date(existing.observed_at).getTime() ===
        observedDate.getTime();

    if (!sameObservation) {
      throw reconciliationError(
        "Balance observation reference conflicts with an existing observation",
        "MERCHANT_BALANCE_OBSERVATION_CONFLICT",
      );
    }

    return {
      idempotentReplay: true,
      observationId: existing.id,
      simWalletId: walletId,
    };
  }

  // Never let an older observation overwrite a newer financial state.
  const newestObservation = await client.query(
    `SELECT observed_at
       FROM telecel_merchant_balance_observations
      WHERE sim_wallet_id = $1
      ORDER BY observed_at DESC
      LIMIT 1`,
    [walletId],
  );

  if (
    newestObservation.rows.length === 1 &&
    observedDate.getTime() <=
      new Date(
        newestObservation.rows[0].observed_at,
      ).getTime()
  ) {
    throw reconciliationError(
      "Balance observation is not newer than the current reconciled state",
      "MERCHANT_BALANCE_OBSERVATION_STALE",
    );
  }

  const observationResult = await client.query(
    `INSERT INTO telecel_merchant_balance_observations (
       sim_wallet_id,
       source,
       source_reference,
       merchant_account_balance,
       working_account_balance,
       observed_at
     ) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      walletId,
      observationSource,
      observationReference,
      merchantBalance,
      workingBalance,
      observedDate.toISOString(),
    ],
  );

  const observationId =
    observationResult.rows[0]?.id;

  if (!observationId) {
    throw new Error(
      "Unable to persist Telecel Merchant balance observation",
    );
  }

  const applyBalance = async (
    account,
    observedBalance,
  ) => {
    const initializedAt =
      account.balance_state === "known" &&
      account.balance_initialized_at
        ? account.balance_initialized_at
        : reconciliationRecordedAt;

    const result = await client.query(
      `UPDATE sim_wallet_balance_accounts
          SET current_balance = $1,
              balance_state = 'known',
              balance_source = $2,
              balance_observed_at = $3,
              balance_initialized_at = $4,
              last_updated_at = NOW()
        WHERE id = $5
          AND sim_wallet_id = $6
        RETURNING *`,
      [
        observedBalance,
        observationSource,
        observedDate.toISOString(),
        initializedAt,
        account.id,
        walletId,
      ],
    );

    if (result.rows.length !== 1) {
      throw new Error(
        `Unable to reconcile ${account.balance_code}`,
      );
    }

    return result.rows[0];
  };

  const merchantAccount = await applyBalance(
    accounts.merchant_account,
    merchantBalance,
  );

  const workingAccount = await applyBalance(
    accounts.working_account,
    workingBalance,
  );

  await auditLog({
    userId: actorId,
    companyId,
    action:
      "TELECEL_MERCHANT_BALANCES_RECONCILED",
    entityType: "sim_wallet",
    entityId: walletId,
    newValues: {
      observation_id: observationId,
      source: observationSource,
      observed_at: observedDate.toISOString(),
      merchant_account_balance: merchantBalance,
      working_account_balance: workingBalance,
    },
    ipAddress,
    requestId,
    dbClient: client,
    strict: true,
  });

  return {
    idempotentReplay: false,
    observationId,
    simWalletId: walletId,
    merchantAccount,
    workingAccount,
  };
}

module.exports = {
  reconcileTelecelMerchantBalances,
};
