-- Telecel Personal M4M payment automation correction.
--
-- Desired boundary:
--   *530#
--   -> changing live M4M offer list
--      USER chooses the live offer manually
--   -> 1. Airtime / 2. Telecel Cash
--      AgentPro submits the payment option selected before dialing
--   -> Airtime branch remains PIN-less
--   -> Telecel Cash:
--        STOP at the provider PIN prompt for manual PIN entry
--
-- Migration 113 intentionally made both M4M menus manual. That migration
-- has already shipped, so this corrective migration replaces only the
-- final M4M step configuration without rewriting migration history.
--
-- Live offer values remain provider-controlled and are never persisted.

DO $$
DECLARE
  v_m4m_flow_id UUID;
BEGIN
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
    RAISE EXCEPTION
      'Migration 116 requires the Global Telecel Personal M4M flow';
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
      'send_selection'::ussd_flow_action,
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
