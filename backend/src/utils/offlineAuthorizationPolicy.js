const POLICY_STATE = Object.freeze({
  RECEIPT_PRESENT:
    'receipt_present',
  LEGACY_TRANSITION:
    'legacy_transition',
  RECEIPT_REQUIRED:
    'receipt_required',
});

class OfflineAuthorizationPolicyError extends Error {
  constructor(message, code) {
    super(message);
    this.name =
      'OfflineAuthorizationPolicyError';
    this.code = code;
  }
}

function policyError(message, code) {
  return new OfflineAuthorizationPolicyError(
    message,
    code
  );
}

function parseEnforcementCutoff(value) {
  const normalized =
    String(
      value === undefined ||
      value === null
        ? ''
        : value
    ).trim();

  if (normalized.length === 0) {
    return null;
  }

  const parsed =
    new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw policyError(
      'Offline receipt enforcement cutoff is invalid.',
      'OFFLINE_RECEIPT_ENFORCEMENT_CONFIG_INVALID'
    );
  }

  return parsed;
}

function normalizeNow(value) {
  const parsed =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw policyError(
      'Offline receipt policy evaluation time is invalid.',
      'OFFLINE_RECEIPT_POLICY_TIME_INVALID'
    );
  }

  return parsed;
}

function evaluateOfflineAuthorizationPolicy({
  receipt,
  now = new Date(),
  enforcementCutoff =
    process.env
      .AGENTPRO_OFFLINE_RECEIPT_ENFORCE_AFTER,
}) {
  const normalizedReceipt =
    String(receipt || '').trim();

  if (normalizedReceipt.length > 0) {
    return {
      state:
        POLICY_STATE.RECEIPT_PRESENT,
      receipt:
        normalizedReceipt,
      enforcement_cutoff:
        parseEnforcementCutoff(
          enforcementCutoff
        )?.toISOString() ??
        null,
    };
  }

  const cutoff =
    parseEnforcementCutoff(
      enforcementCutoff
    );

  // Until an explicit server-side cutoff is configured, rollout remains
  // backward compatible. This is intentionally not authorization by a
  // client timestamp or marker; it only describes migration state.
  if (cutoff === null) {
    return {
      state:
        POLICY_STATE.LEGACY_TRANSITION,
      receipt:
        null,
      enforcement_cutoff:
        null,
    };
  }

  const verificationTime =
    normalizeNow(now);

  if (verificationTime < cutoff) {
    return {
      state:
        POLICY_STATE.LEGACY_TRANSITION,
      receipt:
        null,
      enforcement_cutoff:
        cutoff.toISOString(),
    };
  }

  return {
    state:
      POLICY_STATE.RECEIPT_REQUIRED,
    receipt:
      null,
    enforcement_cutoff:
      cutoff.toISOString(),
  };
}

module.exports = {
  POLICY_STATE,
  OfflineAuthorizationPolicyError,
  parseEnforcementCutoff,
  evaluateOfflineAuthorizationPolicy,
};
