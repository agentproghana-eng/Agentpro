-- ============================================================
-- 163: Server-driven transaction form schema V2
-- ============================================================
--
-- A USSD flow may describe the ordinary transaction inputs that the
-- Flutter client should collect before execution.
--
-- This is PRESENTATION / INPUT metadata only. It does not:
--   * define financial posting behaviour
--   * enable a SIM role for accounting
--   * change USSD execution primitives
--   * permit the server to request a PIN
--
-- PIN remains native/protected through the existing pin_prompt
-- execution primitive and is deliberately forbidden here.
-- ============================================================

ALTER TABLE ussd_flows
  ADD COLUMN IF NOT EXISTS form_schema JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE ussd_flows
  DROP CONSTRAINT IF EXISTS chk_ussd_flows_form_schema_array;

ALTER TABLE ussd_flows
  ADD CONSTRAINT chk_ussd_flows_form_schema_array
  CHECK (
    jsonb_typeof(form_schema) = 'array'
    AND jsonb_array_length(form_schema) <= 20
  );

COMMENT ON COLUMN ussd_flows.form_schema IS
  'V2 server-described pre-transaction form fields. Presentation/input metadata only; never financial posting policy or PIN collection.';
