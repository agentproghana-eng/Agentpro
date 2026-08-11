-- ============================================================
-- 069: Shift cash declarations and reconciliation variances
-- ============================================================
--
-- Opening:
--   opening_cash_expected  = canonical Cash at Hand ledger balance
--   opening_cash_declared  = physical cash explicitly counted by the user
--   opening_cash_variance  = declared - expected
--
-- Closing:
--   closing_cash_expected  = canonical Cash at Hand ledger balance
--   closing_cash_declared  = physical cash explicitly counted by the user
--   closing_cash_variance  = declared - expected
--
-- closing_cash_actual and variance remain legacy compatibility fields.
--
-- A declaration NEVER overwrites agent_cash_balances. Any difference remains
-- visible for reconciliation instead of silently changing the cash ledger.
--
-- Declaration and variance columns remain nullable so historical shifts
-- created before this accounting model remain truthful rather than receiving
-- invented values.

ALTER TABLE shifts
ADD COLUMN opening_cash_declared DECIMAL(15, 2),
ADD COLUMN opening_cash_variance DECIMAL(15, 2),
ADD COLUMN closing_cash_declared DECIMAL(15, 2),
ADD COLUMN closing_cash_variance DECIMAL(15, 2);

ALTER TABLE shifts
ADD CONSTRAINT chk_shifts_opening_cash_declared_nonnegative
CHECK (
  opening_cash_declared IS NULL
  OR opening_cash_declared >= 0
);

ALTER TABLE shifts
ADD CONSTRAINT chk_shifts_closing_cash_declared_nonnegative
CHECK (
  closing_cash_declared IS NULL
  OR closing_cash_declared >= 0
);

COMMENT ON COLUMN shifts.opening_cash_declared IS
  'Physical Cash at Hand explicitly counted by the user at shift opening. Does not mutate the canonical cash ledger.';

COMMENT ON COLUMN shifts.opening_cash_variance IS
  'Opening Cash at Hand reconciliation variance: declared minus expected.';

COMMENT ON COLUMN shifts.closing_cash_declared IS
  'Physical Cash at Hand explicitly counted by the user at shift closing. Does not mutate the canonical cash ledger.';

COMMENT ON COLUMN shifts.closing_cash_variance IS
  'Closing Cash at Hand reconciliation variance: declared minus expected.';
