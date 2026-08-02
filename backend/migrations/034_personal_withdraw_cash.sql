-- Adds Withdraw Cash as a Personal transaction type, distinct from
-- Agent's own 'cash_out' (same underlying MoMo concept - taking cash
-- from an agent - but a completely different USSD menu path, so
-- reusing 'cash_out' here would collide with Agent's existing global
-- flow on the (provider, transaction_type) uniqueness constraint).
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'withdraw_cash';
