-- Telecel Merchant Transfer E-Cash USSD flows.
--
-- Live Merchant Send Money menu:
--   1 Telecel
--   2 Other Networks
--   3 Transfer to Working Account
--   4 Transfer to Merchant Account
--   5 Transfer to Bank
--
-- Canonical AgentPro transaction identities remain:
--
--   float_to_working
--     Merchant Account -> Working Account
--
--   working_to_float
--     Working Account -> Merchant Account
--
-- These are Merchant-role definitions. Existing Agent flows are untouched.
-- PIN is always entered manually.

DO $$
DECLARE
  v_superuser_id UUID;
  v_flow_id UUID;
  v_count INTEGER;
BEGIN
  SELECT id
  INTO v_superuser_id
  FROM users
  WHERE role = 'superuser'
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF v_superuser_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot seed Telecel Merchant E-Cash flows: no superuser exists';
  END IF;

  -- ============================================================
  -- Merchant Account -> Working Account
  -- ============================================================

  SELECT COUNT(*)
  INTO v_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'float_to_working'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE;

  IF v_count > 1 THEN
    RAISE EXCEPTION
      'Expected at most one active Global Telecel Merchant float_to_working flow; found %',
      v_count;
  END IF;

  IF v_count = 0 THEN
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      success_markers,
      failure_markers,
      business_sim_role,
      created_by,
      execution_mode
    )
    VALUES (
      'telecel',
      'float_to_working',
      '*110#',
      ARRAY[
        'transferred from merchant to working'
      ],
      ARRAY[
        'failed',
        'insufficient',
        'invalid',
        'declined',
        'unsuccessfully',
        'connection problem',
        'transaction cancelled',
        'transaction canceled',
        'cancelled',
        'canceled'
      ],
      'merchant',
      v_superuser_id,
      'interactive'
    )
    RETURNING id INTO v_flow_id;
  ELSE
    SELECT id
    INTO v_flow_id
    FROM ussd_flows
    WHERE provider = 'telecel'
      AND transaction_type = 'float_to_working'
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND business_sim_role = 'merchant'
      AND COALESCE(bundle_category, '') = ''
      AND COALESCE(recipient_mode, '') = ''
      AND is_active = TRUE;

    UPDATE ussd_flows
    SET dial_code = '*110#',
        success_markers =
          ARRAY['transferred from merchant to working'],
        failure_markers = ARRAY[
          'failed',
          'insufficient',
          'invalid',
          'declined',
          'unsuccessfully',
          'connection problem',
          'transaction cancelled',
          'transaction canceled',
          'cancelled',
          'canceled'
        ],
        execution_mode = 'interactive'
    WHERE id = v_flow_id;
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
      ARRAY['send money', 'withdraw cash'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      2,
      ARRAY[
        'telecel',
        'other networks',
        'transfer to working account',
        'transfer to merchant account',
        'transfer to bank'
      ],
      'send_digit'::ussd_flow_action,
      '3'
    ),
    (
      v_flow_id,
      3,
      ARRAY['enter amount'],
      'send_amount'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      4,
      ARRAY[
        'transfer ghs',
        'from merchant account to working account',
        'enter 1 to confirm or 0 to cancel'
      ],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      5,
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      6,
      ARRAY['enter pin'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

  -- ============================================================
  -- Working Account -> Merchant Account
  -- ============================================================

  SELECT COUNT(*)
  INTO v_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'working_to_float'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE;

  IF v_count > 1 THEN
    RAISE EXCEPTION
      'Expected at most one active Global Telecel Merchant working_to_float flow; found %',
      v_count;
  END IF;

  IF v_count = 0 THEN
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      success_markers,
      failure_markers,
      business_sim_role,
      created_by,
      execution_mode
    )
    VALUES (
      'telecel',
      'working_to_float',
      '*110#',
      ARRAY[
        'transferred from working to merchant'
      ],
      ARRAY[
        'failed',
        'insufficient',
        'invalid',
        'declined',
        'unsuccessfully',
        'connection problem',
        'transaction cancelled',
        'transaction canceled',
        'cancelled',
        'canceled'
      ],
      'merchant',
      v_superuser_id,
      'interactive'
    )
    RETURNING id INTO v_flow_id;
  ELSE
    SELECT id
    INTO v_flow_id
    FROM ussd_flows
    WHERE provider = 'telecel'
      AND transaction_type = 'working_to_float'
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND business_sim_role = 'merchant'
      AND COALESCE(bundle_category, '') = ''
      AND COALESCE(recipient_mode, '') = ''
      AND is_active = TRUE;

    UPDATE ussd_flows
    SET dial_code = '*110#',
        success_markers =
          ARRAY['transferred from working to merchant'],
        failure_markers = ARRAY[
          'failed',
          'insufficient',
          'invalid',
          'declined',
          'unsuccessfully',
          'connection problem',
          'transaction cancelled',
          'transaction canceled',
          'cancelled',
          'canceled'
        ],
        execution_mode = 'interactive'
    WHERE id = v_flow_id;
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
      ARRAY['send money', 'withdraw cash'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      2,
      ARRAY[
        'telecel',
        'other networks',
        'transfer to working account',
        'transfer to merchant account',
        'transfer to bank'
      ],
      'send_digit'::ussd_flow_action,
      '4'
    ),
    (
      v_flow_id,
      3,
      ARRAY['enter amount'],
      'send_amount'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      4,
      ARRAY[
        'transfer ghs',
        'from working account to merchant account',
        'enter 1 to confirm or 0 to cancel'
      ],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      5,
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action,
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
