-- ============================================================
-- 066: MTN Pay to Agent ledger movement
-- ============================================================
--
-- Internal transaction type remains:
--   bill_payment
--
-- User-facing name:
--   Pay to Agent
--
-- Successful MTN Agent Pay to Agent:
--
--   exact selected SIM e-Float  - transaction amount
--   agent cash drawer           + transaction amount
--
-- The initiating agent transfers e-cash to another agent number
-- and receives the equivalent physical cash.
--
-- This is an asset conversion, not a business expense.
--
-- No earned commission is posted.
-- Branch treasury is not involved.
--
-- MTN is the only established Agent Pay to Agent flow.

ALTER TYPE agent_balance_movement_type
ADD VALUE IF NOT EXISTS 'bill_payment';
