// Transaction-safe access to the new agent financial balance model.
//
// Physical cash:
//   exactly one cash drawer per agent.
//
// Electronic money:
//   one wallet per identified ICCID, or one conservative unresolved wallet
//   per installation + Android subscription + slot observation.
//
// IMPORTANT:
//   New financial activity must NEVER post into a legacy_unassigned wallet.
//   Those wallets exist only to preserve balances whose historic physical
//   SIM ownership cannot be proven.

function financialIdentityError(message, code = "SIM_IDENTITY_REQUIRED") {
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
      "SIM_IDENTITY_INVALID"
    );
  }

  return normalized;
}

async function getOrCreateAgentCashBalance(client, agentId) {
  await client.query(
    `INSERT INTO agent_cash_balances (
       agent_id
     )
     VALUES ($1)
     ON CONFLICT (agent_id) DO NOTHING`,
    [agentId]
  );

  const result = await client.query(
    `SELECT *
     FROM agent_cash_balances
     WHERE agent_id = $1
     FOR UPDATE`,
    [agentId]
  );

  if (result.rows.length !== 1) {
    throw new Error("Unable to lock agent cash balance");
  }

  return result.rows[0];
}

async function getOrCreateAgentSimWallet(
  client,
  {
    agentId,
    provider,
    simIccid,
    installationId,
    simSubscriptionId,
    simSlot
  }
) {
  if (!agentId) {
    throw new Error("agentId is required to resolve a SIM wallet");
  }

  if (!provider) {
    throw new Error("provider is required to resolve a SIM wallet");
  }

  const normalizedIccid = normalizeOptionalText(simIccid);
  const normalizedInstallationId = normalizeOptionalText(installationId);

  const normalizedSubscriptionId =
    normalizeOptionalNonNegativeInteger(
      simSubscriptionId,
      "sim_subscription_id"
    );

  const normalizedSlot =
    normalizeOptionalNonNegativeInteger(
      simSlot,
      "sim_slot"
    );

  // ----------------------------------------------------------
  // IDENTIFIED PHYSICAL SIM
  // ----------------------------------------------------------
  //
  // ICCID is the durable identity. installation/subscription/slot are only
  // last-observed metadata here and must never split one ICCID into several
  // financial wallets.
  if (normalizedIccid) {
    await client.query(
      `INSERT INTO agent_sim_wallets (
         agent_id,
         provider,
         identity_status,
         sim_iccid,
         installation_id,
         sim_subscription_id,
         last_known_sim_slot
       )
       VALUES (
         $1,
         $2,
         'identified',
         $3,
         $4,
         $5,
         $6
       )
       ON CONFLICT DO NOTHING`,
      [
        agentId,
        provider,
        normalizedIccid,
        normalizedInstallationId,
        normalizedSubscriptionId,
        normalizedSlot
      ]
    );

    const result = await client.query(
      `SELECT *
       FROM agent_sim_wallets
       WHERE agent_id = $1
         AND provider = $2
         AND identity_status = 'identified'
         AND sim_iccid = $3
       FOR UPDATE`,
      [
        agentId,
        provider,
        normalizedIccid
      ]
    );

    if (result.rows.length !== 1) {
      throw new Error("Unable to lock identified agent SIM wallet");
    }

    const wallet = result.rows[0];

    // ICCID remains the identity. Refresh only last-observed metadata.
    const updated = await client.query(
      `UPDATE agent_sim_wallets
       SET installation_id =
             COALESCE($1, installation_id),
           sim_subscription_id =
             COALESCE($2, sim_subscription_id),
           last_known_sim_slot =
             COALESCE($3, last_known_sim_slot)
       WHERE id = $4
       RETURNING *`,
      [
        normalizedInstallationId,
        normalizedSubscriptionId,
        normalizedSlot,
        wallet.id
      ]
    );

    if (updated.rows.length !== 1) {
      throw new Error("Unable to refresh identified agent SIM wallet");
    }

    return updated.rows[0];
  }

  // ----------------------------------------------------------
  // UNRESOLVED SIM OBSERVATION
  // ----------------------------------------------------------
  //
  // Without ICCID, we refuse provider-only or slot-only accounting.
  // installation + subscription + slot must all be present.
  //
  // This remains explicitly unresolved and must never be promoted to a
  // physical-SIM identity merely because a later ICCID appears in the
  // same slot.
  if (
    !normalizedInstallationId ||
    normalizedSubscriptionId === null ||
    normalizedSlot === null
  ) {
    throw financialIdentityError(
      "A physical SIM ICCID or complete unresolved SIM identity " +
        "(installation_id, sim_subscription_id, sim_slot) is required " +
        "for electronic balance accounting"
    );
  }

  await client.query(
    `INSERT INTO agent_sim_wallets (
       agent_id,
       provider,
       identity_status,
       installation_id,
       sim_subscription_id,
       last_known_sim_slot
     )
     VALUES (
       $1,
       $2,
       'unresolved',
       $3,
       $4,
       $5
     )
     ON CONFLICT DO NOTHING`,
    [
      agentId,
      provider,
      normalizedInstallationId,
      normalizedSubscriptionId,
      normalizedSlot
    ]
  );

  const result = await client.query(
    `SELECT *
     FROM agent_sim_wallets
     WHERE agent_id = $1
       AND provider = $2
       AND identity_status = 'unresolved'
       AND installation_id = $3
       AND sim_subscription_id = $4
       AND last_known_sim_slot = $5
     FOR UPDATE`,
    [
      agentId,
      provider,
      normalizedInstallationId,
      normalizedSubscriptionId,
      normalizedSlot
    ]
  );

  if (result.rows.length !== 1) {
    throw new Error("Unable to lock unresolved agent SIM wallet");
  }

  return result.rows[0];
}

module.exports = {
  getOrCreateAgentCashBalance,
  getOrCreateAgentSimWallet
};
