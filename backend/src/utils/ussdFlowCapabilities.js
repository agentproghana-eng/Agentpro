'use strict';

const { query } = require('../config/database');

async function getRegisteredProviders(queryFn = query) {
  const result = await queryFn(
    `SELECT e.enumlabel AS value
     FROM pg_type t
     JOIN pg_enum e
       ON e.enumtypid = t.oid
     WHERE t.typname = 'provider'
     ORDER BY e.enumsortorder`
  );

  return result.rows.map((row) => row.value);
}

async function getTransactionCapabilities(accountMode, queryFn = query) {
  if (accountMode !== 'business' && accountMode !== 'personal') {
    throw new TypeError(
      'accountMode must be either business or personal'
    );
  }

  const result = await queryFn(
    `SELECT
       transaction_type::text AS value,
       COALESCE(
         NULLIF(BTRIM(display_label), ''),
         INITCAP(REPLACE(transaction_type::text, '_', ' '))
       ) AS label
     FROM ussd_flow_capabilities
     WHERE account_mode = $1
       AND is_active = TRUE
     ORDER BY transaction_type::text`,
    [accountMode]
  );

  return result.rows;
}

async function getFlowBuilderEligibility(
  accountMode,
  provider,
  transactionType,
  queryFn = query
) {
  if (accountMode !== 'business' && accountMode !== 'personal') {
    throw new TypeError(
      'accountMode must be either business or personal'
    );
  }

  const result = await queryFn(
    `SELECT
       EXISTS (
         SELECT 1
         FROM pg_type t
         JOIN pg_enum e
           ON e.enumtypid = t.oid
         WHERE t.typname = 'provider'
           AND e.enumlabel = $1
       ) AS provider_registered,
       EXISTS (
         SELECT 1
         FROM ussd_flow_capabilities
         WHERE account_mode = $2
           AND transaction_type::text = $3
           AND is_active = TRUE
       ) AS transaction_type_builder_enabled`,
    [provider, accountMode, transactionType]
  );

  const row = result.rows[0] || {};

  return {
    provider_registered: row.provider_registered === true,
    transaction_type_builder_enabled:
      row.transaction_type_builder_enabled === true,
  };
}

async function getGlobalFlowBuilderEligibility(
  provider,
  transactionType,
  queryFn = query
) {
  const result = await queryFn(
    `SELECT
       EXISTS (
         SELECT 1
         FROM pg_type t
         JOIN pg_enum e
           ON e.enumtypid = t.oid
         WHERE t.typname = 'provider'
           AND e.enumlabel = $1
       ) AS provider_registered,
       EXISTS (
         SELECT 1
         FROM ussd_flow_capabilities
         WHERE transaction_type::text = $2
           AND account_mode = 'business'
           AND is_active = TRUE
       ) AS business_enabled,
       EXISTS (
         SELECT 1
         FROM ussd_flow_capabilities
         WHERE transaction_type::text = $2
           AND account_mode = 'personal'
           AND is_active = TRUE
       ) AS personal_enabled`,
    [provider, transactionType]
  );

  const row = result.rows[0] || {};

  const businessEnabled =
    row.business_enabled === true;

  const personalEnabled =
    row.personal_enabled === true;

  return {
    provider_registered:
      row.provider_registered === true,
    transaction_type_builder_enabled:
      businessEnabled || personalEnabled,
    business_enabled: businessEnabled,
    personal_enabled: personalEnabled,
  };
}


