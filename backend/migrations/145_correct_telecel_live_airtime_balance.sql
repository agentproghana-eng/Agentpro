-- Correct the Global Telecel merchant/agent Airtime and Balance flows
-- from live SIM observations captured on 2026-09-23.
--
-- IMPORTANT:
--   * This is a corrective migration. Do not rewrite historical
--     migrations 018, 037 or 083; deployed databases may already
--     have applied them.
--   * Scope is Global Telecel merchant/agent flows only.
--   * Personal Telecel flows are intentionally untouched.
--   * PIN entry remains a secure/manual boundary.
--
-- Live-confirmed Airtime -> Other Phone:
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
-- Live-confirmed Airtime result:
--   Confirmed. You bought GHS... of airtime for ...
--   Your Telecel Cash balance is GHS...
--
-- Live-confirmed Balance:
--   *110#
--   8 My Account
--   1 Show Balance
--   Enter Operator ID
--   Enter PIN
--   Confirm to query? 1 OK / 0 Cancel
--   1
--   Request is processed successfully.
--
-- The actual balances are subsequently delivered by T-CASH SMS:
--   M-Pesa Account For Organization Balance is GHS...
--   Merchant Account Balance is GHS...

DO $$
DECLARE
  airtime_flow_id UUID;
  balance_flow_id UUID;
BEGIN
  -- ============================================================
  -- Airtime -> Other Phone
  -- ============================================================

  SELECT id
  INTO airtime_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'airtime'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = TRUE
  ORDER BY created_at
  LIMIT 1;

  IF airtime_flow_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot correct Telecel airtime flow: active Global flow missing';
  END IF;

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
      ]
  WHERE id = airtime_flow_id;

  DELETE FROM ussd_flow_steps
  WHERE flow_id = airtime_flow_id;

  INSERT INTO ussd_flow_steps (
    flow_id,
    step_order,
    match_all,
    action,
    action_value
  )
  VALUES
    (
      airtime_flow_id,
      1,
      ARRAY['buy airtime or data'],
      'send_digit'::ussd_flow_action,
      '3'
    ),
    (
      airtime_flow_id,
      2,
      ARRAY['airtime', 'buy data'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      airtime_flow_id,
      3,
      ARRAY['my phone', 'other phone'],
      'send_digit'::ussd_flow_action,
      '2'
    ),
    (
      airtime_flow_id,
      4,
      ARRAY['enter phone number'],
      'send_customer_phone'::ussd_flow_action,
      NULL
    ),
    (
      airtime_flow_id,
      5,
      ARRAY['re-enter phone number'],
      'send_customer_phone'::ussd_flow_action,
      NULL
    ),
    (
      airtime_flow_id,
      6,
      ARRAY['enter amount'],
      'send_amount'::ussd_flow_action,
      NULL
    ),
    (
      airtime_flow_id,
      7,
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action,
      NULL
    ),
    (
      airtime_flow_id,
      8,
      ARRAY['buy airtime of ghs', 'enter pin to confirm'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

  -- ============================================================
  -- Balance Enquiry
  -- ============================================================

  SELECT id
  INTO balance_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'balance_enquiry'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND is_active = TRUE
  ORDER BY created_at
  LIMIT 1;

  IF balance_flow_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot correct Telecel balance flow: active Global flow missing';
  END IF;

  UPDATE ussd_flows
  SET dial_code = '*110#',
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
  WHERE id = balance_flow_id;

  DELETE FROM ussd_flow_steps
  WHERE flow_id = balance_flow_id;

  INSERT INTO ussd_flow_steps (
    flow_id,
    step_order,
    match_all,
    action,
    action_value
  )
  VALUES
    (
      balance_flow_id,
      1,
      ARRAY['my account'],
      'send_digit'::ussd_flow_action,
      '8'
    ),
    (
      balance_flow_id,
      2,
      ARRAY['show balance'],
      'send_digit'::ussd_flow_action,
      '1'
    ),
    (
      balance_flow_id,
      3,
      ARRAY['enter operator id'],
      'send_operator_id'::ussd_flow_action,
      NULL
    ),
    (
      balance_flow_id,
      4,
      ARRAY['enter pin'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );

END
$$;
