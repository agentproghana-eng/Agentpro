-- MTN Personal Pulse / MashUp automation
--
-- Live-confirmed on MTN Ghana using *567#.
--
-- Common entry:
--   1) Proceed to buy bundle
--   1) MashUp for Self OR 2) MashUp for Others
--   Others: Enter Phone Number -> Confirm Phone Number
--   MashUp offers:
--      1) GHC 1
--      2) GHC 5
--      3) GHC 10
--      4) GHC 30
--
-- GHC 1/5/10 use the exact fixed-price option (1) and then allocation.
-- Some allocation options are on the second page reached with 99.
-- GHC 30 goes directly to Buy.
--
-- Payment:
--   1) Airtime
--   2) Mobile Money -> manual PIN prompt
--
-- AgentPro never captures or stores the PIN.
-- Confirmed terminal markers:
--   success: successful, subscribed
--   failure: failed, incomplete, insufficient

DO $$
DECLARE
  superuser_id UUID;
  v_flow_id UUID;
  recipient TEXT;
  tier TEXT;
  page_key TEXT;
  payment TEXT;
  variant TEXT;
  tier_digit TEXT;
  payment_digit TEXT;
  step_no INTEGER;
BEGIN
  SELECT id
  INTO superuser_id
  FROM users
  WHERE role = 'superuser'
  ORDER BY created_at, id
  LIMIT 1;

  IF superuser_id IS NULL THEN
    RAISE EXCEPTION
      'Cannot seed MTN Personal MashUp flows: no superuser exists';
  END IF;

  FOREACH recipient IN ARRAY ARRAY['self', 'other']
  LOOP
    FOREACH tier IN ARRAY ARRAY['ghc1', 'ghc5', 'ghc10', 'ghc30']
    LOOP
      FOREACH payment IN ARRAY ARRAY['airtime', 'momo']
      LOOP
        payment_digit := CASE WHEN payment = 'airtime' THEN '1' ELSE '2' END;

        IF tier = 'ghc30' THEN
          variant := tier || '_' || payment;
          tier_digit := '4';

          SELECT id
          INTO v_flow_id
          FROM ussd_flows
          WHERE provider = 'mtn'
            AND transaction_type = 'buy_mashup'
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
              'buy_mashup',
              '*567#',
              ARRAY['successful', 'subscribed'],
              ARRAY['failed', 'incomplete', 'insufficient', 'only available on mymtn app'],
              superuser_id,
              variant,
              recipient
            )
            RETURNING id INTO v_flow_id;
          ELSE
            UPDATE ussd_flows
            SET dial_code = '*567#',
                success_markers = ARRAY['successful', 'subscribed'],
                failure_markers = ARRAY['failed', 'incomplete', 'insufficient', 'only available on mymtn app']
            WHERE id = v_flow_id;
          END IF;

          DELETE FROM ussd_flow_steps WHERE flow_id = v_flow_id;
          step_no := 1;

          INSERT INTO ussd_flow_steps (
            flow_id, step_order, match_all, action, action_value
          ) VALUES (
            v_flow_id, step_no, ARRAY['proceed to buy bundle'],
            'send_digit'::ussd_flow_action, '1'
          );
          step_no := step_no + 1;

          INSERT INTO ussd_flow_steps (
            flow_id, step_order, match_all, action, action_value
          ) VALUES (
            v_flow_id, step_no, ARRAY['mashup for self', 'mashup for others'],
            'send_digit'::ussd_flow_action,
            CASE WHEN recipient = 'self' THEN '1' ELSE '2' END
          );
          step_no := step_no + 1;

          IF recipient = 'other' THEN
            INSERT INTO ussd_flow_steps (
              flow_id, step_order, match_all, action, action_value
            ) VALUES (
              v_flow_id, step_no, ARRAY['enter phone number'],
              'send_customer_phone'::ussd_flow_action, NULL
            );
            step_no := step_no + 1;

            INSERT INTO ussd_flow_steps (
              flow_id, step_order, match_all, action, action_value
            ) VALUES (
              v_flow_id, step_no, ARRAY['confirm phone number'],
              'send_customer_phone'::ussd_flow_action, NULL
            );
            step_no := step_no + 1;
          END IF;

          INSERT INTO ussd_flow_steps (
            flow_id, step_order, match_all, action, action_value
          ) VALUES (
            v_flow_id, step_no, ARRAY['mashup offers'],
            'send_digit'::ussd_flow_action, tier_digit
          );
          step_no := step_no + 1;

          INSERT INTO ussd_flow_steps (
            flow_id, step_order, match_all, action, action_value
          ) VALUES (
            v_flow_id, step_no, ARRAY['mashup ghc 30 bundle', '1. buy'],
            'send_digit'::ussd_flow_action, '1'
          );
          step_no := step_no + 1;

          INSERT INTO ussd_flow_steps (
            flow_id, step_order, match_all, action, action_value
          ) VALUES (
            v_flow_id, step_no, ARRAY['choose payment mode', 'mobile money'],
            'send_digit'::ussd_flow_action, payment_digit
          );
          step_no := step_no + 1;

          -- MTN presents the PIN prompt after the selected payment method.
          -- PIN entry always remains manual and is never captured by AgentPro.
          INSERT INTO ussd_flow_steps (
            flow_id, step_order, match_all, action, action_value
          ) VALUES (
            v_flow_id, step_no, ARRAY['pin'],
            'pin_prompt'::ussd_flow_action, NULL
          );

        ELSE
          tier_digit := CASE tier
            WHEN 'ghc1' THEN '1'
            WHEN 'ghc5' THEN '2'
            ELSE '3'
          END;

          FOREACH page_key IN ARRAY ARRAY['page1', 'page2']
          LOOP
            variant := tier || '_' || page_key || '_' || payment;
            v_flow_id := NULL;

            SELECT id
            INTO v_flow_id
            FROM ussd_flows
            WHERE provider = 'mtn'
              AND transaction_type = 'buy_mashup'
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
                'buy_mashup',
                '*567#',
                ARRAY['successful', 'subscribed'],
                ARRAY['failed', 'incomplete', 'insufficient', 'only available on mymtn app'],
                superuser_id,
                variant,
                recipient
              )
              RETURNING id INTO v_flow_id;
            ELSE
              UPDATE ussd_flows
              SET dial_code = '*567#',
                  success_markers = ARRAY['successful', 'subscribed'],
                  failure_markers = ARRAY['failed', 'incomplete', 'insufficient', 'only available on mymtn app']
              WHERE id = v_flow_id;
            END IF;

            DELETE FROM ussd_flow_steps WHERE flow_id = v_flow_id;
            step_no := 1;

            INSERT INTO ussd_flow_steps (
              flow_id, step_order, match_all, action, action_value
            ) VALUES (
              v_flow_id, step_no, ARRAY['proceed to buy bundle'],
              'send_digit'::ussd_flow_action, '1'
            );
            step_no := step_no + 1;

            INSERT INTO ussd_flow_steps (
              flow_id, step_order, match_all, action, action_value
            ) VALUES (
              v_flow_id, step_no, ARRAY['mashup for self', 'mashup for others'],
              'send_digit'::ussd_flow_action,
              CASE WHEN recipient = 'self' THEN '1' ELSE '2' END
            );
            step_no := step_no + 1;

            IF recipient = 'other' THEN
              INSERT INTO ussd_flow_steps (
                flow_id, step_order, match_all, action, action_value
              ) VALUES (
                v_flow_id, step_no, ARRAY['enter phone number'],
                'send_customer_phone'::ussd_flow_action, NULL
              );
              step_no := step_no + 1;

              INSERT INTO ussd_flow_steps (
                flow_id, step_order, match_all, action, action_value
              ) VALUES (
                v_flow_id, step_no, ARRAY['confirm phone number'],
                'send_customer_phone'::ussd_flow_action, NULL
              );
              step_no := step_no + 1;
            END IF;

            INSERT INTO ussd_flow_steps (
              flow_id, step_order, match_all, action, action_value
            ) VALUES (
              v_flow_id, step_no, ARRAY['mashup offers'],
              'send_digit'::ussd_flow_action, tier_digit
            );
            step_no := step_no + 1;

            -- Select the fixed GHC 1 / 5 / 10 offer rather than the
            -- custom amount range. All three live-confirmed menus use 1.
            INSERT INTO ussd_flow_steps (
              flow_id, step_order, match_all, action, action_value
            ) VALUES (
              v_flow_id, step_no, ARRAY['enter amount ghc'],
              'send_digit'::ussd_flow_action, '1'
            );
            step_no := step_no + 1;

            IF page_key = 'page2' THEN
              INSERT INTO ussd_flow_steps (
                flow_id, step_order, match_all, action, action_value
              ) VALUES (
                v_flow_id, step_no, ARRAY['99. more'],
                'send_digit'::ussd_flow_action, '99'
              );
              step_no := step_no + 1;

              INSERT INTO ussd_flow_steps (
                flow_id, step_order, match_all, action, action_value
              ) VALUES (
                v_flow_id, step_no, ARRAY['0. back'],
                'send_selection'::ussd_flow_action, NULL
              );
            ELSE
              INSERT INTO ussd_flow_steps (
                flow_id, step_order, match_all, action, action_value
              ) VALUES (
                v_flow_id, step_no, ARRAY['99. more'],
                'send_selection'::ussd_flow_action, NULL
              );
            END IF;
            step_no := step_no + 1;

            INSERT INTO ussd_flow_steps (
              flow_id, step_order, match_all, action, action_value
            ) VALUES (
              v_flow_id, step_no, ARRAY['choose payment mode', 'mobile money'],
              'send_digit'::ussd_flow_action, payment_digit
            );
            step_no := step_no + 1;

            -- MTN presents the PIN prompt after the selected payment method.
            -- PIN entry always remains manual and is never captured by AgentPro.
            INSERT INTO ussd_flow_steps (
              flow_id, step_order, match_all, action, action_value
            ) VALUES (
              v_flow_id, step_no, ARRAY['pin'],
              'pin_prompt'::ussd_flow_action, NULL
            );
          END LOOP;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END
$$;
