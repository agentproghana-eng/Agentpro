-- Add cash-out commission balance as a supported transaction type.
-- This must commit before later migrations use the new enum value.

ALTER TYPE transaction_type
  ADD VALUE IF NOT EXISTS 'cash_out_commission';
