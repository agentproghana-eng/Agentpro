-- Add a dedicated USSD action for protected Telecel Organisation Shortcodes.
--
-- The value itself is never stored in ussd_flow_steps.action_value.
-- At execution time AgentPro supplies the protected credential associated
-- with the resolved Telecel SIM role.

ALTER TYPE ussd_flow_action
  ADD VALUE IF NOT EXISTS 'send_organisation_shortcode';
