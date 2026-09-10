'use strict';

const { query } = require('../config/database');

const PROVIDERS = Object.freeze([
  'mtn',
  'telecel',
  'at_money',
]);

const DEFAULT_WINDOW_MINUTES = 10;
const MIN_TERMINAL_TRANSACTIONS = 20;
const DEGRADED_FAILURE_RATE = 0.10;
const MAJOR_OUTAGE_FAILURE_RATE = 0.50;

function emptyProviderHealth(provider, windowMinutes) {
  return {
    provider,
    status: 'unknown',
    window_minutes: windowMinutes,
    observed_transactions: 0,
    terminal_transactions: 0,
    success: 0,
    failed: 0,
    pending_confirmation: 0,
    failure_rate: null,
  };
}

function normalizeCount(value) {
  const number = Number(value || 0);

  if (!Number.isFinite(number) || number < 0) {
    return 0;
  }

  return Math.trunc(number);
}

function classifyProviderHealth({
  terminalTransactions,
  failureRate,
}) {
  if (
    terminalTransactions < MIN_TERMINAL_TRANSACTIONS ||
    failureRate === null
  ) {
    return 'unknown';
  }

  if (failureRate >= MAJOR_OUTAGE_FAILURE_RATE) {
    return 'major_outage';
  }

  if (failureRate >= DEGRADED_FAILURE_RATE) {
    return 'degraded';
  }

  return 'operational';
}

function providerHealthFromRow(
  provider,
  row,
  windowMinutes,
) {
  const success = normalizeCount(row?.success);
  const failed = normalizeCount(row?.failed);
  const pendingConfirmation = normalizeCount(
    row?.pending_confirmation,
  );
  const observedTransactions = normalizeCount(
    row?.observed_transactions,
  );

  const terminalTransactions = success + failed;

  const failureRate =
    terminalTransactions > 0
      ? Number(
          (failed / terminalTransactions).toFixed(4),
        )
      : null;

  return {
    provider,
    status: classifyProviderHealth({
      terminalTransactions,
      failureRate,
    }),
    window_minutes: windowMinutes,
    observed_transactions: observedTransactions,
    terminal_transactions: terminalTransactions,
    success,
    failed,
    pending_confirmation: pendingConfirmation,
    failure_rate: failureRate,
  };
}

async function providerHealthSnapshot({
  windowMinutes = DEFAULT_WINDOW_MINUTES,
} = {}) {
  const normalizedWindow = Number(windowMinutes);

  if (
    !Number.isInteger(normalizedWindow) ||
    normalizedWindow < 1 ||
    normalizedWindow > 60
  ) {
    throw new Error(
      'Provider health window must be an integer between 1 and 60 minutes',
    );
  }

  const result = await query(
    `WITH provider_outcomes AS (
       SELECT
         provider::text AS provider,
         status::text AS status
       FROM transactions
       WHERE status IN ('success', 'failed')
         AND completed_at >=
           NOW() - ($1::integer * INTERVAL '1 minute')

       UNION ALL

       SELECT
         provider::text AS provider,
         status::text AS status
       FROM transactions
       WHERE status = 'pending_confirmation'
         AND created_at >=
           NOW() - ($1::integer * INTERVAL '1 minute')

       UNION ALL

       SELECT
         provider::text AS provider,
         status::text AS status
       FROM personal_transactions
       WHERE status IN ('success', 'failed')
         AND completed_at >=
           NOW() - ($1::integer * INTERVAL '1 minute')

       UNION ALL

       SELECT
         provider::text AS provider,
         status::text AS status
       FROM personal_transactions
       WHERE status = 'pending_confirmation'
         AND created_at >=
           NOW() - ($1::integer * INTERVAL '1 minute')
     )
     SELECT
       provider,
       COUNT(*)::integer AS observed_transactions,
       COUNT(*) FILTER (
         WHERE status = 'success'
       )::integer AS success,
       COUNT(*) FILTER (
         WHERE status = 'failed'
       )::integer AS failed,
       COUNT(*) FILTER (
         WHERE status = 'pending_confirmation'
       )::integer AS pending_confirmation
     FROM provider_outcomes
     WHERE provider = ANY($2::text[])
     GROUP BY provider`,
    [
      normalizedWindow,
      PROVIDERS,
    ],
  );

  const rowsByProvider = new Map(
    (result.rows || []).map((row) => [
      String(row.provider || '').trim().toLowerCase(),
      row,
    ]),
  );

  const providers = {};

  for (const provider of PROVIDERS) {
    const row = rowsByProvider.get(provider);

    providers[provider] = row
      ? providerHealthFromRow(
          provider,
          row,
          normalizedWindow,
        )
      : emptyProviderHealth(
          provider,
          normalizedWindow,
        );
  }

  return {
    window_minutes: normalizedWindow,
    minimum_terminal_transactions:
      MIN_TERMINAL_TRANSACTIONS,
    providers,
  };
}

module.exports = {
  PROVIDERS,
  DEFAULT_WINDOW_MINUTES,
  MIN_TERMINAL_TRANSACTIONS,
  DEGRADED_FAILURE_RATE,
  MAJOR_OUTAGE_FAILURE_RATE,
  classifyProviderHealth,
  providerHealthFromRow,
  providerHealthSnapshot,
};
