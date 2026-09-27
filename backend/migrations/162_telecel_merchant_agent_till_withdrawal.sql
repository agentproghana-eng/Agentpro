-- Live-confirmed Telecel Merchant withdrawal from an external Agent Till.
--
-- Captured from a Telecel Merchant SIM on 2026-09-27.
--
-- *110#
-- 2 Withdraw Cash
-- 1 From Agent
-- 1 Agent Till
-- Enter Till Number
-- Enter Amount
-- Enter Operator ID
-- Enter PIN
-- Business Withdrawal ... Enter 1 to confirm or 0 to cancel
-- 1 Confirm
--
-- Accounting contract:
--   Merchant Working Account  - amount
--   Merchant Account            no movement
--   Agent SIM balances           no movement
--   Agent cash drawer            no movement
--   Agent commission             no movement
--
-- The Till Number identifies an external counterparty only.

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
  ORDER BY created_at
  LIMIT 1;

  IF v_superuser_id IS NULL THEN
    RAISE EXCEPTION
      'Telecel Merchant withdrawal migration requires a superuser';
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'cash_out'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND is_active = TRUE;

  IF v_count > 1 THEN
    RAISE EXCEPTION
      'Expected at most one active Global Telecel Merchant cash_out flow; found %',
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
      'cash_out',
      '*110#',
      ARRAY[
        'confirmed.',
        'successful',
        'successfully'
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
      AND transaction_type = 'cash_out'
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND business_sim_role = 'merchant'
      AND is_active = TRUE;

    UPDATE ussd_flows
    SET dial_code = '*110#',
        success_markers = ARRAY[
          'confirmed.',
          'successful',
          'successfully'
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
      ARRAY['withdraw cash'],
      'send_digit'::ussd_flow_action,
      '2'
    ),
    (
      v_flow_id,
      2,
      ARRAY['withdraw cash', 'from agent', 'from bank'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      3,
      ARRAY['select option', 'agent till', 'agent short code'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      4,
      ARRAY['enter till number'],
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
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      7,
      ARRAY['enter pin'],
      'pin_prompt'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      8,
      ARRAY[
        'business withdrawal',
        'enter 1 to confirm or 0 to cancel'
      ],
      'auto_confirm_once'::ussd_flow_action,
      '1'
    );

  SELECT COUNT(*)
  INTO v_count
  FROM ussd_flow_steps
  WHERE flow_id = v_flow_id;

  IF v_count <> 8 THEN
    RAISE EXCEPTION
      'Telecel Merchant cash_out invariant failed: expected 8 steps, found %',
      v_count;
  END IF;
END
$$;
