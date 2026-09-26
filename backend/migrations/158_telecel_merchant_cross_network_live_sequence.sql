-- Align the remaining Telecel Merchant cross-network Send Money prompts
-- with the physically observed live provider sequence.
--
-- Observed after protected Organisation Shortcode:
--   Enter Phone Number
--   You have requested to send money to ... / 1 Confirm
--   Please Enter Amount
--   Enter Reference
--   Enter PIN
--   ... Total Fee ... / 1 Confirm / 2 Cancel
--
-- PIN remains manual. The existing post-PIN auto-confirm action is untouched.
-- Personal, Agent, Same Network and Bank flows are untouched.

DO $$
DECLARE
  v_flow_id UUID;
  v_count INTEGER;
  v_updated INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'send_money_cross_network'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND is_active = TRUE;

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one active Global Telecel Merchant cross-network flow; found %',
      v_count;
  END IF;

  SELECT id
  INTO v_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'send_money_cross_network'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND is_active = TRUE;

  -- Step 6: live recipient prompt is "Enter Phone Number".
  UPDATE ussd_flow_steps
  SET match_all = ARRAY['enter phone number']
  WHERE flow_id = v_flow_id
    AND step_order = 6
    AND action = 'send_customer_phone'::ussd_flow_action;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one Telecel Merchant cross-network phone step; updated %',
      v_updated;
  END IF;

  -- Step 7: recipient/name confirmation before amount.
  UPDATE ussd_flow_steps
  SET match_all = ARRAY[
    'you have requested to send money to',
    'confirm'
  ]
  WHERE flow_id = v_flow_id
    AND step_order = 7
    AND action = 'send_digit'::ussd_flow_action
    AND action_value = '1';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one Telecel Merchant cross-network recipient confirmation step; updated %',
      v_updated;
  END IF;

  -- Step 8: physically observed amount prompt.
  UPDATE ussd_flow_steps
  SET match_all = ARRAY['please enter amount']
  WHERE flow_id = v_flow_id
    AND step_order = 8
    AND action = 'send_amount'::ussd_flow_action;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one Telecel Merchant cross-network amount step; updated %',
      v_updated;
  END IF;
END
$$;
