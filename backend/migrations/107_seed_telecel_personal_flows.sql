-- Restore the historically recovered Telecel Personal USSD flows.
--
-- Source:
--   recovered historical AgentPro PostgreSQL flow definitions.
--
-- Scope is intentionally Personal-only:
--   - Send Money · Same Network
--   - Withdraw Cash
--   - Buy Airtime · Other Telecel Number
--   - Buy Data · Daily · Self
--   - Buy Data · Daily · Other
--
-- Deliberately NOT restored because no historical Personal definition
-- was recovered:
--   - cross-network Send Money
--   - Personal balance checks
--   - Flexi / 2Moorch / Weekly / Monthly / Night data variants
--
-- No Telecel Agent or Business flow is modified by this migration.

DO $$
DECLARE
  superuser_id UUID;
  v_flow_id UUID;
BEGIN
  SELECT id
  INTO superuser_id
  FROM users
  WHERE role = 'superuser'
  ORDER BY created_at
  LIMIT 1;

  IF superuser_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot seed Telecel Personal flows: no superuser exists';
  END IF;

  -- ============================================================
  -- Telecel Personal: Send Money · Same Network
  --
  -- *110#
  -- 1
  -- 1
  -- recipient
  -- recipient again
  -- amount
  -- reference
  -- PIN
  -- ============================================================

  v_flow_id := NULL;

  SELECT id
  INTO v_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'send_money_same_network'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role IS NULL
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE
  LIMIT 1;

  IF v_flow_id IS NULL THEN
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      success_markers,
      failure_markers,
      created_by,
      execution_mode
    )
    VALUES (
      'telecel',
      'send_money_same_network',
      '*110#',
      ARRAY['confirmed'],
      ARRAY[
        'connection problem',
        'insufficient',
        'cancelled the request',
        'should be 10 digits'
      ],
      superuser_id,
      'interactive'
    )
    RETURNING id INTO v_flow_id;
  ELSE
    UPDATE ussd_flows
    SET dial_code = '*110#',
        success_markers = ARRAY['confirmed'],
        failure_markers = ARRAY[
          'connection problem',
          'insufficient',
          'cancelled the request',
          'should be 10 digits'
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
      ARRAY['mahitti promo'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      2,
      ARRAY['telecel cash user', 'cross border pay'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      3,
      ARRAY['enter recipient phone number'],
      'send_customer_phone'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      4,
      ARRAY['re-enter recipient number'],
      'send_customer_phone'::ussd_flow_action,
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
      ARRAY['enter reference'],
      'send_reference'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      7,
      ARRAY['enter pin'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

  -- ============================================================
  -- Telecel Personal: Withdraw Cash
  --
  -- *110#
  -- 2
  -- 1
  -- amount
  -- till
  -- till again
  -- PIN
  -- ============================================================

  v_flow_id := NULL;

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
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      success_markers,
      failure_markers,
      created_by,
      execution_mode
    )
    VALUES (
      'telecel',
      'withdraw_cash',
      '*110#',
      ARRAY['confirmed'],
      ARRAY[
        'connection problem',
        'insufficient',
        'cancelled the request'
      ],
      superuser_id,
      'interactive'
    )
    RETURNING id INTO v_flow_id;
  ELSE
    UPDATE ussd_flows
    SET dial_code = '*110#',
        success_markers = ARRAY['confirmed'],
        failure_markers = ARRAY[
          'connection problem',
          'insufficient',
          'cancelled the request'
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
      ARRAY['enter amount'],
      'send_amount'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      4,
      ARRAY['enter till no'],
      'send_merchant_id'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      5,
      ARRAY['re-enter till number'],
      'send_merchant_id'::ussd_flow_action,
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
  -- Telecel Personal: Buy Airtime · Other Telecel Number
  -- ============================================================

  v_flow_id := NULL;

  SELECT id
  INTO v_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'buy_airtime'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role IS NULL
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE
  LIMIT 1;

  IF v_flow_id IS NULL THEN
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      success_markers,
      failure_markers,
      created_by,
      execution_mode
    )
    VALUES (
      'telecel',
      'buy_airtime',
      '*110#',
      ARRAY['confirmed'],
      ARRAY[
        'connection problem',
        'insufficient',
        'cancelled the request'
      ],
      superuser_id,
      'interactive'
    )
    RETURNING id INTO v_flow_id;
  ELSE
    UPDATE ussd_flows
    SET dial_code = '*110#',
        success_markers = ARRAY['confirmed'],
        failure_markers = ARRAY[
          'connection problem',
          'insufficient',
          'cancelled the request'
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
      ARRAY['mahitti promo'],
      'send_digit'::ussd_flow_action,
      '3'
    ),
    (
      v_flow_id,
      2,
      ARRAY['buy airtime', 'data bundles', 'special offers'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      3,
      ARRAY['my phone', 'other telecel number'],
      'send_digit'::ussd_flow_action,
      '2'
    ),
    (
      v_flow_id,
      4,
      ARRAY['to enter recipient number', 'my list'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      5,
      ARRAY['enter phone number'],
      'send_customer_phone'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      6,
      ARRAY['re-enter phone number'],
      'send_customer_phone'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      7,
      ARRAY['enter amount'],
      'send_amount'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      8,
      ARRAY['enter pin to confirm'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

  -- ============================================================
  -- Telecel Personal: Buy Data · Daily · Self
  -- ============================================================

  v_flow_id := NULL;

  SELECT id
  INTO v_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'buy_data'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role IS NULL
    AND COALESCE(bundle_category, '') = 'daily'
    AND COALESCE(recipient_mode, '') = 'self'
    AND is_active = TRUE
  LIMIT 1;

  IF v_flow_id IS NULL THEN
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      success_markers,
      failure_markers,
      created_by,
      bundle_category,
      recipient_mode,
      execution_mode
    )
    VALUES (
      'telecel',
      'buy_data',
      '*110#',
      ARRAY[]::TEXT[],
      ARRAY[]::TEXT[],
      superuser_id,
      'daily',
      'self',
      'interactive'
    )
    RETURNING id INTO v_flow_id;
  ELSE
    UPDATE ussd_flows
    SET dial_code = '*110#',
        success_markers = ARRAY[]::TEXT[],
        failure_markers = ARRAY[]::TEXT[],
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
      ARRAY['send money', 'withdraw cash', 'airtime and bundles'],
      'send_digit'::ussd_flow_action,
      '3'
    ),
    (
      v_flow_id,
      2,
      ARRAY['buy airtime', 'data bundles', 'special offers'],
      'send_digit'::ussd_flow_action,
      '2'
    ),
    (
      v_flow_id,
      3,
      ARRAY['select option', '1. self', '2. other'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      4,
      ARRAY['select option', 'flexi', 'night king'],
      'send_digit'::ussd_flow_action,
      '3'
    ),
    (
      v_flow_id,
      5,
      ARRAY['50mb @ghs1', '111mb @ghs2'],
      'send_selection'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      6,
      ARRAY['e-levy tax is ghs0.00', 'enter pin to confirm'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

  -- ============================================================
  -- Telecel Personal: Buy Data · Daily · Other
  -- ============================================================

  v_flow_id := NULL;

  SELECT id
  INTO v_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'buy_data'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role IS NULL
    AND COALESCE(bundle_category, '') = 'daily'
    AND COALESCE(recipient_mode, '') = 'other'
    AND is_active = TRUE
  LIMIT 1;

  IF v_flow_id IS NULL THEN
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      success_markers,
      failure_markers,
      created_by,
      bundle_category,
      recipient_mode,
      execution_mode
    )
    VALUES (
      'telecel',
      'buy_data',
      '*110#',
      ARRAY[]::TEXT[],
      ARRAY[]::TEXT[],
      superuser_id,
      'daily',
      'other',
      'interactive'
    )
    RETURNING id INTO v_flow_id;
  ELSE
    UPDATE ussd_flows
    SET dial_code = '*110#',
        success_markers = ARRAY[]::TEXT[],
        failure_markers = ARRAY[]::TEXT[],
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
      ARRAY['send money', 'withdraw cash', 'airtime and bundles'],
      'send_digit'::ussd_flow_action,
      '3'
    ),
    (
      v_flow_id,
      2,
      ARRAY['buy airtime', 'data bundles', 'special offers'],
      'send_digit'::ussd_flow_action,
      '2'
    ),
    (
      v_flow_id,
      3,
      ARRAY['select option', '1. self', '2. other'],
      'send_digit'::ussd_flow_action,
      '2'
    ),
    (
      v_flow_id,
      4,
      ARRAY['choose the receiver', 'enter recipient number', 'my list'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      5,
      ARRAY['enter recipient phone number'],
      'send_customer_phone'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      6,
      ARRAY['re-enter phone number'],
      'send_customer_phone'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      7,
      ARRAY['select option', 'flexi', 'night king'],
      'send_digit'::ussd_flow_action,
      '3'
    ),
    (
      v_flow_id,
      8,
      ARRAY['50mb @ghs1', '111mb @ghs2'],
      'send_selection'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      9,
      ARRAY['e-levy tax is ghs0.00', 'enter pin to confirm'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );
END
$$;
