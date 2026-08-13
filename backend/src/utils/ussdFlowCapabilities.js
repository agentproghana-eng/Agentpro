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

async function getInitiationCapability(
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
           AND can_initiate = TRUE
       ) AS transaction_type_initiable`,
    [provider, accountMode, transactionType]
  );

  const row = result.rows[0] || {};

  return {
    provider_registered: row.provider_registered === true,
    transaction_type_initiable:
      row.transaction_type_initiable === true,
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
  getRegisteredProviders,
  getTransactionCapabilities,
  getInitiationCapability,
  getFlowBuilderCapabilities,
};
