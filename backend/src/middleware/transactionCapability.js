'use strict';

const {
  getInitiationCapability,
} = require('../utils/ussdFlowCapabilities');

function createInitiationCapabilityGuard(
  accountMode,
  capabilityLookup = getInitiationCapability
) {
  if (accountMode !== 'business' && accountMode !== 'personal') {
    throw new TypeError(
      'accountMode must be either business or personal'
    );
  }

  return async function initiationCapabilityGuard(req, res, next) {
    try {
      const provider = String(req.body.provider || '').trim();
      const transactionType = String(
        req.body.transaction_type || ''
      ).trim();

      const capability = await capabilityLookup(
        accountMode,
        provider,
        transactionType
      );

      const errors = [];

      if (!capability.provider_registered) {
        errors.push({
          field: 'provider',
          message: 'Invalid provider',
        });
      }

      if (!capability.transaction_type_initiable) {
        errors.push({
          field: 'transaction_type',
          message: 'Invalid transaction type',
        });
      }

      if (errors.length > 0) {
        return res.status(422).json({
          success: false,
          message: 'Validation failed',
          errors,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  createInitiationCapabilityGuard,
};
