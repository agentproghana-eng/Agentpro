-- Seed live-confirmed Global Telecel Merchant Airtime recipient variants.
--
-- Captured from a Telecel Merchant SIM on 2026-09-26.
--
-- Self / My Phone:
--   *110#
--   3 Buy Airtime or Data
--   1 Airtime
--   1 My Phone (100% FREE BONUS)
--   Enter Amount
--   Enter Operator ID
--   Buy Airtime ... Enter PIN to confirm
--
-- Other Phone:
--   *110#
--   3 Buy Airtime or Data
--   1 Airtime
--   2 Other Phone
--   Enter Phone Number
--   Re-enter Phone Number
--   Enter Amount
--   Enter Operator ID
--   Buy Airtime ... Enter PIN to confirm
--
-- Merchant Airtime does NOT request Organisation Shortcode.
-- PIN remains manual. AgentPro stops writing at the PIN prompt.
--
-- IMPORTANT:
-- Migration 091 historically classified the pre-role-aware Global Business
-- Airtime row as Agent. That historical Agent row is deliberately untouched.
-- These live-confirmed Merchant variants are separate role-scoped rows.

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
      'Cannot configure Telecel Merchant Airtime variants: superuser missing';
  END IF;

  -- Fail closed unless Merchant Airtime is either completely absent or
  -- already represented by exactly the two expected recipient variants.
  SELECT COUNT(*)
  INTO existing_variant_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'airtime'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND COALESCE(bundle_category, '') = ''
    AND is_active = TRUE;

  IF existing_variant_count NOT IN (0, 2) THEN
    RAISE EXCEPTION
      'Cannot configure Telecel Merchant Airtime variants: expected zero or two active Merchant rows, found %',
      existing_variant_count;
  END IF;

  IF existing_variant_count = 2 THEN
    SELECT COUNT(*)
    INTO final_variant_count
    FROM ussd_flows
    WHERE provider = 'telecel'
      AND transaction_type = 'airtime'
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND business_sim_role = 'merchant'
      AND COALESCE(bundle_category, '') = ''
      AND recipient_mode IN ('self', 'other')
      AND is_active = TRUE;

    IF final_variant_count <> 2 THEN
      RAISE EXCEPTION
        'Cannot configure Telecel Merchant Airtime variants: existing Merchant rows are not exactly Self and Other';
    END IF;
  END IF;

  -- ============================================================
  -- Merchant Airtime · Self / My Phone
  -- ============================================================

  SELECT id
  INTO self_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'airtime'
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
      'airtime',
      '*110#',
      ARRAY[
        'confirmed.',
        'you bought ghs',
        'of airtime for'
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
          'you bought ghs',
          'of airtime for'
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
      '1'
    ),
    (
      self_flow_id,
      3,
      ARRAY['my phone', 'other phone'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      self_flow_id,
      4,
      ARRAY['enter amount'],
      'send_amount'::ussd_flow_action,
      NULL
    ),
    (
      self_flow_id,
      5,
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action,
      NULL
    ),
    (
      self_flow_id,
      6,
      ARRAY['buy airtime', 'enter pin to confirm'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

  -- ============================================================
  -- Merchant Airtime · Other Phone
  -- ============================================================

  SELECT id
  INTO other_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'airtime'
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
      'airtime',
      '*110#',
      ARRAY[
        'confirmed.',
        'you bought ghs',
        'of airtime for'
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
          'you bought ghs',
          'of airtime for'
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
      '1'
    ),
    (
      other_flow_id,
      3,
      ARRAY['my phone', 'other phone'],
      'send_digit'::ussd_flow_action,
      '2'
    ),
    (
      other_flow_id,
      4,
      ARRAY['enter phone number'],
      'send_customer_phone'::ussd_flow_action,
      NULL
    ),
    (
      other_flow_id,
      5,
      ARRAY['re-enter phone number'],
      'send_customer_phone'::ussd_flow_action,
      NULL
    ),
    (
      other_flow_id,
      6,
      ARRAY['enter amount'],
      'send_amount'::ussd_flow_action,
      NULL
    ),
    (
      other_flow_id,
      7,
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action,
      NULL
    ),
    (
      other_flow_id,
      8,
      ARRAY['buy airtime', 'enter pin to confirm'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

  -- Final invariant: exactly Self and Other exist for Global Merchant
  -- Airtime. Historical Agent and Personal Airtime rows remain separate.
  SELECT COUNT(*)
  INTO final_variant_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'airtime'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND COALESCE(bundle_category, '') = ''
    AND recipient_mode IN ('self', 'other')
    AND is_active = TRUE;

  IF final_variant_count <> 2 THEN
    RAISE EXCEPTION
      'Telecel Merchant Airtime invariant failed: expected two active variants, found %',
      final_variant_count;
  END IF;
END
$$;
