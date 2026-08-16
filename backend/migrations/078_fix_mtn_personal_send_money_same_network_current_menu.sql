-- MTN Personal Send Money (Same Network)
-- Correct the first USSD menu matcher seeded by migration 075.
--
-- Migration 075 is already applied in production and must remain immutable.
--
-- Confirmed on a live MTN Personal MoMo SIM:
--
--   *170#
--
-- Current first menu includes:
--   1) MoMo User
--   2) Non MoMo User
--   3) Send with Care
--   4) Favorite
--   5) Other Networks
--   6) Bank Account
--
-- Same-network Send Money must therefore select:
--
--   1) MoMo User
--
-- Remaining steps from migration 075 stay unchanged:
-- mobile number -> confirm number -> amount -> reference -> manual PIN.

DO $$
DECLARE
  updated_steps INTEGER;
BEGIN
  UPDATE ussd_flow_steps AS s
  SET match_all = ARRAY[
    'momo user',
    'other networks',
    'bank account'
  ]::TEXT[]
  FROM ussd_flows AS f
  WHERE s.flow_id = f.id
    AND f.provider = 'mtn'
    AND f.transaction_type = 'send_money_same_network'
    AND f.company_id IS NULL
    AND f.owner_user_id IS NULL
    AND COALESCE(f.bundle_category, '') = ''
    AND COALESCE(f.recipient_mode, '') = ''
    AND f.is_active = TRUE
    AND s.step_order = 1
    AND s.action::TEXT = 'send_digit'
    AND s.action_value = '1';

  GET DIAGNOSTICS updated_steps = ROW_COUNT;

  IF updated_steps <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one active Global MTN Personal same-network first step; updated %',
      updated_steps;
  END IF;
END
$$;
