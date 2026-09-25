-- Enable the already-validated Telecel Merchant outgoing transaction
-- identities at the Business initiation-capability boundary.
--
-- These transaction types have dedicated Telecel Merchant USSD flows,
-- readiness checks and accounting. This migration does not alter balances
-- or financial movements.

INSERT INTO ussd_flow_capabilities (
  transaction_type,
  account_mode,
  display_label,
  can_initiate
)
VALUES
  (
    'send_money_same_network',
    'business',
    'Send Money (Same Network)',
    TRUE
  ),
  (
    'send_money_cross_network',
    'business',
    'Send Money (Other Network)',
    TRUE
  ),
  (
    'send_money_to_bank',
    'business',
    'Bank Transfer',
    TRUE
  )
ON CONFLICT (transaction_type, account_mode)
DO UPDATE SET
  display_label = EXCLUDED.display_label,
  can_initiate = TRUE;
