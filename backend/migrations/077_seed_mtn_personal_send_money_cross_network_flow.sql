-- MTN Personal Send Money (Other Network)
--
-- Confirmed on a live MTN Personal MoMo SIM using *170#:
--
--   *170#
--   5) Other Networks
--
--   Recipient network:
--     1) AT
--     2) Telecel
--     3) E-zwich
--     4) G-Money
--     5) Zeepay
--     6) GhanaPay
--
--   Enter mobile number
--   Confirm Mobile Number
--   Enter Amount to Transfer
--   Enter Reference ID
--   Enter MM PIN
--
-- The destination network is supplied dynamically by Flutter through
-- the existing send_selection action.
--
-- No success/failure markers are seeded yet because the live verification
-- deliberately stopped at the PIN boundary.
--
-- There is NO post-PIN auto_confirm_once action.

-- ussd_flows.created_by is NOT NULL. Never allow this seed migration to
-- be recorded as successfully applied while silently inserting no flow.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    WHERE role = 'superuser'
  ) THEN
    RAISE EXCEPTION
      'Cannot seed MTN Personal cross-network USSD flow: no superuser exists';
  END IF;
END
$$;

INSERT INTO ussd_flows (
  provider,
  transaction_type,
  dial_code,
  success_markers,
  failure_markers,
  created_by
)
SELECT
  'mtn',
  'send_money_cross_network',
  '*170#',
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  (
    SELECT id
    FROM users
    WHERE role = 'superuser'
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider = 'mtn'
    AND transaction_type = 'send_money_cross_network'
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
FROM ussd_flows f,
(
  VALUES
    (
      1,
      ARRAY[
        'momo user',
        'other networks',
        'bank account'
      ],
      'send_digit',
      '5'
    ),
    (
      2,
      ARRAY[
        'transfer money to other network',
        'telecel',
        'ghanapay'
      ],
      'send_selection',
      NULL
    ),
    (
      3,
      ARRAY['enter mobile number'],
      'send_customer_phone',
      NULL
    ),
    (
      4,
      ARRAY['confirm mobile number'],
      'send_customer_phone',
      NULL
    ),
    (
      5,
      ARRAY['enter amount to transfer'],
      'send_amount',
      NULL
    ),
    (
      6,
      ARRAY['enter reference id'],
      'send_reference',
      NULL
    ),
    (
      7,
      ARRAY['enter mm pin'],
      'pin_prompt',
      NULL
    )
) s(step_order, match_all, action, action_value)
WHERE f.provider = 'mtn'
  AND f.transaction_type = 'send_money_cross_network'
  AND f.company_id IS NULL
  AND f.owner_user_id IS NULL
  AND COALESCE(f.bundle_category, '') = ''
  AND COALESCE(f.recipient_mode, '') = ''
  AND f.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps
    WHERE flow_id = f.id
  );
