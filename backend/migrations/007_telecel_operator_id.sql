-- Telecel USSD automation requires an agent-specific Operator ID as part
-- of the dial sequence (confirmed via live-device mapping of Telecel's
-- Deposit flow: Enter Operator ID -> 8284, distinct per agent). Unlike
-- USSD dial patterns (per provider+transaction_type, already covered by
-- ussd_overrides), this is a single fixed value per agent across every
-- Telecel transaction - so it lives directly on the user record, not a
-- separate overrides table.
ALTER TABLE users ADD COLUMN telecel_operator_id VARCHAR(20);
