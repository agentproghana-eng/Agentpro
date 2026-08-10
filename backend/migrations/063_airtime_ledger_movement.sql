-- ============================================================
-- 063: Agent Airtime ledger movement
-- ============================================================
--
-- Agent Airtime sales executed through the provider's Agent
-- transaction wallet consume e-Float/e-cash from the exact SIM.
--
-- Agent Airtime accounting applies to:
--   MTN        (*171#)
--   Telecel    (*110#)
--   AT Money   (*110#)
--
-- Successful Airtime sale:
--
--   exact selected SIM e-Float  - amount
--   agent cash drawer           + amount
--
-- Earned commission is posted separately.
-- Branch treasury is not involved.

ALTER TYPE agent_balance_movement_type
ADD VALUE IF NOT EXISTS 'airtime';
