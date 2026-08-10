-- ============================================================
-- 061: Canonical Cash Out ledger movement
-- ============================================================
--
-- MTN customer Cash Out is an agent-side exchange:
--
--   exact SIM e-Float  + amount
--   agent cash drawer  - amount
--
-- Telecel and AT Money Cash Out remain on the existing
-- cash_out_manual path and must not use this canonical movement.
--
-- Earned commission is posted separately as commission_earned.
--
-- This migration only introduces the canonical movement enum value.

ALTER TYPE agent_balance_movement_type
ADD VALUE IF NOT EXISTS 'cash_out';
