-- Correct the Telecel Personal Withdraw Cash step order from live
-- production-device verification.
--
-- Migration 107 restored the historical database definition:
--
--   2 -> 1 -> amount -> till -> till again -> PIN
--
-- Live Telecel *110# verification on 2026-09-06 confirmed the actual
-- subscriber flow is:
--
--   2 -> 1 -> till -> till again -> amount -> PIN
--
-- Scope is deliberately limited to the existing Global Personal
-- Telecel withdraw_cash flow. Agent, Business and all other Personal
-- transaction families are untouched.
--
-- PIN remains a strict manual authorization boundary.

DO $$
DECLARE
  v_flow_id UUID;
BEGIN
  SELECT id
  INTO v_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'withdraw_cash'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role IS NULL
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE
  LIMIT 1;

  IF v_flow_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot correct Telecel Personal Withdraw Cash: Global Personal flow not found';
  END IF;

  DELETE FROM ussd_flow_steps
  WHERE flow_id = v_flow_id;

  INSERT INTO ussd_flow_steps (
    flow_id,
    step_order,
    match_all,
    action,
    action_value
  )
  VALUES
    (
      v_flow_id,
      1,
      ARRAY['mahitti promo'],
      'send_digit'::ussd_flow_action,
      '2'
    ),
    (
      v_flow_id,
      2,
      ARRAY['withdraw cash', 'from atm'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      3,
      ARRAY['enter till no'],
      'send_merchant_id'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      4,
      ARRAY['re-enter till number'],
      'send_merchant_id'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      5,
      ARRAY['enter amount'],
      'send_amount'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      6,
      ARRAY['enter pin'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );
END
$$;
