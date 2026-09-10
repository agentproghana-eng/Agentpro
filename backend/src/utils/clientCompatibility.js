'use strict';

const {
  MOBILE_COMPATIBILITY_POLICY,
} = require('../config/clientCompatibility');

const STATUS = Object.freeze({
  LEGACY_SUPPORTED: 'LEGACY_SUPPORTED',
  SUPPORTED: 'SUPPORTED',
  UPDATE_RECOMMENDED: 'UPDATE_RECOMMENDED',
  UPDATE_REQUIRED: 'UPDATE_REQUIRED',
  API_INCOMPATIBLE: 'API_INCOMPATIBLE',
  CLIENT_METADATA_INVALID: 'CLIENT_METADATA_INVALID',
});

const VERSION_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parseVersion(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  const match = VERSION_PATTERN.exec(normalized);

  if (!match) {
    return null;
  }

  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  if (!leftParts || !rightParts) {
    throw new Error('Invalid semantic version');
  }

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] < rightParts[index]) {
      return -1;
    }

    if (leftParts[index] > rightParts[index]) {
      return 1;
    }
  }

  return 0;
}

function normalizeHeader(value) {
  if (Array.isArray(value)) {
    return value[0] == null
      ? ''
      : String(value[0]).trim();
  }

  return value == null
    ? ''
    : String(value).trim();
}

function evaluateClientCompatibility(
  metadata = {},
  policy = MOBILE_COMPATIBILITY_POLICY
) {
  const appVersion =
    normalizeHeader(metadata.appVersion);
  const apiVersionRaw =
    normalizeHeader(metadata.apiContractVersion);
  const platform =
    normalizeHeader(metadata.platform);
  const buildNumber =
    normalizeHeader(metadata.buildNumber);

  const hasCompatibilityMetadata =
    appVersion !== '' ||
    apiVersionRaw !== '' ||
    platform !== '' ||
    buildNumber !== '';

  if (!hasCompatibilityMetadata) {
    return {
      status: STATUS.LEGACY_SUPPORTED,
      enforce: false,
      reason: 'Client does not send compatibility metadata yet.',
    };
  }

  if (
    appVersion === '' ||
    apiVersionRaw === '' ||
    platform === ''
  ) {
    return {
      status: STATUS.CLIENT_METADATA_INVALID,
      enforce: true,
      reason: 'Required AgentPro compatibility headers are incomplete.',
    };
  }

  if (!parseVersion(appVersion)) {
    return {
      status: STATUS.CLIENT_METADATA_INVALID,
      enforce: true,
      reason: 'App version must use major.minor.patch format.',
    };
  }

  if (!/^\d+$/.test(apiVersionRaw)) {
    return {
      status: STATUS.CLIENT_METADATA_INVALID,
      enforce: true,
      reason: 'API contract version must be an integer.',
    };
  }

  const apiContractVersion =
    Number(apiVersionRaw);

  if (
    apiContractVersion !==
    policy.apiContractVersion
  ) {
    return {
      status: STATUS.API_INCOMPATIBLE,
      enforce: true,
      reason: 'Client API contract is not supported by this backend.',
    };
  }

  if (
    compareVersions(
      appVersion,
      policy.forcedUpgradeBelowVersion
    ) < 0
  ) {
    return {
      status: STATUS.UPDATE_REQUIRED,
      enforce: true,
      reason: 'This AgentPro version must be upgraded before continuing.',
    };
  }

  if (
    compareVersions(
      appVersion,
      policy.minimumSupportedAppVersion
    ) < 0
  ) {
    return {
      status: STATUS.UPDATE_REQUIRED,
      enforce: true,
      reason: 'This AgentPro version is no longer supported.',
    };
  }

  if (
    compareVersions(
      appVersion,
      policy.recommendedAppVersion
    ) < 0
  ) {
    return {
      status: STATUS.UPDATE_RECOMMENDED,
      enforce: false,
      reason: 'A newer AgentPro version is recommended.',
    };
  }

  return {
    status: STATUS.SUPPORTED,
    enforce: false,
    reason: 'Client is supported.',
  };
}

function readCompatibilityMetadata(req) {
  return {
    appVersion:
      req.get('X-AgentPro-App-Version'),
    buildNumber:
      req.get('X-AgentPro-App-Build'),
    platform:
      req.get('X-AgentPro-Platform'),
    apiContractVersion:
      req.get('X-AgentPro-API-Version'),
  };
}

module.exports = {
  STATUS,
  parseVersion,
  compareVersions,
  evaluateClientCompatibility,
  readCompatibilityMetadata,
};
