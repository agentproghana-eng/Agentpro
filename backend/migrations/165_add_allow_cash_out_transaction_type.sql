-- MTN Personal "Allow Cash Out" and "My Approvals" transaction types.
--
-- A new enum value cannot be used in the same transaction that adds it,
-- so the flows themselves are seeded by the next migrations.

ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'allow_cash_out';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'my_approvals';
