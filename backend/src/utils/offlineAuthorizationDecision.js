const {
  verifyOfflineAuthorizationRequest,
} = require('./offlineAuthorizationRequest');

const DECISION = Object.freeze({
  LIVE_ALLOWED:
    'live_allowed',
  RECEIPT_ALLOWED:
    'receipt_allowed',
  FEATURE_DISABLED:
    'feature_disabled',
});

function normalizeReceipt(value) {
  return String(value || '').trim();
}

/**
 * Decides whether a NEW transaction may cross a currently disabled
 * feature flag.
 *
 * Important:
 * - Idempotent replay must be resolved before this utility is called.
 * - A receipt is authorization evidence, not proof that USSD executed.
 * - Client timestamps and offline-sync markers are deliberately ignored.
 * - If the operation is currently enabled, normal live behavior wins.
 * - If currently disabled, only a cryptographically valid matching
 *   receipt may preserve earlier offline authorization.
 */
function decideOfflineAuthorization({
  currentlyDisabled,
  receipt,
  user,
  mode,
  provider,
  transactionType,
  now = new Date(),
  secret,
  verifyRequest =
    verifyOfflineAuthorizationRequest,
}) {
  if (currentlyDisabled !== true) {
    return {
      allowed: true,
      decision:
        DECISION.LIVE_ALLOWED,
      receipt_claims: null,
    };
  }

  const normalizedReceipt =
    normalizeReceipt(receipt);

  if (normalizedReceipt.length === 0) {
    return {
      allowed: false,
      decision:
        DECISION.FEATURE_DISABLED,
      receipt_claims: null,
    };
  }

  const claims =
    verifyRequest({
      receipt:
        normalizedReceipt,
      user,
      mode,
      provider,
      transactionType,
      now,
      secret,
    });

  return {
    allowed: true,
    decision:
      DECISION.RECEIPT_ALLOWED,
    receipt_claims:
      claims,
  };
}

module.exports = {
  DECISION,
  decideOfflineAuthorization,
};
