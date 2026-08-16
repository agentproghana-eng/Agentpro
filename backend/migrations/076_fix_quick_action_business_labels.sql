-- Correct already-deployed Business Quick Action terminology.
--
-- Migration 073 may already have run on an environment before its
-- bill_payment display label was updated in source, so changing 073 later
-- would not update that existing database.
--
-- MTN send_money is provider-specific ("Cash In"), while the capability
-- registry is keyed only by transaction_type + account_mode. That mapping
-- is therefore resolved by the catalog controller/client using provider
-- context instead of changing send_money globally here.

UPDATE ussd_flow_capabilities
SET
  display_label = 'Pay to Agent',
  updated_at = NOW()
WHERE transaction_type = 'bill_payment'
  AND account_mode = 'business';
