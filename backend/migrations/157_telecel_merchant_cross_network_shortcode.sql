-- Correct the live Telecel Merchant cross-network Organisation Shortcode
-- prompt matcher.
--
-- Physically observed provider prompt:
--   Please enter your Org ShortCode
--
-- Scope is deliberately limited to the global active Telecel Merchant
-- send_money_cross_network flow. Personal, Agent, Same Network and Bank
-- flows are untouched.

DO $$
DECLARE
  v_flow_id UUID;
  v_count INTEGER;
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

  UPDATE ussd_flow_steps
  SET match_all = ARRAY['enter your org shortcode']
  WHERE flow_id = v_flow_id
    AND action = 'send_organisation_shortcode'::ussd_flow_action;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Telecel Merchant cross-network Organisation Shortcode step was not found';
  END IF;
END
$$;
