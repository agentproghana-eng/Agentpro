-- Telecel Personal Send Money (Other Networks)
--
-- Live verified on a Telecel Personal subscriber SIM using *110#:
--
--   *110#
--   1) Send Money
--   2) Other Networks
--
--   Please choose network:
--     1) MTN
--     2) ATMoney
--     3) G-Money
--     4) GhanaPay
--
--   Enter recipient phone number (10-digit)
--   Enter recipient phone number again
--
--   Recipient/name confirmation:
--     1) Confirm
--
--   Enter Amount
--   Enter Reference
--   Enter PIN
--
-- AgentPro automatically confirms the recipient/name screen because the
-- live network menu exposes only "1 Confirm". Automation stops completely
-- at Enter PIN. There is deliberately no post-PIN confirmation action.
--
-- Scope is Global Personal only. No Telecel Agent or Business flow is
-- created or modified.

DO $$
DECLARE
  v_flow_id UUID;
  v_superuser_id UUID;
  v_flow_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_flow_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'send_money_cross_network'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role IS NULL
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE;

  IF v_flow_count > 1 THEN
    RAISE EXCEPTION
      'Expected at most one active Global Telecel Personal cross-network flow; found %',
      v_flow_count;
  END IF;

  IF v_flow_count = 0 THEN
    SELECT id
    INTO v_superuser_id
    FROM users
    WHERE role = 'superuser'
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    IF v_superuser_id IS NULL THEN
      RAISE EXCEPTION
        'Cannot seed Telecel Personal cross-network flow: no superuser exists';
    END IF;

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
      'send_money_cross_network',
      '*110#',
      ARRAY[]::TEXT[],
      ARRAY[]::TEXT[],
      v_superuser_id,
      'interactive'
    )
    RETURNING id INTO v_flow_id;
  ELSE
    SELECT id
    INTO v_flow_id
    FROM ussd_flows
    WHERE provider = 'telecel'
      AND transaction_type = 'send_money_cross_network'
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND business_sim_role IS NULL
      AND COALESCE(bundle_category, '') = ''
      AND COALESCE(recipient_mode, '') = ''
      AND is_active = TRUE;

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
      ARRAY[
        'send money',
        'mahitti promo'
      ],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      2,
      ARRAY[
        'telecel cash user',
        'other networks',
        'cross border payment'
      ],
      'send_digit'::ussd_flow_action,
      '2'
    ),
    (
      v_flow_id,
      3,
      ARRAY[
        'please choose network',
        '1 mtn',
        '2 atmoney',
        '3 g-money',
        '4 ghanapay'
      ],
      'send_selection'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      4,
      ARRAY[
        'enter recipient phone number',
        '10-digit'
      ],
      'send_customer_phone'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      5,
      ARRAY['enter recipient phone number again'],
      'send_customer_phone'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      6,
      ARRAY[
        'you have requested to send money to',
        '1 confirm'
      ],
      'send_digit'::ussd_flow_action,
      '1'
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
      ARRAY['enter reference'],
      'send_reference'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      9,
      ARRAY['enter pin'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );
END
$$;
