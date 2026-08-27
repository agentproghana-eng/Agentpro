const PROVIDER_COMMISSION_TRANSACTION_TYPES =
  Object.freeze({
    mtn: Object.freeze([
      "send_money",
      "cash_out",
    ]),
    telecel: Object.freeze([
      "cash_in",
      "cash_out",
    ]),
    at_money: Object.freeze([
      "cash_in",
      "cash_out",
    ]),
  });

function normalizeCommissionScopeValue(
  value
) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isSupportedProviderCommissionCombination(
  provider,
  transactionType
) {
  const normalizedProvider =
    normalizeCommissionScopeValue(
      provider
    );

  const normalizedTransactionType =
    normalizeCommissionScopeValue(
      transactionType
    );

  const supportedTypes =
    PROVIDER_COMMISSION_TRANSACTION_TYPES[
      normalizedProvider
    ];

  return Boolean(
    supportedTypes &&
    supportedTypes.includes(
      normalizedTransactionType
    )
  );
}

module.exports = {
  PROVIDER_COMMISSION_TRANSACTION_TYPES,
  normalizeCommissionScopeValue,
  isSupportedProviderCommissionCombination,
};
