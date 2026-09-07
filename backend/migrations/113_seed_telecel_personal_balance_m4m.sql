-- Telecel Ghana Personal live-verified balance + M4M flows.
--
-- Airtime + bundle balance:
--   *124#
--   -> "Main Ac: ..."
--   -> user taps OK manually
--   -> "... Internet bundle: ..."
--
-- M4M:
--   *530#
--   -> changing M4M offer list
--      USER selects the live offer manually
--   -> 1. Airtime / 2. Telecel Cash
--      USER selects payment manually
--   -> Airtime branch is PIN-less
--   -> Telecel Cash branch:
--        "Please enter your PIN ..."
--        STOP: manual PIN entry
--
-- No M4M package amount, allowance, validity or menu digit is persisted in
-- AgentPro because Telecel changes the live offers.
--
-- M4M terminal success/failure wording is intentionally left unconfigured
-- until the Airtime and Telecel Cash branches are separately live-verified.
-- Unknown terminal screens therefore fail closed as pending confirmation
-- rather than being guessed as success or failure.
--
-- No balance value is captured or persisted. The user reads Telecel's own
-- network screen.
--
-- await_user_selection is deliberately zero-write. Migration 112 introduces
-- that enum value in a separate transaction before this migration consumes it.

UPDATE ussd_flow_capabilities
SET
  display_label = 'Check Airtime & Data Balance',
  is_active = TRUE,
  can_initiate = TRUE,
  updated_at = NOW()
WHERE transaction_type = 'check_airtime_balance'
  AND account_mode = 'personal';

DO $$
DECLARE
  v_superuser_id UUID;
  v_balance_flow_id UUID;
  v_m4m_flow_id UUID;
BEGIN
  SELECT id
  INTO v_superuser_id
  FROM users
  WHERE role = 'superuser'
  ORDER BY created_at
  LIMIT 1;

  IF v_superuser_id IS NULL THEN
    RAISE EXCEPTION
      'Migration 113 requires an existing superuser to own Global USSD flows';
  END IF;

  -- ============================================================
  -- TELECEL PERSONAL AIRTIME + DATA BALANCE
  -- ============================================================

  SELECT id
  INTO v_balance_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'check_airtime_balance'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND COALESCE(bundle_category, '') = ''
    AND COALESCE(recipient_mode, '') = ''
  ORDER BY created_at
  LIMIT 1;

  IF v_balance_flow_id IS NULL THEN
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      success_markers,
      failure_markers,
      execution_mode,
      is_active,
      created_by
    )
    VALUES (
      'telecel',
      'check_airtime_balance',
      '*124#',
      ARRAY['internet bundle:'],
      ARRAY[
        'request failed',
        'service unavailable',
        'connection problem'
      ],
      'interactive',
      TRUE,
      v_superuser_id
    )
    RETURNING id INTO v_balance_flow_id;
  ELSE
    UPDATE ussd_flows
    SET
      dial_code = '*124#',
      success_markers = ARRAY['internet bundle:'],
      failure_markers = ARRAY[
        'request failed',
        'service unavailable',
        'connection problem'
      ],
      execution_mode = 'interactive',
      is_active = TRUE,
      created_by = COALESCE(created_by, v_superuser_id)
    WHERE id = v_balance_flow_id;
  END IF;

  DELETE FROM ussd_flow_steps
  WHERE flow_id = v_balance_flow_id;

  INSERT INTO ussd_flow_steps (
    flow_id,
    step_order,
    match_all,
    action,
    action_value
  )
  VALUES (
    v_balance_flow_id,
    1,
    ARRAY['main ac:'],
    'await_user_selection'::ussd_flow_action,
    NULL
  );

  -- ============================================================
  -- TELECEL PERSONAL M4M LIVE OFFERS
  -- ============================================================

  SELECT id
  INTO v_m4m_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'buy_data'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND COALESCE(bundle_category, '') = 'm4m_live'
    AND COALESCE(recipient_mode, '') = 'self'
  ORDER BY created_at
  LIMIT 1;

  IF v_m4m_flow_id IS NULL THEN
    INSERT INTO ussd_flows (
      provider,
      transaction_type,
      dial_code,
      success_markers,
      failure_markers,
      bundle_category,
      recipient_mode,
      execution_mode,
      is_active,
      created_by
    )
    VALUES (
      'telecel',
      'buy_data',
      '*530#',
      ARRAY[]::TEXT[],
      ARRAY[]::TEXT[],
      'm4m_live',
      'self',
      'interactive',
      TRUE,
      v_superuser_id
    )
    RETURNING id INTO v_m4m_flow_id;
  ELSE
    UPDATE ussd_flows
    SET
      dial_code = '*530#',
      success_markers = ARRAY[]::TEXT[],
      failure_markers = ARRAY[]::TEXT[],
      execution_mode = 'interactive',
      is_active = TRUE,
      created_by = COALESCE(created_by, v_superuser_id)
    WHERE id = v_m4m_flow_id;
  END IF;

  DELETE FROM ussd_flow_steps
  WHERE flow_id = v_m4m_flow_id;

  INSERT INTO ussd_flow_steps (
    flow_id,
    step_order,
    match_all,
    action,
    action_value
  )
  VALUES
    (
      v_m4m_flow_id,
      1,
      ARRAY['m4m'],
      'await_user_selection'::ussd_flow_action,
      NULL
    ),
    (
      v_m4m_flow_id,
      2,
      ARRAY[
        '1. airtime',
        '2. telecel cash'
      ],
      'await_user_selection'::ussd_flow_action,
      NULL
    ),
    (
      v_m4m_flow_id,
      3,
      ARRAY[
        'please enter your pin',
        'amount:'
      ],
      'pin_prompt'::ussd_flow_action,
      NULL
    );
END
$$;
