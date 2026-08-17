-- MTN Personal Buy Data
--
-- Confirmed on a live MTN Ghana Personal SIM using *138#.
--
-- Common entry:
--   *138#
--   1) Proceed to buy bundle
--   1) Buy Data Bundle
--   1) Buy For Self
--      OR
--   2) Buy For Others
--      Enter Phone Number
--      Repeat Phone Number
--
-- Bundle menu:
--   1) Flexi (GHS 0.03 - 399)
--   2) GHS 0.50
--   3) GHS 1
--   4) GHS 3
--   99) More
--       5) GHS 10
--       6) GHS 350
--       7) GHS 399
--
-- Flexi:
--   Enter amount
--   1) Buy
--
-- Fixed:
--   1) Buy
--
-- Payment:
--   1) Airtime      -> network purchase confirmation
--   2) Mobile Money -> Enter Mobile Money PIN
--
-- The Mobile Money variants deliberately stop at the manual PIN boundary.
--
-- No success marker is guessed for the Airtime branch because the live
-- verification confirmed a successful-purchase screen but its exact
-- provider text was not captured.

DO $$
DECLARE
  superuser_id UUID;
  v_flow_id UUID;
  recipient TEXT;
  variant TEXT;
  step_no INTEGER;
  payment_digit TEXT;
BEGIN
  SELECT id
  INTO superuser_id
  FROM users
  WHERE role = 'superuser'
  ORDER BY created_at, id
  LIMIT 1;

  IF superuser_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot seed MTN Personal Buy Data flows: no superuser exists';
  END IF;

  FOREACH recipient IN ARRAY ARRAY['self', 'other']
  LOOP
    FOREACH variant IN ARRAY ARRAY[
      'flexi_airtime',
      'flexi_momo',
      'fixed_page1_airtime',
      'fixed_page1_momo',
      'fixed_page2_airtime',
      'fixed_page2_momo'
    ]
    LOOP
      v_flow_id := NULL;

      SELECT id
      INTO v_flow_id
      FROM ussd_flows
      WHERE provider = 'mtn'
        AND transaction_type = 'buy_data'
        AND company_id IS NULL
        AND owner_user_id IS NULL
        AND COALESCE(bundle_category, '') = variant
        AND COALESCE(recipient_mode, '') = recipient
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
          recipient_mode
        )
        VALUES (
          'mtn',
          'buy_data',
          '*138#',
          ARRAY[]::TEXT[],
          ARRAY[]::TEXT[],
          superuser_id,
          variant,
          recipient
        )
        RETURNING id INTO v_flow_id;
      ELSE
        UPDATE ussd_flows
        SET dial_code = '*138#',
            success_markers = ARRAY[]::TEXT[],
            failure_markers = ARRAY[]::TEXT[]
        WHERE id = v_flow_id;
      END IF;

      -- This migration owns these Global MTN Personal Buy Data variants.
      -- Rebuild their steps idempotently so a partially applied deployment
      -- cannot leave an incomplete sequence active.
      DELETE FROM ussd_flow_steps
      WHERE ussd_flow_steps.flow_id = v_flow_id;

      step_no := 1;

      INSERT INTO ussd_flow_steps (
        flow_id, step_order, match_all, action, action_value
      )
      VALUES (
        v_flow_id,
        step_no,
        ARRAY['proceed to buy bundle'],
        'send_digit'::ussd_flow_action,
        '1'
      );
      step_no := step_no + 1;

      INSERT INTO ussd_flow_steps (
        flow_id, step_order, match_all, action, action_value
      )
      VALUES (
        v_flow_id,
        step_no,
        ARRAY['buy data bundle'],
        'send_digit'::ussd_flow_action,
        '1'
      );
      step_no := step_no + 1;

      INSERT INTO ussd_flow_steps (
        flow_id, step_order, match_all, action, action_value
      )
      VALUES (
        v_flow_id,
        step_no,
        ARRAY['buy for self', 'buy for others'],
        'send_digit'::ussd_flow_action,
        CASE WHEN recipient = 'self' THEN '1' ELSE '2' END
      );
      step_no := step_no + 1;

      IF recipient = 'other' THEN
        INSERT INTO ussd_flow_steps (
          flow_id, step_order, match_all, action, action_value
        )
        VALUES (
          v_flow_id,
          step_no,
          ARRAY['enter phone number'],
          'send_customer_phone'::ussd_flow_action,
          NULL
        );
        step_no := step_no + 1;

        INSERT INTO ussd_flow_steps (
          flow_id, step_order, match_all, action, action_value
        )
        VALUES (
          v_flow_id,
          step_no,
          ARRAY['repeat phone number'],
          'send_customer_phone'::ussd_flow_action,
          NULL
        );
        step_no := step_no + 1;
      END IF;

      IF variant LIKE 'flexi_%' THEN
        INSERT INTO ussd_flow_steps (
          flow_id, step_order, match_all, action, action_value
        )
        VALUES (
          v_flow_id,
          step_no,
          ARRAY['select data bundle'],
          'send_digit'::ussd_flow_action,
          '1'
        );
        step_no := step_no + 1;

        INSERT INTO ussd_flow_steps (
          flow_id, step_order, match_all, action, action_value
        )
        VALUES (
          v_flow_id,
          step_no,
          ARRAY['enter amount to buy preferred bundle'],
          'send_amount'::ussd_flow_action,
          NULL
        );
        step_no := step_no + 1;

      ELSIF variant LIKE 'fixed_page1_%' THEN
        INSERT INTO ussd_flow_steps (
          flow_id, step_order, match_all, action, action_value
        )
        VALUES (
          v_flow_id,
          step_no,
          ARRAY['select data bundle'],
          'send_selection'::ussd_flow_action,
          NULL
        );
        step_no := step_no + 1;

      ELSE
        INSERT INTO ussd_flow_steps (
          flow_id, step_order, match_all, action, action_value
        )
        VALUES (
          v_flow_id,
          step_no,
          ARRAY['select data bundle'],
          'send_digit'::ussd_flow_action,
          '99'
        );
        step_no := step_no + 1;

        INSERT INTO ussd_flow_steps (
          flow_id, step_order, match_all, action, action_value
        )
        VALUES (
          v_flow_id,
          step_no,
          ARRAY['0. back'],
          'send_selection'::ussd_flow_action,
          NULL
        );
        step_no := step_no + 1;
      END IF;

      -- Both Flexi and fixed bundles converge on this confirmation.
      INSERT INTO ussd_flow_steps (
        flow_id, step_order, match_all, action, action_value
      )
      VALUES (
        v_flow_id,
        step_no,
        ARRAY['data bundle', '1. buy'],
        'send_digit'::ussd_flow_action,
        '1'
      );
      step_no := step_no + 1;

      payment_digit :=
        CASE WHEN variant LIKE '%_airtime' THEN '1' ELSE '2' END;

      INSERT INTO ussd_flow_steps (
        flow_id, step_order, match_all, action, action_value
      )
      VALUES (
        v_flow_id,
        step_no,
        ARRAY['choose payment mode', 'mobile money'],
        'send_digit'::ussd_flow_action,
        payment_digit
      );
      step_no := step_no + 1;

      IF variant LIKE '%_momo' THEN
        INSERT INTO ussd_flow_steps (
          flow_id, step_order, match_all, action, action_value
        )
        VALUES (
          v_flow_id,
          step_no,
          ARRAY['enter mobile money pin'],
          'pin_prompt'::ussd_flow_action,
          NULL
        );
      END IF;
    END LOOP;
  END LOOP;
END
$$;
