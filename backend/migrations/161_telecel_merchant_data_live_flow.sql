-- Seed live-confirmed Global Telecel Merchant Data recipient variants.
--
-- Captured from a Telecel Merchant SIM on 2026-09-26.
--
-- Self:
--   *110#
--   3 Buy Airtime or Data
--   2 Buy Data
--   Enter Operator ID
--   1 Self
--   provider-controlled live bundle catalogue
--   Enter PIN to confirm
--
-- Other:
--   *110#
--   3 Buy Airtime or Data
--   2 Buy Data
--   Enter Operator ID
--   2 Other
--   1 To enter recipient number
--   Enter recipient phone number
--   Re-enter Phone Number
--   provider-controlled live bundle catalogue
--   Enter PIN to confirm
--
-- The live bundle catalogue is intentionally NOT encoded here. Telecel can
-- change categories, package names, prices and pagination independently of an
-- AgentPro release. `await_user_selection` + `until_pin` makes Android strictly
-- read-only while the user navigates those provider-owned menus.
--
-- Merchant Data does NOT request Organisation Shortcode.
-- PIN remains manual. AgentPro performs no write after the PIN prompt.
--
-- Historical Personal and Agent Data flows are deliberately untouched.

DO $$
DECLARE
  superuser_id UUID;
  self_flow_id UUID;
  other_flow_id UUID;
  existing_variant_count INTEGER;
  final_variant_count INTEGER;
BEGIN
  SELECT id
  INTO superuser_id
  FROM users
  WHERE role = 'superuser'
  ORDER BY created_at
  LIMIT 1;

  IF superuser_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot configure Telecel Merchant Data variants: superuser missing';
  END IF;

  -- Fail closed unless Merchant Data is completely absent or already consists
  -- of exactly the expected Self and Other recipient variants.
  SELECT COUNT(*)
  INTO existing_variant_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'data_bundle'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND COALESCE(bundle_category, '') = ''
    AND is_active = TRUE;

  IF existing_variant_count NOT IN (0, 2) THEN
    RAISE EXCEPTION
      'Cannot configure Telecel Merchant Data variants: expected zero or two active Merchant rows, found %',
      existing_variant_count;
  END IF;

  IF existing_variant_count = 2 THEN
    SELECT COUNT(*)
    INTO final_variant_count
    FROM ussd_flows
    WHERE provider = 'telecel'
      AND transaction_type = 'data_bundle'
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND business_sim_role = 'merchant'
      AND COALESCE(bundle_category, '') = ''
      AND recipient_mode IN ('self', 'other')
      AND is_active = TRUE;

    IF final_variant_count <> 2 THEN
      RAISE EXCEPTION
        'Cannot configure Telecel Merchant Data variants: existing Merchant rows are not exactly Self and Other';
    END IF;
  END IF;

  -- ============================================================
  -- Merchant Data · Self
  -- ============================================================

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

  IF self_flow_id IS NULL THEN
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      success_markers,
      failure_markers,
      created_by,
      bundle_category,
      recipient_mode,
      business_sim_role,
      execution_mode
    )
    VALUES (
      'telecel',
      'data_bundle',
      '*110#',
      ARRAY[
        'confirmed.',
        'bundle purchase request'
      ],
      ARRAY[
        'failed',
        'insufficient',
        'invalid',
        'declined',
        'unsuccessfully',
        'transaction cancelled',
        'transaction canceled',
        'cancelled',
        'canceled'
      ],
      superuser_id,
      NULL,
      'self',
      'merchant',
      'interactive'
    )
    RETURNING id INTO self_flow_id;
  ELSE
    UPDATE ussd_flows
    SET dial_code = '*110#',
        success_markers = ARRAY[
          'confirmed.',
          'bundle purchase request'
        ],
        failure_markers = ARRAY[
          'failed',
          'insufficient',
          'invalid',
          'declined',
          'unsuccessfully',
          'transaction cancelled',
          'transaction canceled',
          'cancelled',
          'canceled'
        ],
        execution_mode = 'interactive'
    WHERE id = self_flow_id;
  END IF;

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
      ARRAY[]::TEXT[],
      'await_user_selection'::ussd_flow_action,
      'until_pin'
    ),
    (
      self_flow_id,
      6,
      ARRAY['enter pin', 'to confirm'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

  -- ============================================================
  -- Merchant Data · Other
  -- ============================================================

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

  IF other_flow_id IS NULL THEN
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      success_markers,
      failure_markers,
      created_by,
      bundle_category,
      recipient_mode,
      business_sim_role,
      execution_mode
    )
    VALUES (
      'telecel',
      'data_bundle',
      '*110#',
      ARRAY[
        'confirmed.',
        'bundle purchase request'
      ],
      ARRAY[
        'failed',
        'insufficient',
        'invalid',
        'declined',
        'unsuccessfully',
        'transaction cancelled',
        'transaction canceled',
        'cancelled',
        'canceled'
      ],
      superuser_id,
      NULL,
      'other',
      'merchant',
      'interactive'
    )
    RETURNING id INTO other_flow_id;
  ELSE
    UPDATE ussd_flows
    SET dial_code = '*110#',
        success_markers = ARRAY[
          'confirmed.',
          'bundle purchase request'
        ],
        failure_markers = ARRAY[
          'failed',
          'insufficient',
          'invalid',
          'declined',
          'unsuccessfully',
          'transaction cancelled',
          'transaction canceled',
          'cancelled',
          'canceled'
        ],
        execution_mode = 'interactive'
    WHERE id = other_flow_id;
  END IF;

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
      ARRAY[]::TEXT[],
      'await_user_selection'::ussd_flow_action,
      'until_pin'
    ),
    (
      other_flow_id,
      9,
      ARRAY['enter pin', 'to confirm'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

  SELECT COUNT(*)
  INTO final_variant_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'data_bundle'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND COALESCE(bundle_category, '') = ''
    AND recipient_mode IN ('self', 'other')
    AND is_active = TRUE;

  IF final_variant_count <> 2 THEN
    RAISE EXCEPTION
      'Telecel Merchant Data invariant failed: expected exactly two active recipient variants, found %',
      final_variant_count;
  END IF;
END
$$;
