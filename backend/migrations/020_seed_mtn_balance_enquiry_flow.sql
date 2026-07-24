-- Converts MTN Balance Enquiry from the legacy single-dial template
-- (fixed in 019, but that was for a concatenated dial string that
-- can't actually reach an interactive PIN prompt) to a real
-- interactive Flow Builder entry, mapped step-by-step from live
-- device screenshots. This automatically supersedes the legacy
-- template for this combo, since the app already checks Flow Builder
-- before falling back to it - the legacy row is deactivated below
-- rather than deleted, so 019's fix stays intact as a harmless
-- historical record.
--
-- success_markers ('current balance', 'available balance') are
-- confirmed from a real completed transaction's final result screen.
-- failure_markers are NOT confirmed (no failure screenshot available)
-- and use the same broad generic terms as other flows - verify
-- against a real failure (e.g. wrong PIN) before fully trusting them.
INSERT INTO ussd_flows (provider, transaction_type, dial_code, success_markers, failure_markers, created_by)
SELECT 'mtn', 'balance_enquiry', '*171#',
  ARRAY['current balance', 'available balance'],
  ARRAY['failed', 'error'],
  (SELECT id FROM users WHERE role = 'superuser' LIMIT 1)
WHERE NOT EXISTS (SELECT 1 FROM ussd_flows WHERE provider='mtn' AND transaction_type='balance_enquiry' AND company_id IS NULL AND is_active = true)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'superuser');

INSERT INTO ussd_flow_steps (flow_id, step_order, match_all, action, action_value)
SELECT f.id, s.step_order, s.match_all, s.action::ussd_flow_action, s.action_value
FROM ussd_flows f, (VALUES
  (1, ARRAY['mainmenuagent'], 'send_digit', '7'),
  (2, ARRAY['1) check balance'], 'send_digit', '1'),
  (3, ARRAY['enter mm pin'], 'pin_prompt', NULL)
) AS s(step_order, match_all, action, action_value)
WHERE f.provider='mtn' AND f.transaction_type='balance_enquiry' AND f.company_id IS NULL AND f.is_active = true
  AND NOT EXISTS (SELECT 1 FROM ussd_flow_steps WHERE flow_id = f.id);

UPDATE ussd_templates
SET is_active = false
WHERE provider = 'mtn' AND transaction_type = 'balance_enquiry';
