'use strict';

// Transaction types whose successful principal amount represents
// customer-service transaction volume.
//
// Deliberately excluded:
// - merchant_payment: business expense
// - float_received: funding
// - commission_transfer: internal wallet transfer
// - working_to_float / float_to_working: internal wallet transfers
// - balance/statement/commission enquiries: non-financial
// - reversal: requires original-transaction semantics
// - business_deposit / business_withdrawal: accounting semantics unresolved
const CUSTOMER_VOLUME_TRANSACTION_TYPES = Object.freeze([
  'cash_in',
  'cash_out',
  'send_money',
  'airtime',
  'data_bundle',
  'pay_to_agent',
]);

// Successful principal amounts that represent money spent by the
// business itself rather than customer transaction volume.
module.exports = {
  CUSTOMER_VOLUME_TRANSACTION_TYPES,
};
