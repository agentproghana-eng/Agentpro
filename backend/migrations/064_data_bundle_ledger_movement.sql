-- ============================================================
-- 064: Agent Data Bundle ledger movement
-- ============================================================
--
-- Supported canonical Agent Data Bundle flows:
--
--   MTN       (*171#)
--   Telecel   (*110#)
--
-- Successful Data Bundle sale:
--
--   exact selected SIM e-Float  - transaction amount
--   agent cash drawer           + transaction amount
--
-- For Telecel, transaction.amount is the monetary price of the
-- selected predefined bundle.
--
-- Earned commission is posted separately.
-- Branch treasury is not involved.
--
-- AT Money is intentionally excluded until an Agent Data Bundle
-- transaction flow is established.

ALTER TYPE agent_balance_movement_type
ADD VALUE IF NOT EXISTS 'data_bundle';
