-- MTN Personal Send Money - complete current *170# menu sequence
--
-- Migrations 077 and 078 have already been applied in production and
-- therefore remain immutable.
--
-- Live verification now confirms two separate MTN menus:
--
-- First menu:
--   *170#
--   1) Transfer Money
--   2) MoMoPay&Pay Bill
--   3) Airtime&Bundles
--   4) Allow Cash Out
--   5) Financial
--
-- After selecting Transfer Money:
--   1) MoMo User
--   2) Non MoMo User
--   3) Send with Care
--   4) Favorite
--   5) Other Networks
--   6) Bank Account
--
-- Final Same Network sequence:
--   *170#
--   1) Transfer Money
--   1) MoMo User
--   Enter mobile number
--   Confirm number
--   Enter amount
--   Enter reference
--   Enter MM PIN
--
-- Final Other Network sequence:
--   *170#
--   1) Transfer Money
--   5) Other Networks
--   Select recipient network
--   Enter mobile number
--   Confirm Mobile Number
--   Enter Amount to Transfer
--   Enter Reference ID
--   Enter MM PIN
--
-- Both flows stop at the manual PIN boundary.

DO $$
DECLARE
  same_network_count INTEGER;
  cross_network_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO same_network_count
  FROM ussd_flows
  WHERE provider = 'mtn'
    AND transaction_type = 'send_money_same_network'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE;

  SELECT COUNT(*)
  INTO cross_network_count
  FROM ussd_flows
  WHERE provider = 'mtn'
    AND transaction_type = 'send_money_cross_network'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
    AND is_active = TRUE;

  IF same_network_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one active Global MTN Personal same-network flow; found %',
      same_network_count;
  END IF;

  IF cross_network_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one active Global MTN Personal cross-network flow; found %',
      cross_network_count;
  END IF;

  DELETE FROM ussd_flow_steps
  WHERE flow_id IN (
    SELECT id
    FROM ussd_flows
    WHERE provider = 'mtn'
      AND transaction_type IN (
        'send_money_same_network',
        'send_money_cross_network'
      )
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND COALESCE(bundle_category, '') = ''
      AND COALESCE(recipient_mode, '') = ''
      AND is_active = TRUE
  );

  INSERT INTO ussd_flow_steps (
    flow_id,
    step_order,
    match_all,
    action,
    action_value
  )
  SELECT
    f.id,
    s.step_order,
    s.match_all,
    s.action::ussd_flow_action,
    s.action_value
  FROM ussd_flows AS f,
  (
    VALUES
      (
        1,
        ARRAY['transfer money'],
        'send_digit',
        '1'
      ),
      (
        2,
        ARRAY[
          'momo user',
          'other networks',
          'bank account'
        ],
        'send_digit',
        '1'
      ),
      (
        3,
        ARRAY['enter mobile number'],
        'send_customer_phone',
        NULL
      ),
      (
        4,
        ARRAY['confirm number'],
        'send_customer_phone',
        NULL
      ),
      (
        5,
        ARRAY['enter amount'],
        'send_amount',
        NULL
      ),
      (
        6,
        ARRAY['enter reference'],
        'send_reference',
        NULL
      ),
      (
        7,
        ARRAY['enter mm pin'],
        'pin_prompt',
        NULL
      )
  ) AS s(step_order, match_all, action, action_value)
  WHERE f.provider = 'mtn'
    AND f.transaction_type = 'send_money_same_network'
    AND f.company_id IS NULL
    AND f.owner_user_id IS NULL
    AND COALESCE(f.bundle_category, '') = ''
    AND COALESCE(f.recipient_mode, '') = ''
    AND f.is_active = TRUE;

  INSERT INTO ussd_flow_steps (
    flow_id,
    step_order,
    match_all,
    action,
    action_value
  )
  SELECT
    f.id,
    s.step_order,
    s.match_all,
    s.action::ussd_flow_action,
    s.action_value
  FROM ussd_flows AS f,
  (
    VALUES
      (
        1,
        ARRAY['transfer money'],
        'send_digit',
        '1'
      ),
      (
        2,
        ARRAY[
          'momo user',
          'other networks',
          'bank account'
        ],
        'send_digit',
        '5'
      ),
      (
        3,
        ARRAY[
          'transfer money to other network',
          'telecel',
          'ghanapay'
        ],
        'send_selection',
        NULL
      ),
      (
        4,
        ARRAY['enter mobile number'],
        'send_customer_phone',
        NULL
      ),
      (
        5,
        ARRAY['confirm mobile number'],
        'send_customer_phone',
        NULL
      ),
      (
        6,
        ARRAY['enter amount to transfer'],
        'send_amount',
        NULL
      ),
      (
        7,
        ARRAY['enter reference id'],
        'send_reference',
        NULL
      ),
      (
        8,
        ARRAY['enter mm pin'],
        'pin_prompt',
        NULL
      )
  ) AS s(step_order, match_all, action, action_value)
  WHERE f.provider = 'mtn'
    AND f.transaction_type = 'send_money_cross_network'
    AND f.company_id IS NULL
    AND f.owner_user_id IS NULL
    AND COALESCE(f.bundle_category, '') = ''
    AND COALESCE(f.recipient_mode, '') = ''
    AND f.is_active = TRUE;
END
$$;