async function resolveActiveTransactionFlow({
  accountMode,
  provider,
  transactionType,
  businessSimRole = "agent",
  companyId = null,
  bundleCategory = null,
  recipientMode = null,
  queryFn = query,
}) {
  if (!["business", "personal"].includes(accountMode)) {
    throw new Error(
      "accountMode must be either business or personal",
    );
  }

  const normalizedBusinessSimRole =
    accountMode === "business"
      ? String(businessSimRole || "agent")
          .trim()
          .toLowerCase()
      : null;

  if (
    accountMode === "business" &&
    !["agent", "evd", "merchant"].includes(
      normalizedBusinessSimRole,
    )
  ) {
    return null;
  }

  const normalizedBundleCategory =
    String(bundleCategory || "").trim() || null;
  const normalizedRecipientMode =
    String(recipientMode || "").trim() || null;

  const result = await queryFn(
    `SELECT f.*
     FROM ussd_flows f
     WHERE f.provider::text = $1
       AND f.transaction_type::text = $2
       AND f.owner_user_id IS NULL
       AND f.is_active = TRUE
       AND COALESCE(f.bundle_category, '') =
           COALESCE($5, '')
       AND COALESCE(f.recipient_mode, '') =
           COALESCE($6, '')
       AND (
         (
           $3 = 'personal'
           AND f.company_id IS NULL
           AND f.business_sim_role IS NULL
         )
         OR
         (
           $3 = 'business'
           AND f.business_sim_role = $4
           AND (
             f.company_id IS NULL
             OR f.company_id = $7
           )
         )
       )
     ORDER BY
       CASE
         WHEN $3 = 'business' AND f.company_id = $7
           THEN 0
         ELSE 1
       END
     LIMIT 1`,
    [
      provider,
      transactionType,
      accountMode,
      normalizedBusinessSimRole,
      normalizedBundleCategory,
      normalizedRecipientMode,
      accountMode === "business" ? companyId : null,
    ],
  );

  return result.rows[0] || null;
}

async function getInitiationCapability(
  accountMode,
  provider,
  transactionType,
  queryFn = query,
  businessSimRole = "agent",
  companyId = null,
  bundleCategory = null,
  recipientMode = null,
) {
  if (!["business", "personal"].includes(accountMode)) {
    throw new Error(
      "accountMode must be either business or personal",
    );
  }

  const normalizedBusinessSimRole =
    accountMode === "business"
      ? String(businessSimRole || "agent")
          .trim()
          .toLowerCase()
      : null;

  if (
    accountMode === "business" &&
    !["agent", "evd", "merchant"].includes(
      normalizedBusinessSimRole,
    )
  ) {
    return {
      provider_registered: true,
      transaction_type_initiable: false,
      active_flow_available: false,
    };
  }

  const capabilityResult = await queryFn(
    `SELECT
       EXISTS (
         SELECT 1
         FROM pg_type t
         JOIN pg_enum e
           ON e.enumtypid = t.oid
         WHERE t.typname = 'provider'
           AND e.enumlabel = $1
       ) AS provider_registered,
       EXISTS (
         SELECT 1
         FROM ussd_flow_capabilities
         WHERE account_mode = $2
           AND transaction_type::text = $3
           AND can_initiate = TRUE
       ) AS transaction_type_initiable`,
    [
      provider,
      accountMode,
      transactionType,
    ],
  );

  const capabilityRow = capabilityResult.rows[0] || {};

  const providerRegistered =
    capabilityRow.provider_registered === true;
  const transactionTypeInitiable =
    capabilityRow.transaction_type_initiable === true;

  if (!providerRegistered || !transactionTypeInitiable) {
    return {
      provider_registered: providerRegistered,
      transaction_type_initiable: transactionTypeInitiable,
      active_flow_available: false,
    };
  }

  const activeFlow = await resolveActiveTransactionFlow({
    accountMode,
    provider,
    transactionType,
    businessSimRole: normalizedBusinessSimRole,
    companyId:
      accountMode === "business" ? companyId : null,
    bundleCategory,
    recipientMode,
    queryFn,
  });

  return {
    provider_registered: providerRegistered,
    transaction_type_initiable: transactionTypeInitiable,
    active_flow_available: activeFlow !== null,
  };
}

async function getFlowBuilderCapabilities(accountMode, queryFn = query) {
  const [providers, transactionTypes] = await Promise.all([
    getRegisteredProviders(queryFn),
    getTransactionCapabilities(accountMode, queryFn),
  ]);

  return {
    account_mode: accountMode,
    providers,
    transaction_types: transactionTypes,
  };
}

module.exports = {
  resolveActiveTransactionFlow,
  getRegisteredProviders,
  getTransactionCapabilities,
  getFlowBuilderEligibility,
  getGlobalFlowBuilderEligibility,
  getInitiationCapability,
  getFlowBuilderCapabilities,
};
