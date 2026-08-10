-- ============================================================
-- 065: MTN Pay to Merchant ledger movement
-- ============================================================
--
-- Pay to Merchant is a business expense, not a customer-facing
-- cash sale.
--
-- Successful MTN Pay to Merchant:
--
--   exact selected SIM e-Float  - transaction amount
--   agent cash drawer           no movement
--
-- The successful merchant_payment transaction itself is the
-- expense source record and retains the merchant ID, reference,
-- amount and exact SIM provenance.
--
-- No earned commission is posted.
-- Branch treasury is not involved.
--
-- MTN is the only currently established Agent Pay to Merchant
-- flow.

ALTER TYPE agent_balance_movement_type
ADD VALUE IF NOT EXISTS 'merchant_payment';
