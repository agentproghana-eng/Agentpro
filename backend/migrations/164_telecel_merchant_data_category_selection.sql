-- Automate only the live-confirmed first category screen for
-- Global Telecel Merchant Data.
--
-- Captured live category menu:
--   1. 2Moorch No Expiry
--   2. Daily / Bossu
--   3. Weekly
--   4. Monthly / Jumbo
--   5. Night King
--   0. Go Back
--
-- AgentPro selects only 1..5. The package catalogue that follows remains
-- provider-owned and read-only because package names, prices and pagination
-- can change independently of an AgentPro release.
--
-- PIN remains manual.
-- Organisation Shortcode is not submitted.
-- Historical Personal and Agent Data flows are deliberately untouched.

DO $$
DECLARE
  self_flow_id UUID;
  other_flow_id UUID;
  variant_count INTEGER;
  expected_shape_count INTEGER;
BEGIN
  -- Scope must be exactly the two Global Telecel Merchant Data variants.
  SELECT COUNT(*)
  INTO variant_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'data_bundle'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND COALESCE(bundle_category, '') = ''
    AND recipient_mode IN ('self', 'other')
    AND is_active = TRUE;

  IF variant_count <> 2 THEN
    RAISE EXCEPTION
      'Telecel Merchant Data category migration requires exactly two active Self/Other variants; found %',
      variant_count;
  END IF;

  SELECT id
  INTO self_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'data_bundle'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND COALESCE(bundle_category, '') = ''
    AND recipient_mode = 'self'
    AND is_active = TRUE;

  SELECT id
  INTO other_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'data_bundle'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND COALESCE(bundle_category, '') = ''
    AND recipient_mode = 'other'
    AND is_active = TRUE;

  IF self_flow_id IS NULL OR other_flow_id IS NULL THEN
    RAISE EXCEPTION
      'Telecel Merchant Data category migration requires both Self and Other variants';
  END IF;

  -- Fail closed unless migration 161's exact step counts are still present.
  SELECT COUNT(*)
  INTO expected_shape_count
  FROM ussd_flow_steps
  WHERE flow_id = self_flow_id;

  IF expected_shape_count <> 6 THEN
    RAISE EXCEPTION
      'Telecel Merchant Data Self shape changed: expected 6 steps, found %',
      expected_shape_count;
  END IF;

  SELECT COUNT(*)
  INTO expected_shape_count
  FROM ussd_flow_steps
  WHERE flow_id = other_flow_id;

  IF expected_shape_count <> 9 THEN
    RAISE EXCEPTION
      'Telecel Merchant Data Other shape changed: expected 9 steps, found %',
      expected_shape_count;
  END IF;

  -- Verify the existing provider-owned handoff before replacing anything.
  SELECT COUNT(*)
  INTO expected_shape_count
  FROM ussd_flow_steps
  WHERE flow_id = self_flow_id
    AND step_order = 5
    AND action = 'await_user_selection'::ussd_flow_action
    AND action_value = 'until_pin'
    AND COALESCE(array_length(match_all, 1), 0) = 0;

  IF expected_shape_count <> 1 THEN
    RAISE EXCEPTION
      'Telecel Merchant Data Self provider handoff no longer matches migration 161';
  END IF;

  SELECT COUNT(*)
  INTO expected_shape_count
  FROM ussd_flow_steps
  WHERE flow_id = other_flow_id
    AND step_order = 8
    AND action = 'await_user_selection'::ussd_flow_action
    AND action_value = 'until_pin'
    AND COALESCE(array_length(match_all, 1), 0) = 0;

  IF expected_shape_count <> 1 THEN
    RAISE EXCEPTION
      'Telecel Merchant Data Other provider handoff no longer matches migration 161';
  END IF;

  -- ============================================================
  -- Self
  -- ============================================================

  DELETE FROM ussd_flow_steps
  WHERE flow_id = self_flow_id;

  INSERT INTO ussd_flow_steps (
    flow_id,
    step_order,
    match_all,
    action,
    action_value
  )
  VALUES
    (
      self_flow_id,
      1,
      ARRAY['buy airtime or data'],
      'send_digit'::ussd_flow_action,
      '3'
    ),
    (
      self_flow_id,
      2,
      ARRAY['airtime', 'buy data'],
      'send_digit'::ussd_flow_action,
      '2'
    ),
    (
      self_flow_id,
      3,
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action,
      NULL
    ),
    (
      self_flow_id,
      4,
      ARRAY['select option', 'self', 'other'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      self_flow_id,
      5,
      ARRAY['2moorch no expiry', 'night king'],
      'send_selection'::ussd_flow_action,
      NULL
    ),
    (
      self_flow_id,
      6,
      ARRAY[]::TEXT[],
      'await_user_selection'::ussd_flow_action,
      'until_pin'
    ),
    (
      self_flow_id,
      7,
      ARRAY['enter pin', 'to confirm'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

  -- ============================================================
  -- Other
  -- ============================================================

  DELETE FROM ussd_flow_steps
  WHERE flow_id = other_flow_id;

  INSERT INTO ussd_flow_steps (
    flow_id,
    step_order,
    match_all,
    action,
    action_value
  )
  VALUES
    (
      other_flow_id,
      1,
      ARRAY['buy airtime or data'],
      'send_digit'::ussd_flow_action,
      '3'
    ),
    (
      other_flow_id,
      2,
      ARRAY['airtime', 'buy data'],
      'send_digit'::ussd_flow_action,
      '2'
    ),
    (
      other_flow_id,
      3,
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action,
      NULL
    ),
    (
      other_flow_id,
      4,
      ARRAY['select option', 'self', 'other'],
      'send_digit'::ussd_flow_action,
      '2'
    ),
    (
      other_flow_id,
      5,
      ARRAY['choose the receiver', 'enter recipient number'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      other_flow_id,
      6,
      ARRAY['enter recipient phone number'],
      'send_customer_phone'::ussd_flow_action,
      NULL
    ),
    (
      other_flow_id,
      7,
      ARRAY['re-enter phone number'],
      'send_customer_phone'::ussd_flow_action,
      NULL
    ),
    (
      other_flow_id,
      8,
      ARRAY['2moorch no expiry', 'night king'],
      'send_selection'::ussd_flow_action,
      NULL
    ),
    (
      other_flow_id,
      9,
      ARRAY[]::TEXT[],
      'await_user_selection'::ussd_flow_action,
      'until_pin'
    ),
    (
      other_flow_id,
      10,
      ARRAY['enter pin', 'to confirm'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

  -- Final invariants.
  SELECT COUNT(*)
  INTO expected_shape_count
  FROM ussd_flow_steps
  WHERE flow_id = self_flow_id
    AND action = 'send_selection'::ussd_flow_action;

  IF expected_shape_count <> 1 THEN
    RAISE EXCEPTION
      'Telecel Merchant Data Self invariant failed: expected one category selection';
  END IF;

  SELECT COUNT(*)
  INTO expected_shape_count
  FROM ussd_flow_steps
  WHERE flow_id = other_flow_id
    AND action = 'send_selection'::ussd_flow_action;

  IF expected_shape_count <> 1 THEN
    RAISE EXCEPTION
      'Telecel Merchant Data Other invariant failed: expected one category selection';
  END IF;
END
$$;
