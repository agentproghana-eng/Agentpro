-- Activate only the two MTN Agent Pay To flows that have now
-- been live-device certified.
--
-- 099 renamed the former bill_payment enum value to pay_to_agent.
-- merchant_payment remains the canonical Pay to Merchant type.
--
-- This migration fails closed unless exactly one inactive Global
-- MTN Agent flow exists for each certified operation and its
-- expected step count is intact.

DO $$
DECLARE
  pay_to_agent_flow_id UUID;
  pay_to_merchant_flow_id UUID;
  pay_to_agent_step_count INTEGER;
  pay_to_merchant_step_count INTEGER;
BEGIN
  SELECT id
  INTO STRICT pay_to_agent_flow_id
  FROM ussd_flows
  WHERE provider = 'mtn'
    AND transaction_type = 'pay_to_agent'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'agent'
    AND is_active = FALSE;

  SELECT id
  INTO STRICT pay_to_merchant_flow_id
  FROM ussd_flows
  WHERE provider = 'mtn'
    AND transaction_type = 'merchant_payment'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'agent'
    AND is_active = FALSE;

  SELECT COUNT(*)
  INTO pay_to_agent_step_count
  FROM ussd_flow_steps
  WHERE flow_id = pay_to_agent_flow_id;

  SELECT COUNT(*)
  INTO pay_to_merchant_step_count
  FROM ussd_flow_steps
  WHERE flow_id = pay_to_merchant_flow_id;

  IF pay_to_agent_step_count <> 7 THEN
    RAISE EXCEPTION
      'Cannot activate MTN Pay to Agent: expected 7 steps, found %',
      pay_to_agent_step_count;
  END IF;

  IF pay_to_merchant_step_count <> 6 THEN
    RAISE EXCEPTION
      'Cannot activate MTN Pay to Merchant: expected 6 steps, found %',
      pay_to_merchant_step_count;
  END IF;

  UPDATE ussd_flows
  SET is_active = TRUE
  WHERE id IN (
    pay_to_agent_flow_id,
    pay_to_merchant_flow_id
  );
END
$$;
