-- Add a deliberately no-write USSD action for provider menus whose
-- choices must remain live and user-controlled.
--
-- await_user_selection:
--   - matches a known provider menu;
--   - submits no text, digit, click, or other input;
--   - waits indefinitely while that same menu remains visible;
--   - advances only after the user manually changes the provider screen.
--
-- This is pre-PIN only. The existing pin_prompt write boundary remains
-- authoritative and no post-PIN automation is introduced.

ALTER TYPE ussd_flow_action
  ADD VALUE IF NOT EXISTS 'await_user_selection';
