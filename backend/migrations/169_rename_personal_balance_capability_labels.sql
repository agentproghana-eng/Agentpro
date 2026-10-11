-- Subscriber-facing names for the two balance enquiries.
--   check_momo_balance    -> MoMo Balance
--   check_airtime_balance -> Mashup Balance
--
-- Telecel keeps its own "Balance" tile label through the provider override in
-- quickActionDisplayLabel, so this only changes the shared capability label.

UPDATE ussd_flow_capabilities
SET display_label = 'MoMo Balance',
    updated_at = NOW()
WHERE transaction_type = 'check_momo_balance'
  AND account_mode = 'personal';

UPDATE ussd_flow_capabilities
SET display_label = 'Mashup Balance',
    updated_at = NOW()
WHERE transaction_type = 'check_airtime_balance'
  AND account_mode = 'personal';
