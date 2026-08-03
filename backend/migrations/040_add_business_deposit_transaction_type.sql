-- Add Telecel Business Deposit transaction type.
-- Kept separate so the enum value commits before migration 041 uses it.

ALTER TYPE transaction_type
  ADD VALUE IF NOT EXISTS 'business_deposit';
