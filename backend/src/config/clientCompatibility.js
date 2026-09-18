'use strict';

const API_CONTRACT_VERSION = 1;

function readPositiveIntegerEnvironment(name, fallback) {
  const raw = String(process.env[name] ?? '').trim();

  if (raw === '') {
    return fallback;
  }

  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`${name} must be a positive integer`);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a safe positive integer`);
  }

  return value;
}

const MOBILE_COMPATIBILITY_POLICY = Object.freeze({
  apiContractVersion: API_CONTRACT_VERSION,

  minimumSupportedAppVersion: '2.0.0',
  recommendedAppVersion: '2.0.0',
  forcedUpgradeBelowVersion: '2.0.0',

  // A semantic version alone cannot distinguish two different APKs
  // released as, for example, 2.0.0. Android build number can.
  minimumSupportedBuildNumber:
    readPositiveIntegerEnvironment(
      'AGENTPRO_MIN_SUPPORTED_BUILD',
      1
    ),

  recommendedBuildNumber:
    readPositiveIntegerEnvironment(
      'AGENTPRO_RECOMMENDED_BUILD',
      1
    ),

  forcedUpgradeBelowBuildNumber:
    readPositiveIntegerEnvironment(
      'AGENTPRO_FORCE_UPGRADE_BELOW_BUILD',
      1
    ),
});

module.exports = {
  API_CONTRACT_VERSION,
  MOBILE_COMPATIBILITY_POLICY,
};
