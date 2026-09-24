-- ============================================================
-- 149: Telecel Merchant validated E-Cash balance capabilities
-- ============================================================
--
-- This migration defines the two electronic balances whose semantics
-- have been validated for Telecel Merchant internal E-Cash transfers:
--
--   merchant_account
--   working_account
--
-- It deliberately does NOT:
--   * create balance-account rows
--   * fabricate opening balances
--   * enable Merchant Send Money accounting
--   * define Other Network accounting
--   * define Bank Transfer accounting
--   * move or reinterpret Agent balances
--
-- Runtime posting remains fail-closed until the Merchant-specific
-- accounting service and transaction dispatcher are separately enabled.
-- ============================================================

INSERT INTO sim_wallet_balance_definitions (
  provider,
  sim_role,
  balance_code,
  display_label,
  is_validated,
  is_active
)
VALUES
  (
    'telecel',
    'merchant',
    'merchant_account',
    'Merchant Account',
    TRUE,
    TRUE
  ),
  (
    'telecel',
    'merchant',
    'working_account',
    'Working Account',
    TRUE,
    TRUE
  )
ON CONFLICT (
  provider,
  sim_role,
  balance_code
)
DO UPDATE SET
  display_label = EXCLUDED.display_label,
  is_validated = EXCLUDED.is_validated,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();

-- Safety assertions: migration 149 must never activate an unvalidated
-- Telecel Merchant balance capability.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM sim_wallet_balance_definitions
    WHERE provider = 'telecel'
      AND sim_role = 'merchant'
      AND is_active = TRUE
      AND is_validated = FALSE
  ) THEN
    RAISE EXCEPTION
      'Active Telecel Merchant balance capability is not validated';
  END IF;
END
$$;
