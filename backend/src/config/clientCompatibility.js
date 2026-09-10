'use strict';

const API_CONTRACT_VERSION = 1;

const MOBILE_COMPATIBILITY_POLICY = Object.freeze({
  apiContractVersion: API_CONTRACT_VERSION,

  // AgentPro 2.0.0 is the first release covered by the formal
  // compatibility contract. Older installed clients that do not send
  // compatibility metadata remain temporarily supported as legacy clients.
  minimumSupportedAppVersion: '2.0.0',
  recommendedAppVersion: '2.0.0',
  forcedUpgradeBelowVersion: '2.0.0',
});

module.exports = {
  API_CONTRACT_VERSION,
  MOBILE_COMPATIBILITY_POLICY,
};
