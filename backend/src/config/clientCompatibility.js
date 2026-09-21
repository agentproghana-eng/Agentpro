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

function readHttpsEnvironment(name, fallback) {
  const raw = String(process.env[name] ?? '').trim();
  const value = raw === '' ? fallback : raw;

  let parsed;

  try {
    parsed = new URL(value);
  } catch (_) {
    throw new Error(`${name} must be a valid URL`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${name} must use https`);
  }

  return parsed.toString();
}

function readMessageEnvironment(name, fallback) {
  const raw = String(process.env[name] ?? '').trim();
  const value = raw === '' ? fallback : raw;

  if (value.length > 300) {
    throw new Error(`${name} must not exceed 300 characters`);
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

  // One server-controlled destination lets AgentPro move from the signed
  // direct APK to Google Play later without requiring another app release.
  androidUpdateUrl:
    readHttpsEnvironment(
      'AGENTPRO_ANDROID_UPDATE_URL',
      'https://agentproghana.com/download/agentpro-latest.apk'
    ),

  recommendedUpdateMessage:
    readMessageEnvironment(
      'AGENTPRO_RECOMMENDED_UPDATE_MESSAGE',
      'A newer AgentPro version is available with the latest fixes and improvements.'
    ),

  requiredUpdateMessage:
    readMessageEnvironment(
      'AGENTPRO_REQUIRED_UPDATE_MESSAGE',
      'Update AgentPro to continue using the latest supported transaction and security fixes.'
    ),
});

module.exports = {
  API_CONTRACT_VERSION,
  MOBILE_COMPATIBILITY_POLICY,
};
