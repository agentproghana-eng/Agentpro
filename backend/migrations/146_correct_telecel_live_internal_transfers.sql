-- Correct Telecel Agent internal account-transfer routes from the
-- live *110# menu verified on 2026-09-22.
--
-- Current Send Money menu:
--   1 Telecel
--   2 Other Networks
--   3 Transfer to Working Account
--   4 Transfer to Merchant Account
--   5 Transfer to Bank
--
-- Existing transaction identities remain stable:
--
--   float_to_working
--     Provider: Merchant Account -> Working Account
--
--   working_to_float
--     Provider: Working Account -> Merchant Account
--
-- "Float" remains an internal AgentPro accounting term. Telecel's
-- user-facing network wording is "Merchant Account".
--
-- PIN is always entered manually by the user.

DO $$
DECLARE
  v_float_to_working UUID;
  v_working_to_float UUID;
  v_count INTEGER;
BEGIN
  -- ============================================================
  -- Merchant Account -> Working Account
  -- Current live path:
  --   *110#
  --   1 Send Money
  --   3 Transfer to Working Account
  --   Enter Amount
  --   Transfer GHS... from Merchant Account to Working Account
  --   Enter 1 to confirm or 0 to cancel
  --   Enter Operator ID
  --   Enter PIN
  -- ============================================================

  SELECT COUNT(*)
  INTO v_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'float_to_working'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'agent'
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE;

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one active Global Telecel Agent float_to_working flow; found %',
      v_count;
  END IF;

  SELECT id
  INTO v_float_to_working
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'float_to_working'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'agent'
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE;

  UPDATE ussd_flows
  SET dial_code = '*110#',
      success_markers = ARRAY[
        'transferred from merchant to working'
      ],
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
      ]
  WHERE id = v_float_to_working;

  DELETE FROM ussd_flow_steps
  WHERE flow_id = v_float_to_working;

  INSERT INTO ussd_flow_steps (
    flow_id,
    step_order,
    match_all,
    action,
    action_value
  )
  VALUES
    (
      v_float_to_working,
      1,
      ARRAY['send money', 'withdraw cash'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_float_to_working,
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
      v_float_to_working,
      3,
      ARRAY['enter amount'],
      'send_amount'::ussd_flow_action,
      NULL
    ),
    (
      v_float_to_working,
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
      v_float_to_working,
      5,
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action,
      NULL
    ),
    (
      v_float_to_working,
      6,
      ARRAY['enter pin'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

  -- ============================================================
  -- Working Account -> Merchant Account
  -- Current live path:
  --   *110#
  --   1 Send Money
  --   4 Transfer to Merchant Account
  --   Enter Amount
  --   Transfer GHS... from Working Account to Merchant Account
  --   Enter 1 to confirm or 0 to cancel
  --   Enter Operator ID
  --   Enter PIN
  -- ============================================================

  SELECT COUNT(*)
  INTO v_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'working_to_float'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'agent'
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE;

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one active Global Telecel Agent working_to_float flow; found %',
      v_count;
  END IF;

  SELECT id
  INTO v_working_to_float
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'working_to_float'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'agent'
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE;

  UPDATE ussd_flows
  SET dial_code = '*110#',
      success_markers = ARRAY[
        'transferred from working to merchant'
      ],
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
      ]
  WHERE id = v_working_to_float;

  DELETE FROM ussd_flow_steps
  WHERE flow_id = v_working_to_float;

  INSERT INTO ussd_flow_steps (
    flow_id,
    step_order,
    match_all,
    action,
    action_value
  )
  VALUES
    (
      v_working_to_float,
      1,
      ARRAY['send money', 'withdraw cash'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_working_to_float,
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
      v_working_to_float,
      3,
      ARRAY['enter amount'],
      'send_amount'::ussd_flow_action,
      NULL
    ),
    (
      v_working_to_float,
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
      v_working_to_float,
      5,
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action,
      NULL
    ),
    (
      v_working_to_float,
      6,
      ARRAY['enter pin'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

END
$$;
