function financialIdentityError(
  message,
  code = "SIM_IDENTITY_REQUIRED",
) {
  const error = new Error(message);
  error.statusCode = 422;
  error.code = code;
  return error;
}

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
    throw financialIdentityError(
      `${fieldName} must be a non-negative integer`,
      "SIM_IDENTITY_INVALID",
    );
  }

  return normalized;
}

const REQUIRED_BALANCES = Object.freeze([
  "merchant_account",
  "working_account",
]);

async function requireValidatedBalanceDefinitions(client) {
  const result = await client.query(
    `SELECT balance_code
       FROM sim_wallet_balance_definitions
      WHERE provider = 'telecel'
        AND sim_role = 'merchant'
        AND balance_code = ANY($1::varchar[])
        AND is_validated = TRUE
        AND is_active = TRUE
      ORDER BY balance_code`,
    [REQUIRED_BALANCES],
  );

  const found = new Set(result.rows.map((row) => row.balance_code));

  for (const balanceCode of REQUIRED_BALANCES) {
    if (!found.has(balanceCode)) {
      throw accountingError(
        `Telecel Merchant balance ${balanceCode} is not enabled`,
        "MERCHANT_BALANCE_NOT_ENABLED",
      );
    }
  }
}

async function getOrCreateTelecelMerchantWallet(
  client,
  {
    agentId,
    simIccid,
    installationId,
    simSubscriptionId,
    simSlot,
  },
) {
  if (!agentId) {
    throw new Error(
      "agentId is required to resolve a Telecel Merchant wallet",
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

  // Reject incomplete unresolved SIM identity before any financial
  // database access. Provider capability checks must not mask an invalid
  // physical-SIM identity with an unrelated accounting error.
  if (
    !normalizedIccid &&
    (
      !normalizedInstallationId ||
      normalizedSubscriptionId === null ||
      normalizedSlot === null
    )
  ) {
    throw financialIdentityError(
      "A physical SIM ICCID or complete unresolved SIM identity " +
        "(installation_id, sim_subscription_id, sim_slot) is " +
        "required for Telecel Merchant accounting",
    );
  }

  await requireValidatedBalanceDefinitions(client);

  let wallet;

  if (normalizedIccid) {
    await client.query(
      `INSERT INTO agent_sim_wallets (
         agent_id,
         provider,
         sim_role,
         identity_status,
         sim_iccid,
         installation_id,
         sim_subscription_id,
         last_known_sim_slot
       )
       VALUES (
         $1,
         'telecel',
         'merchant',
         'identified',
         $2,
         $3,
         $4,
         $5
       )
       ON CONFLICT DO NOTHING`,
      [
        agentId,
        normalizedIccid,
        normalizedInstallationId,
        normalizedSubscriptionId,
        normalizedSlot,
      ],
    );

    const result = await client.query(
      `SELECT *
         FROM agent_sim_wallets
        WHERE agent_id = $1
          AND provider = 'telecel'
          AND sim_role = 'merchant'
          AND identity_status = 'identified'
          AND sim_iccid = $2
        FOR UPDATE`,
      [agentId, normalizedIccid],
    );

    if (result.rows.length !== 1) {
      throw new Error(
        "Unable to lock identified Telecel Merchant SIM wallet",
      );
    }

    wallet = result.rows[0];

    const updated = await client.query(
      `UPDATE agent_sim_wallets
          SET installation_id =
                COALESCE($1, installation_id),
              sim_subscription_id =
                COALESCE($2, sim_subscription_id),
              last_known_sim_slot =
                COALESCE($3, last_known_sim_slot)
        WHERE id = $4
          AND provider = 'telecel'
          AND sim_role = 'merchant'
        RETURNING *`,
      [
        normalizedInstallationId,
        normalizedSubscriptionId,
        normalizedSlot,
        wallet.id,
      ],
    );

    if (updated.rows.length !== 1) {
      throw new Error(
        "Unable to refresh Telecel Merchant SIM wallet",
      );
    }

    wallet = updated.rows[0];
  } else {
    await client.query(
      `INSERT INTO agent_sim_wallets (
         agent_id,
         provider,
         sim_role,
         identity_status,
         installation_id,
         sim_subscription_id,
         last_known_sim_slot
       )
       VALUES (
         $1,
         'telecel',
         'merchant',
         'unresolved',
         $2,
         $3,
         $4
       )
       ON CONFLICT DO NOTHING`,
      [
        agentId,
        normalizedInstallationId,
        normalizedSubscriptionId,
        normalizedSlot,
      ],
    );

    const result = await client.query(
      `SELECT *
         FROM agent_sim_wallets
        WHERE agent_id = $1
          AND provider = 'telecel'
          AND sim_role = 'merchant'
          AND identity_status = 'unresolved'
          AND installation_id = $2
          AND sim_subscription_id = $3
          AND last_known_sim_slot = $4
        FOR UPDATE`,
      [
        agentId,
        normalizedInstallationId,
        normalizedSubscriptionId,
        normalizedSlot,
      ],
    );

    if (result.rows.length !== 1) {
      throw new Error(
        "Unable to lock unresolved Telecel Merchant SIM wallet",
      );
    }

    wallet = result.rows[0];
  }

  for (const balanceCode of REQUIRED_BALANCES) {
    await client.query(
      `INSERT INTO sim_wallet_balance_accounts (
         sim_wallet_id,
         balance_code
       )
       VALUES ($1, $2)
       ON CONFLICT (sim_wallet_id, balance_code) DO NOTHING`,
      [wallet.id, balanceCode],
    );
  }

  const accounts = await client.query(
    `SELECT *
       FROM sim_wallet_balance_accounts
      WHERE sim_wallet_id = $1
        AND balance_code = ANY($2::varchar[])
      ORDER BY balance_code
      FOR UPDATE`,
    [wallet.id, REQUIRED_BALANCES],
  );

  if (accounts.rows.length !== REQUIRED_BALANCES.length) {
    throw new Error(
      "Unable to lock Telecel Merchant balance accounts",
    );
  }

  const byCode = Object.fromEntries(
    accounts.rows.map((row) => [row.balance_code, row]),
  );

  return {
    simWallet: wallet,
    merchantAccount: byCode.merchant_account,
    workingAccount: byCode.working_account,
  };
}

module.exports = {
  REQUIRED_BALANCES,
  getOrCreateTelecelMerchantWallet,
};
