-- Telecel Merchant balance enquiry.
--
-- Verified live Merchant sequence:
--   *110#
--   My Account       -> 8
--   Show Balance     -> 1
--   Enter Operator ID
--   Enter PIN
--   Confirm to query -> 1
--
-- The actual balances arrive separately by T-CASH SMS.
-- Merchant balance enquiry requires Operator ID only.
-- Organisation Shortcode is not part of this flow.

DO $$
DECLARE
  merchant_balance_flow_id UUID;
BEGIN
  -- Find an existing active global Merchant-specific flow first.
  SELECT id
  INTO merchant_balance_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'balance_enquiry'
    AND business_sim_role = 'merchant'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = TRUE
  ORDER BY created_at
  LIMIT 1;

  -- Create the Merchant-specific flow when it does not exist.
  IF merchant_balance_flow_id IS NULL THEN
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      business_sim_role,
      company_id,
      owner_user_id,
      is_active,
      execution_mode,
      success_markers,
      failure_markers
    )
    VALUES (
      'telecel',
      'balance_enquiry',
      '*110#',
      'merchant',
      NULL,
      NULL,
      TRUE,
      'interactive',
      ARRAY[
        'request is processed successfully'
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
      ]
    )
    RETURNING id INTO merchant_balance_flow_id;
  ELSE
    -- Repair only the Merchant-specific flow.
    UPDATE ussd_flows
    SET dial_code = '*110#',
        execution_mode = 'interactive',
        success_markers = ARRAY[
          'request is processed successfully'
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
        ]
    WHERE id = merchant_balance_flow_id;
  END IF;

  DELETE FROM ussd_flow_steps
  WHERE flow_id = merchant_balance_flow_id;

  INSERT INTO ussd_flow_steps (
    flow_id,
    step_order,
    match_all,
    action,
    action_value
  )
  VALUES
    (
      merchant_balance_flow_id,
      1,
      ARRAY['my account'],
      'send_digit'::ussd_flow_action,
      '8'
    ),
    (
      merchant_balance_flow_id,
      2,
      ARRAY['show balance'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      merchant_balance_flow_id,
      3,
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action,
      NULL
    ),
    (
      merchant_balance_flow_id,
      4,
      ARRAY['enter pin'],
      'pin_prompt'::ussd_flow_action,
      NULL
    ),
    (
      merchant_balance_flow_id,
      5,
      ARRAY['confirm to query', '1 ok', '0 cancel'],
      'auto_confirm_once'::ussd_flow_action,
      '1'
    );
END
$$;
