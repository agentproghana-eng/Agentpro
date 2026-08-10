-- ============================================================
-- 062: Agent Send Money ledger movement
-- ============================================================
--
-- Applies to Agent SIM Send Money for:
--   MTN
--   Telecel
--   AirtelTigo / AT Money
--
-- A successful customer Send Money exchange is:
--
--   exact selected SIM e-Float  - amount
--   agent cash drawer           + amount
--
-- Earned commission is posted separately as commission_earned.
-- Recorded network charge remains metadata until provider
-- statement/SMS reconciliation confirms the actual debit.
--
-- Branch treasury is not involved.

ALTER TYPE agent_balance_movement_type
ADD VALUE IF NOT EXISTS 'send_money';
