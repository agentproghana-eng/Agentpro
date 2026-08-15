-- Fix the legacy timestamp trigger on branch treasury accounts.
--
-- float_accounts stores its modification timestamp in last_updated_at,
-- while the generic update_updated_at() trigger writes NEW.updated_at.
-- That causes every UPDATE of float_accounts to fail at runtime.
--
-- Keep the generic trigger function unchanged for tables that genuinely
-- use updated_at. Give float_accounts its own correctly named trigger
-- function instead.

CREATE OR REPLACE FUNCTION update_float_accounts_last_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_float_accounts_updated_at
ON float_accounts;

CREATE TRIGGER trg_float_accounts_updated_at
BEFORE UPDATE ON float_accounts
FOR EACH ROW
EXECUTE FUNCTION update_float_accounts_last_updated_at();
