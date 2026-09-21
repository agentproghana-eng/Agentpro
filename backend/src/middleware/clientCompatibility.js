'use strict';

const {
  MOBILE_COMPATIBILITY_POLICY,
} = require('../config/clientCompatibility');

const {
  STATUS,
  evaluateClientCompatibility,
  readCompatibilityMetadata,
} = require('../utils/clientCompatibility');

function setCompatibilityHeaders(
  res,
  result
) {
  res.setHeader(
    'X-AgentPro-Compatibility-Status',
    result.status
  );

  res.setHeader(
    'X-AgentPro-API-Version',
    String(
      MOBILE_COMPATIBILITY_POLICY.apiContractVersion
    )
  );

  res.setHeader(
    'X-AgentPro-Min-App-Version',
    MOBILE_COMPATIBILITY_POLICY.minimumSupportedAppVersion
  );

  res.setHeader(
    'X-AgentPro-Recommended-App-Version',
    MOBILE_COMPATIBILITY_POLICY.recommendedAppVersion
  );

  res.setHeader(
    'X-AgentPro-Min-App-Build',
    String(
      MOBILE_COMPATIBILITY_POLICY.minimumSupportedBuildNumber
    )
  );

  res.setHeader(
    'X-AgentPro-Recommended-App-Build',
    String(
      MOBILE_COMPATIBILITY_POLICY.recommendedBuildNumber
    )
  );
}

function enforceClientCompatibility(
  req,
  res,
  next
) {
  const metadata =
    readCompatibilityMetadata(req);

  const result =
    evaluateClientCompatibility(metadata);

  req.clientCompatibility = result;

  setCompatibilityHeaders(
    res,
    result
  );

  if (!result.enforce) {
    return next();
  }

  if (
    result.status ===
    STATUS.CLIENT_METADATA_INVALID
  ) {
    return res.status(400).json({
      success: false,
      code: STATUS.CLIENT_METADATA_INVALID,
      message: result.reason,
    });
  }

  return res.status(426).json({
    success: false,
    code: result.status,
    message: result.reason,

    compatibility: {
      api_contract_version:
        MOBILE_COMPATIBILITY_POLICY.apiContractVersion,

      minimum_supported_app_version:
        MOBILE_COMPATIBILITY_POLICY.minimumSupportedAppVersion,

      recommended_app_version:
        MOBILE_COMPATIBILITY_POLICY.recommendedAppVersion,

      forced_upgrade_below_version:
        MOBILE_COMPATIBILITY_POLICY.forcedUpgradeBelowVersion,

      minimum_supported_build_number:
        MOBILE_COMPATIBILITY_POLICY.minimumSupportedBuildNumber,

      recommended_build_number:
        MOBILE_COMPATIBILITY_POLICY.recommendedBuildNumber,

      forced_upgrade_below_build_number:
        MOBILE_COMPATIBILITY_POLICY.forcedUpgradeBelowBuildNumber,

      update_url:
        MOBILE_COMPATIBILITY_POLICY.androidUpdateUrl,

      update_message:
        MOBILE_COMPATIBILITY_POLICY.requiredUpdateMessage,
    },
  });
}

module.exports = {
  enforceClientCompatibility,
  setCompatibilityHeaders,
};
