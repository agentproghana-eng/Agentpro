-- Repair MTN Personal Pulse / MashUp fixed-tier allocation matching.
--
-- Migration 082 used "99. more" as the matcher for the page1
-- send_selection step. Live MTN Ghana verification shows the allocation
-- screen can contain options 1-5 directly and may not contain "99. More".
--
-- GHC 1, GHC 5 and GHC 10 allocation screens consistently contain
-- minute allocations ("mins"), so use that stable screen marker before
-- submitting the dynamic allocation digit.
--
-- GHC 30 is not affected because it has its own direct Buy path.
--
-- PIN entry remains manual. AgentPro does not capture, store, prefill,
-- log or submit the Mobile Money PIN.

UPDATE ussd_flow_steps AS step
SET match_all = ARRAY['mins']
FROM ussd_flows AS flow
WHERE step.flow_id = flow.id
  AND flow.provider = 'mtn'
  AND flow.transaction_type = 'buy_mashup'
  AND flow.company_id IS NULL
  AND flow.owner_user_id IS NULL
  AND flow.is_active = TRUE
  AND flow.bundle_category ~
      '^ghc(1|5|10)_page1_(airtime|momo)$'
  AND step.action = 'send_selection'::ussd_flow_action;
