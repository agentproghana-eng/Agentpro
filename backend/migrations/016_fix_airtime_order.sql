-- Corrects the confirmed real order for MTN Airtime: amount comes
-- before the phone number, not after, contradicting the original
-- mapping. Matches steps by their actual match_all content rather
-- than assuming current step_order values, and uses temporary
-- out-of-range values first to avoid any unique constraint conflict
-- during the reorder.

-- Phase 1: move affected steps to temporary out-of-range values
UPDATE ussd_flow_steps SET step_order = -103
  WHERE flow_id = '50d9ca6e-5b07-4ecf-adf9-9255a33e4749' AND match_all = ARRAY['enter mobile number'];
UPDATE ussd_flow_steps SET step_order = -104
  WHERE flow_id = '50d9ca6e-5b07-4ecf-adf9-9255a33e4749' AND match_all = ARRAY['repeat mobile number'];
UPDATE ussd_flow_steps SET step_order = -105
  WHERE flow_id = '50d9ca6e-5b07-4ecf-adf9-9255a33e4749' AND match_all = ARRAY['select amount'];
UPDATE ussd_flow_steps SET step_order = -106
  WHERE flow_id = '50d9ca6e-5b07-4ecf-adf9-9255a33e4749' AND match_all = ARRAY['enter amount'];

-- Phase 2: set to final, corrected values
-- New order: 1 mainmenuagent, 2 airtime&bundles, 3 select amount,
-- 4 enter amount, 5 enter mobile number, 6 repeat mobile number, 7 pin
UPDATE ussd_flow_steps SET step_order = 3
  WHERE flow_id = '50d9ca6e-5b07-4ecf-adf9-9255a33e4749' AND step_order = -105;
UPDATE ussd_flow_steps SET step_order = 4
  WHERE flow_id = '50d9ca6e-5b07-4ecf-adf9-9255a33e4749' AND step_order = -106;
UPDATE ussd_flow_steps SET step_order = 5
  WHERE flow_id = '50d9ca6e-5b07-4ecf-adf9-9255a33e4749' AND step_order = -103;
UPDATE ussd_flow_steps SET step_order = 6
  WHERE flow_id = '50d9ca6e-5b07-4ecf-adf9-9255a33e4749' AND step_order = -104;
