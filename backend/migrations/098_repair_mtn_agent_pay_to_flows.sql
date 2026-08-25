-- Repair missing MTN Agent Pay to Agent and Pay to Merchant flows.
--
-- Migration 015 introduced these mappings before Business SIM-role
-- isolation existed and depended on a superuser already being present.
-- A deployment can therefore have migration 015 recorded while both
-- rows are absent.
--
-- These definitions remain pending live-device certification. They are
-- deliberately seeded INACTIVE so production runtime cannot resolve them
-- until an operator explicitly activates them after real-device testing.
-- The menu matching below is intentionally stricter than migration 015 so
-- a changed *171# menu fails closed instead of selecting option 1 from an
-- unrelated screen.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    WHERE role = 'superuser'
  ) THEN
    RAISE EXCEPTION
      'Cannot repair MTN Pay To flows: no superuser exists';
  END IF;
END
$$;


-- ============================================================
-- MTN Agent: Pay to Agent
-- transaction_type = bill_payment
-- ============================================================

INSERT INTO ussd_flows (
  provider,
  transaction_type,
  dial_code,
  success_markers,
  failure_markers,
  business_sim_role,
  is_active,
  created_by
)
SELECT
  'mtn',
  'bill_payment',
  '*171#',
  ARRAY[
    'payment made for',
    'successful'
  ],
  ARRAY[
    'failed',
    'incomplete',
    'insufficient'
  ],
  'agent',
  FALSE,
  (
    SELECT id
    FROM users
    WHERE role = 'superuser'
    LIMIT 1
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider = 'mtn'
    AND transaction_type = 'bill_payment'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'agent'
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
        'mainmenuagent',
        '1) pay to'
      ],
      'send_digit',
      '1'
    ),
    (
      2,
      ARRAY[
        'pay to',
        '1) agent'
      ],
      'send_digit',
      '1'
    ),
    (
      3,
      ARRAY[
        'enter mobile number'
      ],
      'send_customer_phone',
      NULL
    ),
    (
      4,
      ARRAY[
        'repeat mobile number'
      ],
      'send_customer_phone',
      NULL
    ),
    (
      5,
      ARRAY[
        'enter amount'
      ],
      'send_amount',
      NULL
    ),
    (
      6,
      ARRAY[
        'reference'
      ],
      'send_reference',
      NULL
    ),
    (
      7,
      ARRAY[
        'enter mm pin'
      ],
      'pin_prompt',
      NULL
    )
) AS s(
  step_order,
  match_all,
  action,
  action_value
)
WHERE f.provider = 'mtn'
  AND f.transaction_type = 'bill_payment'
  AND f.company_id IS NULL
  AND f.owner_user_id IS NULL
  AND f.business_sim_role = 'agent'
  AND f.is_active = FALSE
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps existing
    WHERE existing.flow_id = f.id
  );


-- ============================================================
-- MTN Agent: Pay to Merchant
-- transaction_type = merchant_payment
-- ============================================================

INSERT INTO ussd_flows (
  provider,
  transaction_type,
  dial_code,
  success_markers,
  failure_markers,
  business_sim_role,
  is_active,
  created_by
)
SELECT
  'mtn',
  'merchant_payment',
  '*171#',
  ARRAY[
    'paid to',
    'successful'
  ],
  ARRAY[
    'failed',
    'incomplete',
    'insufficient'
  ],
  'agent',
  FALSE,
  (
    SELECT id
    FROM users
    WHERE role = 'superuser'
    LIMIT 1
  )
WHERE NOT EXISTS (
  SELECT 1
  FROM ussd_flows
  WHERE provider = 'mtn'
    AND transaction_type = 'merchant_payment'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'agent'
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
        'mainmenuagent',
        '1) pay to'
      ],
      'send_digit',
      '1'
    ),
    (
      2,
      ARRAY[
        'pay to',
        '2) merchant'
      ],
      'send_digit',
      '2'
    ),
    (
      3,
      ARRAY[
        'merchant id'
      ],
      'send_merchant_id',
      NULL
    ),
    (
      4,
      ARRAY[
        'enter amount'
      ],
      'send_amount',
      NULL
    ),
    (
      5,
      ARRAY[
        'reference'
      ],
      'send_reference',
      NULL
    ),
    (
      6,
      ARRAY[
        'enter mm pin'
      ],
      'pin_prompt',
      NULL
    )
) AS s(
  step_order,
  match_all,
  action,
  action_value
)
WHERE f.provider = 'mtn'
  AND f.transaction_type = 'merchant_payment'
  AND f.company_id IS NULL
  AND f.owner_user_id IS NULL
  AND f.business_sim_role = 'agent'
  AND f.is_active = FALSE
  AND NOT EXISTS (
    SELECT 1
    FROM ussd_flow_steps existing
    WHERE existing.flow_id = f.id
  );
