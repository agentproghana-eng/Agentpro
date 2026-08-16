-- MTN Personal Buy Airtime
--
-- Confirmed on a live MTN Personal MoMo SIM using *170#.
--
-- Self:
--   *170#
--   3) Airtime&Bundles
--   1) Airtime
--   1) Self
--   Enter Amount
--   Enter MM PIN
--
-- Others:
--   *170#
--   3) Airtime&Bundles
--   1) Airtime
--   2) Others
--   Enter Amount
--   Enter Mobile Number
--   Repeat Mobile Number
--   Enter MM PIN
--
-- Both flows deliberately stop at the manual PIN boundary.
--
-- No success/failure markers are seeded yet because the live verification
-- stopped safely at the PIN screen and therefore did not observe a final
-- network receipt or failure message.

DO $$
DECLARE
  superuser_id UUID;
  self_count INTEGER;
  other_count INTEGER;
BEGIN
  SELECT id
  INTO superuser_id
  FROM users
  WHERE role = 'superuser'
  ORDER BY created_at, id
  LIMIT 1;

  IF superuser_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot seed MTN Personal airtime flows: no superuser exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM ussd_flows
    WHERE provider = 'mtn'
      AND transaction_type = 'buy_airtime'
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND COALESCE(bundle_category, '') = ''
      AND COALESCE(recipient_mode, '') = 'self'
      AND is_active = TRUE
  ) THEN
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      success_markers,
      failure_markers,
      created_by,
      recipient_mode
    )
    VALUES (
      'mtn',
      'buy_airtime',
      '*170#',
      ARRAY[]::TEXT[],
      ARRAY[]::TEXT[],
      superuser_id,
      'self'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM ussd_flows
    WHERE provider = 'mtn'
      AND transaction_type = 'buy_airtime'
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND COALESCE(bundle_category, '') = ''
      AND COALESCE(recipient_mode, '') = 'other'
      AND is_active = TRUE
  ) THEN
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      success_markers,
      failure_markers,
      created_by,
      recipient_mode
    )
    VALUES (
      'mtn',
      'buy_airtime',
      '*170#',
      ARRAY[]::TEXT[],
      ARRAY[]::TEXT[],
      superuser_id,
      'other'
    );
  END IF;

  SELECT COUNT(*)
  INTO self_count
  FROM ussd_flows
  WHERE provider = 'mtn'
    AND transaction_type = 'buy_airtime'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = 'self'
    AND is_active = TRUE;

  SELECT COUNT(*)
  INTO other_count
  FROM ussd_flows
  WHERE provider = 'mtn'
    AND transaction_type = 'buy_airtime'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = 'other'
    AND is_active = TRUE;

  IF self_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one active Global MTN Personal airtime Self flow; found %',
      self_count;
  END IF;

  IF other_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one active Global MTN Personal airtime Others flow; found %',
      other_count;
  END IF;
END
$$;

-- Self
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
      ARRAY['airtime&bundles'],
      'send_digit',
      '3'
    ),
    (
      2,
      ARRAY['internet bundles', 'fixed broadband', 'schedule airtime'],
      'send_digit',
      '1'
    ),
    (
      3,
      ARRAY['self', 'others', 'welcome pack', 'other networks'],
      'send_digit',
      '1'
    ),
    (
      4,
      ARRAY['enter amount'],
      'send_amount',
      NULL
    ),
    (
      5,
      ARRAY['enter mm pin'],
      'pin_prompt',
      NULL
    )
) AS s(step_order, match_all, action, action_value)
WHERE f.provider = 'mtn'
  AND f.transaction_type = 'buy_airtime'
  AND f.company_id IS NULL
  AND f.owner_user_id IS NULL
  AND COALESCE(f.bundle_category, '') = ''
  AND COALESCE(f.recipient_mode, '') = 'self'
  AND f.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps
    WHERE flow_id = f.id
  );

-- Others
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
      ARRAY['airtime&bundles'],
      'send_digit',
      '3'
    ),
    (
      2,
      ARRAY['internet bundles', 'fixed broadband', 'schedule airtime'],
      'send_digit',
      '1'
    ),
    (
      3,
      ARRAY['self', 'others', 'welcome pack', 'other networks'],
      'send_digit',
      '2'
    ),
    (
      4,
      ARRAY['enter amount'],
      'send_amount',
      NULL
    ),
    (
      5,
      ARRAY['enter mobile number'],
      'send_customer_phone',
      NULL
    ),
    (
      6,
      ARRAY['repeat mobile number'],
      'send_customer_phone',
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
  AND f.transaction_type = 'buy_airtime'
  AND f.company_id IS NULL
  AND f.owner_user_id IS NULL
  AND COALESCE(f.bundle_category, '') = ''
  AND COALESCE(f.recipient_mode, '') = 'other'
  AND f.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps
    WHERE flow_id = f.id
  );
