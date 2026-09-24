-- Telecel Merchant remaining live USSD flows.
--
-- Merchant Send Money menu:
--   1 Telecel
--   2 Other Networks
--   3 Transfer to Working Account
--   4 Transfer to Merchant Account
--   5 Transfer to Bank
--
-- Scope:
--   send_money_same_network
--   send_money_cross_network
--   send_money_to_bank
--   float_to_working
--   working_to_float
--
-- PIN is always entered manually.
-- Protected Telecel credentials are resolved at execution time.
-- Personal and Agent flows are deliberately untouched.

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
      'Cannot seed Telecel Merchant remaining flows: no superuser exists';
  END IF;

  -- ============================================================
  -- MERCHANT SEND MONEY -> TELECEL
  -- ============================================================

  SELECT COUNT(*)
  INTO v_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'send_money_same_network'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND is_active = TRUE;

  IF v_count > 1 THEN
    RAISE EXCEPTION
      'Expected at most one active Global Telecel Merchant same-network flow; found %',
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
      'send_money_same_network',
      '*110#',
      ARRAY[]::TEXT[],
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
    SELECT id INTO v_flow_id
    FROM ussd_flows
    WHERE provider = 'telecel'
      AND transaction_type = 'send_money_same_network'
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND business_sim_role = 'merchant'
      AND is_active = TRUE;

    UPDATE ussd_flows
    SET dial_code = '*110#',
        success_markers = ARRAY[]::TEXT[],
        failure_markers = ARRAY[
          'failed','insufficient','invalid','declined',
          'unsuccessfully','connection problem',
          'transaction cancelled','transaction canceled',
          'cancelled','canceled'
        ],
        execution_mode = 'interactive'
    WHERE id = v_flow_id;
  END IF;

  DELETE FROM ussd_flow_steps WHERE flow_id = v_flow_id;

  INSERT INTO ussd_flow_steps
    (flow_id, step_order, match_all, action, action_value)
  VALUES
    (
      v_flow_id, 1,
      ARRAY['send money', 'withdraw cash'],
      'send_digit'::ussd_flow_action, '1'
    ),
    (
      v_flow_id, 2,
      ARRAY[
        'telecel',
        'other networks',
        'transfer to working account',
        'transfer to merchant account',
        'transfer to bank'
      ],
      'send_digit'::ussd_flow_action, '1'
    ),
    (
      v_flow_id, 3,
      ARRAY['telecel cash user'],
      'send_digit'::ussd_flow_action, '1'
    ),
    (
      v_flow_id, 4,
      ARRAY['enter recipient phone number'],
      'send_customer_phone'::ussd_flow_action, NULL
    ),
    (
      v_flow_id, 5,
      ARRAY['enter amount'],
      'send_amount'::ussd_flow_action, NULL
    ),
    (
      v_flow_id, 6,
      ARRAY['enter reference'],
      'send_reference'::ussd_flow_action, NULL
    ),
    (
      v_flow_id, 7,
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action, NULL
    ),
    (
      v_flow_id, 8,
      ARRAY['enter pin'],
      'pin_prompt'::ussd_flow_action, NULL
    );

  -- ============================================================
  -- MERCHANT SEND MONEY -> OTHER NETWORKS
  -- Network selection is supplied by AgentPro.
  -- ============================================================

  SELECT COUNT(*)
  INTO v_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'send_money_cross_network'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND is_active = TRUE;

  IF v_count > 1 THEN
    RAISE EXCEPTION
      'Expected at most one active Global Telecel Merchant cross-network flow; found %',
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
      'send_money_cross_network',
      '*110#',
      ARRAY[]::TEXT[],
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
    SELECT id INTO v_flow_id
    FROM ussd_flows
    WHERE provider = 'telecel'
      AND transaction_type = 'send_money_cross_network'
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND business_sim_role = 'merchant'
      AND is_active = TRUE;

    UPDATE ussd_flows
    SET dial_code = '*110#',
        success_markers = ARRAY[]::TEXT[],
        failure_markers = ARRAY[
          'failed','insufficient','invalid','declined',
          'unsuccessfully','connection problem',
          'transaction cancelled','transaction canceled',
          'cancelled','canceled'
        ],
        execution_mode = 'interactive'
    WHERE id = v_flow_id;
  END IF;

  DELETE FROM ussd_flow_steps WHERE flow_id = v_flow_id;

  INSERT INTO ussd_flow_steps
    (flow_id, step_order, match_all, action, action_value)
  VALUES
    (
      v_flow_id, 1,
      ARRAY['send money', 'withdraw cash'],
      'send_digit'::ussd_flow_action, '1'
    ),
    (
      v_flow_id, 2,
      ARRAY[
        'telecel',
        'other networks',
        'transfer to working account',
        'transfer to merchant account',
        'transfer to bank'
      ],
      'send_digit'::ussd_flow_action, '2'
    ),
    (
      v_flow_id, 3,
      ARRAY['mtn', 'airteltigo'],
      'send_selection'::ussd_flow_action, NULL
    ),
    (
      v_flow_id, 4,
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action, NULL
    ),
    (
      v_flow_id, 5,
      ARRAY['organisation shortcode'],
      'send_organisation_shortcode'::ussd_flow_action, NULL
    ),
    (
      v_flow_id, 6,
      ARRAY['enter recipient'],
      'send_customer_phone'::ussd_flow_action, NULL
    ),
    (
      v_flow_id, 7,
      ARRAY['confirm'],
      'send_digit'::ussd_flow_action, '1'
    ),
    (
      v_flow_id, 8,
      ARRAY['enter amount'],
      'send_amount'::ussd_flow_action, NULL
    ),
    (
      v_flow_id, 9,
      ARRAY['enter reference'],
      'send_reference'::ussd_flow_action, NULL
    ),
    (
      v_flow_id, 10,
      ARRAY['enter pin'],
      'pin_prompt'::ussd_flow_action, NULL
    ),
    (
      v_flow_id, 11,
      ARRAY['fee', 'confirm'],
      'auto_confirm_once'::ussd_flow_action, '1'
    );

  -- ============================================================
  -- MERCHANT -> BANK
  --
  -- Bank alphabet group and bank selections are transaction selections,
  -- not persisted in this flow definition.
  -- ============================================================

  SELECT COUNT(*)
  INTO v_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'send_money_to_bank'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND is_active = TRUE;

  IF v_count > 1 THEN
    RAISE EXCEPTION
      'Expected at most one active Global Telecel Merchant bank flow; found %',
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
      'send_money_to_bank',
      '*110#',
      ARRAY['confirmed. you have transferred'],
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
    SELECT id INTO v_flow_id
    FROM ussd_flows
    WHERE provider = 'telecel'
      AND transaction_type = 'send_money_to_bank'
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND business_sim_role = 'merchant'
      AND is_active = TRUE;

    UPDATE ussd_flows
    SET dial_code = '*110#',
        success_markers = ARRAY['confirmed. you have transferred'],
        failure_markers = ARRAY[
          'failed','insufficient','invalid','declined',
          'unsuccessfully','connection problem',
          'transaction cancelled','transaction canceled',
          'cancelled','canceled'
        ],
        execution_mode = 'interactive'
    WHERE id = v_flow_id;
  END IF;

  DELETE FROM ussd_flow_steps WHERE flow_id = v_flow_id;

  INSERT INTO ussd_flow_steps
    (flow_id, step_order, match_all, action, action_value)
  VALUES
    (
      v_flow_id,
      1,
      ARRAY['send money'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      2,
      ARRAY['transfer to bank'],
      'send_digit'::ussd_flow_action,
      '5'
    ),
    (
      v_flow_id,
      3,
      ARRAY['select your bank starting with alphabet'],
      'send_selection'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      4,
      ARRAY['select bank'],
      'send_selection'::ussd_flow_action,
      NULL
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
      ARRAY['enter your org shortcode'],
      'send_organisation_shortcode'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      7,
      ARRAY['enter account number'],
      'send_account_number'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      8,
      ARRAY[
        'you have requested to send money to',
        '1 confirm'
      ],
      'auto_confirm_once'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      9,
      ARRAY['enter amount'],
      'send_amount'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      10,
      ARRAY['enter reference'],
      'send_reference'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      11,
      ARRAY['enter pin'],
      'pin_prompt'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      12,
      ARRAY[
        'total fee',
        '1 confirm',
        '2 cancel'
      ],
      'auto_confirm_once'::ussd_flow_action,
      '1'
    );

END
$$;
