-- Add Telecel Business Withdrawal transaction type.
-- Kept separate so PostgreSQL commits the enum before migration 044 uses it.

ALTER TYPE transaction_type
  ADD VALUE IF NOT EXISTS 'business_withdrawal';
