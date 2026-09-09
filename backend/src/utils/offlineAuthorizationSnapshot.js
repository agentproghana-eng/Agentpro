const crypto = require('crypto');

const { query } = require('../config/database');

const {
  parseDisabledTransactionTypes,
} = require('./featureFlagConfig');

const SNAPSHOT_CONTEXT =
  'agentpro-offline-authorization-snapshot:v1:';

function normalizeMode(value) {
  const mode = String(value || '')
    .trim()
    .toLowerCase();

  if (
    mode !== 'business' &&
    mode !== 'personal'
  ) {
    throw new TypeError(
      'accountMode must be either business or personal'
    );
  }

  return mode;
}

function normalizeProvider(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function normalizeTransactionType(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function snapshotVersion({
  accountMode,
  allowedOperations,
  disabledOperations,
}) {
  const canonical = JSON.stringify({
    account_mode: accountMode,
    allowed_operations: allowedOperations,
    disabled_operations: disabledOperations,
  });

  return crypto
    .createHash('sha256')
    .update(
      `${SNAPSHOT_CONTEXT}${canonical}`
    )
    .digest('hex');
}

async function getOfflineAuthorizationSnapshot(
  accountMode,
  queryFn = query
) {
  const mode = normalizeMode(accountMode);

  const providersResult = await queryFn(
    `SELECT e.enumlabel AS provider
     FROM pg_type t
     JOIN pg_enum e
       ON e.enumtypid = t.oid
     WHERE t.typname = 'provider'
     ORDER BY e.enumsortorder`
  );

  const capabilitiesResult = await queryFn(
    `SELECT transaction_type::text AS transaction_type
     FROM ussd_flow_capabilities
     WHERE account_mode = $1
       AND can_initiate = TRUE
     ORDER BY transaction_type::text`,
    [mode]
  );

  const featureFlagResult = await queryFn(
    `SELECT value
     FROM system_config
     WHERE key = 'disabled_transaction_types'
     LIMIT 1`
  );

  const providers = [
    ...new Set(
      (providersResult.rows || [])
        .map((row) =>
          normalizeProvider(row.provider)
        )
        .filter(Boolean)
    ),
  ].sort();

  const transactionTypes = [
    ...new Set(
      (capabilitiesResult.rows || [])
        .map((row) =>
          normalizeTransactionType(
            row.transaction_type
          )
        )
        .filter(Boolean)
    ),
  ].sort();

  const rawDisabled =
    featureFlagResult.rows &&
    featureFlagResult.rows.length > 0
      ? featureFlagResult.rows[0].value
      : [];

  const disabledOperations =
    parseDisabledTransactionTypes(
      rawDisabled
    ).sort();

  const disabledSet =
    new Set(disabledOperations);

  const allowedOperations = [];

  for (const provider of providers) {
    for (
      const transactionType
      of transactionTypes
    ) {
      const operation =
        `${provider}:${transactionType}`;

      if (!disabledSet.has(operation)) {
        allowedOperations.push(operation);
      }
    }
  }

  allowedOperations.sort();

  return {
    account_mode: mode,
    providers,
    transaction_types:
      transactionTypes,
    disabled_operations:
      disabledOperations,
    allowed_operations:
      allowedOperations,
    feature_flag_version:
      snapshotVersion({
        accountMode: mode,
        allowedOperations,
        disabledOperations,
      }),
  };
}

module.exports = {
  getOfflineAuthorizationSnapshot,
};
