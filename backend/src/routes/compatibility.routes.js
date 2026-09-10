'use strict';

const express = require('express');

const {
  MOBILE_COMPATIBILITY_POLICY,
} = require('../config/clientCompatibility');
const {
  evaluateClientCompatibility,
  readCompatibilityMetadata,
} = require('../utils/clientCompatibility');
const {
  setCompatibilityHeaders,
} = require('../middleware/clientCompatibility');

const router = express.Router();

router.get('/', (req, res) => {
  const metadata =
    readCompatibilityMetadata(req);

  const result =
    evaluateClientCompatibility(metadata);

  setCompatibilityHeaders(
    res,
    result
  );

  res.json({
    success: true,
    data: {
      api_contract_version:
        MOBILE_COMPATIBILITY_POLICY.apiContractVersion,
      minimum_supported_app_version:
        MOBILE_COMPATIBILITY_POLICY.minimumSupportedAppVersion,
      recommended_app_version:
        MOBILE_COMPATIBILITY_POLICY.recommendedAppVersion,
      forced_upgrade_below_version:
        MOBILE_COMPATIBILITY_POLICY.forcedUpgradeBelowVersion,
      status: result.status,
      reason: result.reason,
      client: {
        app_version:
          metadata.appVersion || null,
        build_number:
          metadata.buildNumber || null,
        platform:
          metadata.platform || null,
        api_contract_version:
          metadata.apiContractVersion
            ? Number(metadata.apiContractVersion)
            : null,
      },
    },
  });
});

module.exports = router;
