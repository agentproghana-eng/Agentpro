-- Restore the five Telecel Personal data categories that are visible
-- on the live *110# Data Bundles category screen but were intentionally
-- omitted from migration 107 because their changing package submenus had
-- not been recovered.
--
-- Live-confirmed category menu:
--   1. Flexi
--   2. 2Moorch No Expiry
--   3. Daily / Bossu        (already migration 107)
--   4. Weekly
--   5. Monthly / Jumbo
--   6. Night King
--
-- For the five restored categories AgentPro automates only the stable path
-- through the chosen category. The changing package/payment menus belong
-- to the user. `await_user_selection` with action_value `until_pin` tells
-- the Android runtime to stay strictly read-only until an Enter PIN screen.
--
-- M4M is a separate *530# flow and is intentionally untouched.

DO $$
DECLARE
  superuser_id UUID;
  v_flow_id UUID;
  v_category TEXT;
  v_category_digit TEXT;
  v_recipient TEXT;
BEGIN
  SELECT id
  INTO superuser_id
  FROM users
  WHERE role = 'superuser'
  ORDER BY created_at
  LIMIT 1;

  IF superuser_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot seed Telecel Personal data categories: no superuser exists';
  END IF;

  FOR v_category, v_category_digit IN
    SELECT category, digit
    FROM (
      VALUES
        ('flexi', '1'),
        ('2moorch', '2'),
        ('weekly', '4'),
        ('monthly', '5'),
        ('night', '6')
    ) AS categories(category, digit)
  LOOP
    FOREACH v_recipient IN ARRAY ARRAY['self', 'other']
    LOOP
      v_flow_id := NULL;

      SELECT id
      INTO v_flow_id
      FROM ussd_flows
      WHERE provider = 'telecel'
        AND transaction_type = 'buy_data'
        AND company_id IS NULL
        AND owner_user_id IS NULL
        AND business_sim_role IS NULL
        AND COALESCE(bundle_category, '') = v_category
        AND COALESCE(recipient_mode, '') = v_recipient
        AND is_active = TRUE
      LIMIT 1;

      IF v_flow_id IS NULL THEN
        INSERT INTO ussd_flows (
          provider,
          transaction_type,
          dial_code,
          success_markers,
          failure_markers,
          created_by,
          bundle_category,
          recipient_mode,
          execution_mode
        )
        VALUES (
          'telecel',
          'buy_data',
          '*110#',
          ARRAY[]::TEXT[],
          ARRAY['insufficient', 'cancelled']::TEXT[],
          superuser_id,
          v_category,
          v_recipient,
          'interactive'
        )
        RETURNING id INTO v_flow_id;
      ELSE
        UPDATE ussd_flows
        SET dial_code = '*110#',
            success_markers = ARRAY[]::TEXT[],
            failure_markers = ARRAY['insufficient', 'cancelled']::TEXT[],
            execution_mode = 'interactive'
        WHERE id = v_flow_id;
      END IF;

      DELETE FROM ussd_flow_steps
      WHERE flow_id = v_flow_id;

      IF v_recipient = 'self' THEN
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
            ARRAY['send money', 'withdraw cash', 'airtime and bundles'],
            'send_digit'::ussd_flow_action,
            '3'
          ),
          (
            v_flow_id,
            2,
            ARRAY['buy airtime', 'data bundles', 'special offers'],
            'send_digit'::ussd_flow_action,
            '2'
          ),
          (
            v_flow_id,
            3,
            ARRAY['select option', '1. self', '2. other'],
            'send_digit'::ussd_flow_action,
            '1'
          ),
          (
            v_flow_id,
            4,
            ARRAY['select option', 'flexi', 'night king'],
            'send_digit'::ussd_flow_action,
            v_category_digit
          ),
          (
            v_flow_id,
            5,
            ARRAY['select option'],
            'await_user_selection'::ussd_flow_action,
            'until_pin'
          ),
          (
            v_flow_id,
            6,
            ARRAY['enter pin'],
            'pin_prompt'::ussd_flow_action,
            NULL
          );
      ELSE
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
            ARRAY['send money', 'withdraw cash', 'airtime and bundles'],
            'send_digit'::ussd_flow_action,
            '3'
          ),
          (
            v_flow_id,
            2,
            ARRAY['buy airtime', 'data bundles', 'special offers'],
            'send_digit'::ussd_flow_action,
            '2'
          ),
          (
            v_flow_id,
            3,
            ARRAY['select option', '1. self', '2. other'],
            'send_digit'::ussd_flow_action,
            '2'
          ),
          (
            v_flow_id,
            4,
            ARRAY['choose the receiver', 'enter recipient number', 'my list'],
            'send_digit'::ussd_flow_action,
            '1'
          ),
          (
            v_flow_id,
            5,
            ARRAY['enter recipient phone number'],
            'send_customer_phone'::ussd_flow_action,
            NULL
          ),
          (
            v_flow_id,
            6,
            ARRAY['re-enter phone number'],
            'send_customer_phone'::ussd_flow_action,
            NULL
          ),
          (
            v_flow_id,
            7,
            ARRAY['select option', 'flexi', 'night king'],
            'send_digit'::ussd_flow_action,
            v_category_digit
          ),
          (
            v_flow_id,
            8,
            ARRAY['select option'],
            'await_user_selection'::ussd_flow_action,
            'until_pin'
          ),
          (
            v_flow_id,
            9,
            ARRAY['enter pin'],
            'pin_prompt'::ussd_flow_action,
            NULL
          );
      END IF;
    END LOOP;
  END LOOP;
END $$;
