-- Fix the live Telecel Merchant bank beneficiary confirmation.
--
-- The provider asks:
--   You have requested to send money to ...
--   1 Confirm
--
-- This occurs BEFORE the PIN boundary, so it is an ordinary verified
-- menu response. auto_confirm_once is deliberately reserved for the
-- post-PIN side of a flow and makes this persisted flow fail validation.
--
-- This migration changes only the active Global Telecel Merchant
-- send_money_to_bank beneficiary-confirmation step.

DO $$
DECLARE
  v_flow_id uuid;
  v_count integer;
  v_updated integer;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'send_money_to_bank'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND is_active = TRUE;

  IF v_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one active Global Telecel Merchant bank flow; found %',
      v_count;
  END IF;

  SELECT id
  INTO v_flow_id
  FROM ussd_flows
  WHERE provider = 'telecel'
    AND transaction_type = 'send_money_to_bank'
    AND company_id IS NULL
    AND owner_user_id IS NULL
    AND business_sim_role = 'merchant'
    AND is_active = TRUE;

  UPDATE ussd_flow_steps
  SET action = 'send_digit'::ussd_flow_action,
      action_value = '1'
  WHERE flow_id = v_flow_id
    AND step_order = 8
    AND action = 'auto_confirm_once'::ussd_flow_action
    AND action_value = '1'
    AND match_all @> ARRAY[
      'you have requested to send money to',
      '1 confirm'
    ]::text[];

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    RAISE EXCEPTION
      'Expected to update exactly one Telecel Merchant bank beneficiary confirmation step; updated %',
      v_updated;
  END IF;
END
$$;
