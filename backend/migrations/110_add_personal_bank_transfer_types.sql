-- Telecel Personal bank-transfer schema semantics.
--
-- Keep enum registration in its own migration. PostgreSQL does not permit a
-- newly-added enum value to be safely consumed by statements in the same
-- transaction on all supported deployment paths.
--
-- send_money_to_bank:
--   Personal transfer from Telecel Cash to a Ghanaian bank account.
--
-- send_account_number:
--   Sends the transaction's transient bank account number into the provider
--   USSD dialog. The raw account number is not persisted as a transaction
--   column and must never be logged by the native automation layer.

ALTER TYPE transaction_type
  ADD VALUE IF NOT EXISTS 'send_money_to_bank';

ALTER TYPE ussd_flow_action
  ADD VALUE IF NOT EXISTS 'send_account_number';
