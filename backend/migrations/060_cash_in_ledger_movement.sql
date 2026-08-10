-- ============================================================
-- 060: Canonical Cash In ledger movement
-- ============================================================
--
-- Customer Cash In is an agent-side exchange:
--
--   exact SIM e-Float  - amount
--   agent cash drawer  + amount
--
-- Both balance movements use the same canonical movement type.
-- Earned commission is posted separately as commission_earned.
--
-- This migration only introduces the movement enum value.
-- Financial posting logic is implemented separately.

ALTER TYPE agent_balance_movement_type
ADD VALUE IF NOT EXISTS 'cash_in';
