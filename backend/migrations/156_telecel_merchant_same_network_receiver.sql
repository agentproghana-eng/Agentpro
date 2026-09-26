-- Correct the live Telecel Merchant same-network receiver menu matcher.
--
-- Live provider menu:
--   Choose the receiver
--   1 To enter recipient number
--   2 My List
--   0 Return to Main menu
--
-- Scope is deliberately limited to the global active Telecel Merchant
-- send_money_same_network flow. Personal and Agent flows are untouched.

DO $$
DECLARE
  v_flow_id UUID;
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'send_money_same_network'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND is_active = TRUE;

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one active Global Telecel Merchant same-network flow; found %',
      v_count;
  END IF;

  SELECT id
  INTO v_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'send_money_same_network'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND is_active = TRUE;

  UPDATE ussd_flow_steps
  SET match_all = ARRAY[
    'choose the receiver',
    'enter recipient number',
    'my list'
  ]
  WHERE flow_id = v_flow_id
    AND step_order = 3
    AND action = 'send_digit'::ussd_flow_action
    AND action_value = '1';

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Telecel Merchant same-network receiver step was not found';
  END IF;
END
$$;
