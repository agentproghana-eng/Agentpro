-- Correct MTN Personal Pulse / MashUp allocation automation.
--
-- Migration 082 modeled some allocation choices as requiring:
--   99. More -> allocation digit
--
-- Live MTN Ghana verification confirmed that allocation digits 1-5 can
-- be submitted directly from the first allocation response. Option 5
-- may be visually shown after "99. More", but MTN accepts digit 5
-- directly without first sending 99.
--
-- Do not modify migration 082: it may already be applied in production.
-- This migration repairs the existing global fixed GHC 1 / 5 / 10 flows.
--
-- PIN entry remains manual. AgentPro never captures, stores, prefills,
-- logs, or submits a Mobile Money PIN.

DO $$
DECLARE
  flow RECORD;
  tier TEXT;
  tier_digit TEXT;
  payment TEXT;
  payment_digit TEXT;
  step_no INTEGER;
BEGIN
  FOR flow IN
    SELECT
      id,
      bundle_category,
      recipient_mode
    FROM ussd_flows
    WHERE provider = 'mtn'
      AND transaction_type = 'buy_mashup'
      AND company_id IS NULL
      AND owner_user_id IS NULL
      AND is_active = TRUE
      AND bundle_category ~
        '^ghc(1|5|10)_page(1|2)_(airtime|momo)$'
  LOOP
    tier := split_part(flow.bundle_category, '_', 1);
    payment := split_part(flow.bundle_category, '_', 3);

    tier_digit := CASE tier
      WHEN 'ghc1' THEN '1'
      WHEN 'ghc5' THEN '2'
      WHEN 'ghc10' THEN '3'
      ELSE NULL
    END;

    payment_digit := CASE payment
      WHEN 'airtime' THEN '1'
      WHEN 'momo' THEN '2'
      ELSE NULL
    END;

    IF tier_digit IS NULL OR payment_digit IS NULL THEN
      RAISE EXCEPTION
        'Unexpected MTN MashUp flow category: %',
        flow.bundle_category;
    END IF;

    DELETE FROM ussd_flow_steps
    WHERE flow_id = flow.id;

    step_no := 1;

    INSERT INTO ussd_flow_steps (
      flow_id,
      step_order,
      match_all,
      action,
      action_value
    ) VALUES (
      flow.id,
      step_no,
      ARRAY['proceed to buy bundle'],
      'send_digit'::ussd_flow_action,
      '1'
    );
    step_no := step_no + 1;

    INSERT INTO ussd_flow_steps (
      flow_id,
      step_order,
      match_all,
      action,
      action_value
    ) VALUES (
      flow.id,
      step_no,
      ARRAY['mashup for self', 'mashup for others'],
      'send_digit'::ussd_flow_action,
      CASE
        WHEN flow.recipient_mode = 'self' THEN '1'
        ELSE '2'
      END
    );
    step_no := step_no + 1;

    IF flow.recipient_mode = 'other' THEN
      INSERT INTO ussd_flow_steps (
        flow_id,
        step_order,
        match_all,
        action,
        action_value
      ) VALUES (
        flow.id,
        step_no,
        ARRAY['enter phone number'],
        'send_customer_phone'::ussd_flow_action,
        NULL
      );
      step_no := step_no + 1;

      INSERT INTO ussd_flow_steps (
        flow_id,
        step_order,
        match_all,
        action,
        action_value
      ) VALUES (
        flow.id,
        step_no,
        ARRAY['confirm phone number'],
        'send_customer_phone'::ussd_flow_action,
        NULL
      );
      step_no := step_no + 1;
    END IF;

    INSERT INTO ussd_flow_steps (
      flow_id,
      step_order,
      match_all,
      action,
      action_value
    ) VALUES (
      flow.id,
      step_no,
      ARRAY['mashup offers'],
      'send_digit'::ussd_flow_action,
      tier_digit
    );
    step_no := step_no + 1;

    -- Select the exact GHC 1 / 5 / 10 fixed-price tier rather than
    -- entering a custom amount. All three live menus use option 1.
    INSERT INTO ussd_flow_steps (
      flow_id,
      step_order,
      match_all,
      action,
      action_value
    ) VALUES (
      flow.id,
      step_no,
      ARRAY['enter amount ghc'],
      'send_digit'::ussd_flow_action,
      '1'
    );
    step_no := step_no + 1;

    -- Allocation screens contain minute allocations. MTN accepts
    -- selection digits 1-5 directly; no preceding 99 is required.
    INSERT INTO ussd_flow_steps (
      flow_id,
      step_order,
      match_all,
      action,
      action_value
    ) VALUES (
      flow.id,
      step_no,
      ARRAY['mins'],
      'send_selection'::ussd_flow_action,
      NULL
    );
    step_no := step_no + 1;

    INSERT INTO ussd_flow_steps (
      flow_id,
      step_order,
      match_all,
      action,
      action_value
    ) VALUES (
      flow.id,
      step_no,
      ARRAY['choose payment mode', 'mobile money'],
      'send_digit'::ussd_flow_action,
      payment_digit
    );
    step_no := step_no + 1;

    INSERT INTO ussd_flow_steps (
      flow_id,
      step_order,
      match_all,
      action,
      action_value
    ) VALUES (
      flow.id,
      step_no,
      ARRAY['pin'],
      'pin_prompt'::ussd_flow_action,
      NULL
    );
  END LOOP;
END
$$;
