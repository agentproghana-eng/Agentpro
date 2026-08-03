-- Add Telecel Agent Move Money transaction types.
-- Kept separate because PostgreSQL enum additions must commit before use.

ALTER TYPE transaction_type
  ADD VALUE IF NOT EXISTS 'working_to_float';

ALTER TYPE transaction_type
  ADD VALUE IF NOT EXISTS 'float_to_working';
