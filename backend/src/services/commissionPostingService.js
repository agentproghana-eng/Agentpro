const {
  calculateCommission
} = require("./commissionService");
const {
  getOrCreateAgentSimWallet
} = require("./agentWalletService");

// Posts the accounting effect of earned commission.
//
// Provider commission is income paid by the mobile-money provider
// to the agent for eligible Cash In/Deposit and Cash Out/Withdrawal
// transactions. New postings credit the full configured commission.
// Legacy provider-share columns remain only for historical compatibility.
//
// This function intentionally does NOT swallow errors. It runs inside
// transaction completion's database transaction, so incomplete commission
// accounting must roll back the transaction completion rather than leave
// the ledger inconsistent.
async function calculateAndPostCommission(
  client,
  transaction,
  agentId
) {
  const provider =
    String(transaction?.provider || "")
      .trim()
      .toLowerCase();

  const transactionType =
    String(transaction?.transaction_type || "")
      .trim()
      .toLowerCase();

  const simRole =
    String(transaction?.sim_role || "")
      .trim()
      .toLowerCase();

  const isAgentRole =
    simRole === "" ||
    simRole === "agent";

  const isCashIn =
    transactionType === "cash_in" ||
    (
      provider === "mtn" &&
      transactionType === "send_money"
    );

  const isCashOut =
    transactionType === "cash_out";

  if (
    !isAgentRole ||
    (!isCashIn && !isCashOut)
  ) {
    return null;
  }

  const ruleResult = await client.query(
    `SELECT *
     FROM commission_rules
     WHERE (company_id = $1 OR company_id IS NULL)
       AND (provider = $2 OR provider IS NULL)
       AND (transaction_type = $3 OR transaction_type IS NULL)
       AND is_active = TRUE
       AND effective_from <= CURRENT_DATE
       AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
     ORDER BY
       company_id NULLS LAST,
       provider NULLS LAST,
       transaction_type NULLS LAST
     LIMIT 1`,
    [
      transaction.company_id,
      transaction.provider,
      transaction.transaction_type
    ]
  );

  // No applicable commission rule means there is no commission financial
  // event to post. This is a valid outcome, not an accounting failure.
  if (ruleResult.rows.length === 0) {
    return null;
  }

  const rule = ruleResult.rows[0];

  const {
    gross,
    provider_share,
    net
  } = calculateCommission(
    parseFloat(transaction.amount),
    parseFloat(rule.rate_percent),
    rule.threshold_amount
      ? parseFloat(rule.threshold_amount)
      : null,
    rule.cap_amount
      ? parseFloat(rule.cap_amount)
      : null
  );

  const commissionResult = await client.query(
    `INSERT INTO commissions (
       transaction_id,
       agent_id,
       branch_id,
       company_id,
       rule_id,
       gross_commission,
       provider_share,
       net_commission
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8
     )
     RETURNING id`,
    [
      transaction.id,
      agentId,
      transaction.branch_id,
      transaction.company_id,
      rule.id,
      gross,
      provider_share,
      net
    ]
  );

  // A zero net commission is still a valid commission record, but there is
  // no money movement to record in the agent balance ledger.
  if (net === 0) {
    return {
      commissionId: commissionResult.rows[0].id,
      gross,
      providerShare: provider_share,
      net
    };
  }

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

if (
  transaction.sim_wallet_id &&
  transaction.sim_wallet_id !== simWallet.id
) {
  throw new Error(
    "Commission transaction SIM wallet does not match its stored SIM identity"
  );
}

const transactionWalletLink = await client.query(
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
    "Unable to link commission transaction to SIM wallet"
  );
}

const commissionBefore =
  parseFloat(simWallet.commission_balance);

const commissionAfter =
  Math.round((commissionBefore + net) * 100) / 100;

const walletUpdate = await client.query(
  `UPDATE agent_sim_wallets
   SET commission_balance = $1,
       last_updated_at = NOW()
   WHERE id = $2
     AND agent_id = $3
     AND provider = $4
   RETURNING id`,
  [
    commissionAfter,
    simWallet.id,
    agentId,
    transaction.provider
  ]
);

if (walletUpdate.rows.length !== 1) {
  throw new Error(
    "Unable to update earned commission SIM wallet"
  );
}

const normalizedIccid =
  String(transaction.sim_iccid || "").trim();

const simProvenanceStatus =
  normalizedIccid
    ? "identified"
    : "unresolved";

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
     'commission_earned',
     'commission',
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
     $13
   )`,
  [
    agentId,
    transaction.provider,
    net,
    commissionBefore,
    commissionAfter,
    transaction.reference,
    transaction.id,
    simWallet.id,
    normalizedIccid || null,
    transaction.installation_id || null,
    transaction.sim_subscription_id === undefined
      ? null
      : transaction.sim_subscription_id,
    transaction.sim_slot === undefined
      ? null
      : transaction.sim_slot,
    simProvenanceStatus
  ]
);

return {
  commissionId: commissionResult.rows[0].id,
  gross,
  providerShare: provider_share,
  net,
  simWalletId: simWallet.id
};
}

module.exports = {
  calculateAndPostCommission
};
