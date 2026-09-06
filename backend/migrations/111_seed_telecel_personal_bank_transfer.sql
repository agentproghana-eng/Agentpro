-- Telecel Personal Send Money -> To Bank Account
--
-- Live verified on a Telecel Personal subscriber SIM using *110#.
--
-- Visible AgentPro form:
--   Bank Name
--   Account Number
--   Amount
--   Reference
--
-- Provider navigation is hidden from the user:
--
--   *110#
--   1) Send Money
--   3) To Bank Account
--   -> select alphabet group
--   -> select bank
--   -> Enter Account Number
--   -> Enter recipient account number again
--   -> recipient account/name screen: 1 Confirm
--   -> Please input Amount
--   -> Enter Reference
--   -> Enter PIN
--
-- AgentPro automatically sends the pre-PIN "1 Confirm" after Telecel resolves
-- the bank account holder. Automation stops completely at Enter PIN.
--
-- There is deliberately no action after pin_prompt.
--
-- The account number remains transaction input only. It is not persisted by
-- this migration and is never part of a flow action_value.

INSERT INTO ussd_flow_capabilities (
  transaction_type,
  account_mode,
  display_label,
  can_initiate
)
VALUES (
  'send_money_to_bank',
  'personal',
  'Send Money to Bank',
  TRUE
)
ON CONFLICT (transaction_type, account_mode) DO UPDATE
SET
  display_label = EXCLUDED.display_label,
  is_active = TRUE,
  can_initiate = EXCLUDED.can_initiate,
  updated_at = NOW();

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
    AND transaction_type = 'send_money_to_bank'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role IS NULL
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE;

  IF v_flow_count > 1 THEN
    RAISE EXCEPTION
      'Expected at most one active Global Telecel Personal bank-transfer flow; found %',
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
        'Cannot seed Telecel Personal bank-transfer flow: no superuser exists';
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
      'send_money_to_bank',
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
      AND transaction_type = 'send_money_to_bank'
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
        'to bank account',
        'cross border payment'
      ],
      'send_digit'::ussd_flow_action,
      '3'
    ),
    (
      v_flow_id,
      3,
      ARRAY[
        'select your bank starting with alphabet',
        '1 a-d',
        '2 e-f',
        '3 g-r',
        '4 s-z'
      ],
      'send_selection'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      4,
      ARRAY[
        'select bank',
        '0 back'
      ],
      'send_selection'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      5,
      ARRAY['enter account number'],
      'send_account_number'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      6,
      ARRAY['enter recipient account number again'],
      'send_account_number'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      7,
      ARRAY['1 confirm'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      v_flow_id,
      8,
      ARRAY['please input amount'],
      'send_amount'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      9,
      ARRAY['enter reference'],
      'send_reference'::ussd_flow_action,
      NULL
    ),
    (
      v_flow_id,
      10,
      ARRAY['enter pin'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );
END
$$;
