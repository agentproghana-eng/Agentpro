-- MTN Personal Send Money -> Bank Account (wallet to bank, GHIPSS).
--
-- Reuses the existing 'send_money_to_bank' transaction type and its
-- personal capability row (seeded for Telecel in migration 111), so no new
-- enum value is needed.
--
-- Visible AgentPro form: Bank, Account Number, Amount, Reference.
--
-- Provider navigation (hidden from the user):
--   *170# -> 1 Transfer Money -> 6 Bank Account
--   -> 1 Wallet to Bank Account
--   -> bank list: the bank's number is typed directly (the provider accepts
--      the number from the first page, no "#" paging needed)
--   -> Enter Bank Account Number -> Confirm Bank Account Number
--   -> Enter Amount to Transfer -> Enter Reference ID
--   -> details screen, which is the PIN screen
--
-- Automation stops at the PIN screen. There is deliberately no action after
-- pin_prompt. The account number is transaction input only and is never part
-- of a flow action_value.

DO $$
DECLARE
  v_flow_id UUID;
  v_superuser_id UUID;
  v_flow_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_flow_count
  FROM ussd_flows
  WHERE provider = 'mtn'
    AND transaction_type = 'send_money_to_bank'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role IS NULL
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE;

  IF v_flow_count > 1 THEN
    RAISE EXCEPTION
      'Expected at most one active Global MTN Personal bank-transfer flow; found %',
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
        'Cannot seed MTN Personal bank-transfer flow: no superuser exists';
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
      'mtn',
      'send_money_to_bank',
      '*170#',
      ARRAY['sent to']::TEXT[],
      ARRAY[]::TEXT[],
      v_superuser_id,
      'interactive'
    )
    RETURNING id INTO v_flow_id;
  ELSE
    SELECT id
    INTO v_flow_id
    FROM ussd_flows
    WHERE provider = 'mtn'
      AND transaction_type = 'send_money_to_bank'
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND business_sim_role IS NULL
      AND COALESCE(bundle_category, '') = ''
      AND COALESCE(recipient_mode, '') = ''
      AND is_active = TRUE;

    UPDATE ussd_flows
    SET dial_code = '*170#',
        success_markers = ARRAY['sent to']::TEXT[],
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
    (v_flow_id, 1,
      ARRAY['transfer money', 'momopay&pay bill', 'airtime&bundles', 'allow cash out'],
      'send_digit'::ussd_flow_action, '1'),
    (v_flow_id, 2,
      ARRAY['momo user', 'non momo user', 'bank account'],
      'send_digit'::ussd_flow_action, '6'),
    (v_flow_id, 3,
      ARRAY['ghipss banks transfer service', 'wallet to bank account'],
      'send_digit'::ussd_flow_action, '1'),
    (v_flow_id, 4,
      ARRAY['please select the bank', '1) stanchart'],
      'send_selection'::ussd_flow_action, NULL),
    (v_flow_id, 5,
      ARRAY['enter bank account number'],
      'send_account_number'::ussd_flow_action, NULL),
    (v_flow_id, 6,
      ARRAY['confirm bank account number'],
      'send_account_number'::ussd_flow_action, NULL),
    (v_flow_id, 7,
      ARRAY['enter amount to transfer'],
      'send_amount'::ussd_flow_action, NULL),
    (v_flow_id, 8,
      ARRAY['enter reference id'],
      'send_reference'::ussd_flow_action, NULL),
    (v_flow_id, 9,
      ARRAY['transfer to', 'transaction fee amount is', 'tax amount is'],
      'pin_prompt'::ussd_flow_action, NULL);
END
$$;
