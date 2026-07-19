-- Data-driven interactive USSD flows, replacing the hardcoded Kotlin
-- state machine (UssdAccessibilityService.kt) one flow at a time.
-- company_id NULL means a global flow (superuser-owned, shared by every
-- company automatically - this is what MTN/Telecel's built-in flows
-- will become once ported). company_id set means a business-owner-only
-- flow, visible and editable only within that one company.
--
-- This migration adds the schema only. The Kotlin interpreter that
-- actually reads and executes these flows on-device is a separate,
-- follow-up piece of work - these tables have no effect on the live
-- MTN/Telecel automation until that interpreter exists.
CREATE TABLE ussd_flows (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE, -- NULL = global/superuser-owned
  provider          provider NOT NULL,
  transaction_type  transaction_type NOT NULL,
  dial_code         VARCHAR(30) NOT NULL, -- e.g. '*171#', '*110#'
  success_markers   TEXT[] NOT NULL DEFAULT '{}', -- any one match = success
  failure_markers   TEXT[] NOT NULL DEFAULT '{}', -- any one match = failure
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one active global flow per provider+type ...
CREATE UNIQUE INDEX idx_ussd_flows_global_unique
  ON ussd_flows(provider, transaction_type)
  WHERE company_id IS NULL AND is_active = true;

-- ... and only one active flow per company per provider+type.
CREATE UNIQUE INDEX idx_ussd_flows_company_unique
  ON ussd_flows(company_id, provider, transaction_type)
  WHERE company_id IS NOT NULL AND is_active = true;

-- Ordered steps within a flow. Mirrors the pattern already proven live
-- for MTN/Telecel: a step fires when ALL of match_all's substrings are
-- present in the current screen text (AND logic - see
-- UssdAccessibilityService.kt's existing `screenText.contains(x) &&
-- screenText.contains(y)` branches), then performs exactly one action.
--
-- action values:
--   send_digit          - types action_value (e.g. "1", "3"), then Send
--   send_customer_phone - types the transaction's customer phone
--   send_amount         - types the transaction's amount
--   send_operator_id    - types the agent's saved Telecel-style Operator ID
--   send_literal        - types action_value verbatim (fallback for
--                         anything not covered by the above)
--   pin_prompt          - marks this step as where automation stops
--                         entirely for sensitive PIN entry
--   auto_confirm_once   - after PIN, sends action_value exactly once
--                         (Telecel's non-sensitive "press 1 to confirm")
CREATE TYPE ussd_flow_action AS ENUM (
  'send_digit',
  'send_customer_phone',
  'send_amount',
  'send_operator_id',
  'send_literal',
  'pin_prompt',
  'auto_confirm_once'
);

CREATE TABLE ussd_flow_steps (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_id       UUID NOT NULL REFERENCES ussd_flows(id) ON DELETE CASCADE,
  step_order    INTEGER NOT NULL,
  match_all     TEXT[] NOT NULL, -- lowercase substrings, ALL must be present
  action        ussd_flow_action NOT NULL,
  action_value  VARCHAR(255), -- only used by send_digit / send_literal / auto_confirm_once
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(flow_id, step_order)
);

CREATE INDEX idx_ussd_flow_steps_flow ON ussd_flow_steps(flow_id, step_order);
