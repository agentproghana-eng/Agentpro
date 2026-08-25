'use strict';

module.exports = {
  ROLES: {
    SUPERUSER: 'superuser',
    BUSINESS_OWNER: 'business_owner',
    MANAGER: 'manager',
    AGENT: 'agent',
    AUDITOR: 'auditor',
    CUSTOMER: 'customer',
  },

  PROVIDERS: {
    MTN: 'mtn',
    TELECEL: 'telecel',
    AT_MONEY: 'at_money',
  },

  TRANSACTION_TYPES: {
    CASH_IN: 'cash_in',
    CASH_OUT: 'cash_out',
    SEND_MONEY: 'send_money',
    MERCHANT_PAYMENT: 'merchant_payment',
    PAY_TO_AGENT: 'pay_to_agent',
    BILL_PAYMENT: 'bill_payment',
    AIRTIME: 'airtime',
    DATA_BUNDLE: 'data_bundle',
    BALANCE_ENQUIRY: 'balance_enquiry',
    MINI_STATEMENT: 'mini_statement',
    REVERSAL: 'reversal',
  },

  TRANSACTION_STATUSES: {
    INITIATED: 'initiated',
    PROCESSING: 'processing',
    SUCCESS: 'success',
    FAILED: 'failed',
    REVERSED: 'reversed',
    PENDING_CONFIRMATION: 'pending_confirmation',
  },

  SUBSCRIPTION_PLANS: {
    FREE: 'free',
    BUSINESS: 'business',
  },

  AD_STATUSES: {
    DRAFT: 'draft',
    PENDING_REVIEW: 'pending_review',
    PENDING_PAYMENT: 'pending_payment',
    ACTIVE: 'active',
    EXPIRED: 'expired',
    REJECTED: 'rejected',
  },

  // Security
  PIN_WARNING: 'Agent Pro Ghana NEVER requests, stores, or transmits a MoMo PIN.',

  // Default values (overridden by system_config table)
  DEFAULTS: {
    SUBSCRIPTION_PRICE: 10.00,
    AD_FEE_PERCENT: 0.01,
    AD_DURATION_DAYS: 30,
    AD_GRACE_PERIOD_DAYS: 7,
    SUBSCRIPTION_GRACE_PERIOD_DAYS: 7,
    LOW_FLOAT_THRESHOLD: 500.00,
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_DURATION_MINUTES: 30,
  },
};
