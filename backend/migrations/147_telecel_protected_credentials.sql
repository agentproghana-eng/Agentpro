-- Protected Telecel credentials for Business SIM automation.
--
-- Values stored in *_enc columns MUST be versioned application-layer
-- ciphertext. Never write plaintext into these columns.
--
-- Credentials are scoped by SIM role so an Agent SIM can never
-- accidentally consume a Merchant SIM credential or vice versa.
--
-- Existing users.telecel_operator_id is intentionally retained during
-- the compatibility migration. Application code will migrate existing
-- values into the Agent encrypted credential only after the encryption
-- key is configured and verified. The legacy plaintext column can be
-- removed in a later migration after that controlled backfill.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS
    telecel_agent_operator_id_enc TEXT,
  ADD COLUMN IF NOT EXISTS
    telecel_agent_organisation_shortcode_enc TEXT,
  ADD COLUMN IF NOT EXISTS
    telecel_merchant_operator_id_enc TEXT,
  ADD COLUMN IF NOT EXISTS
    telecel_merchant_organisation_shortcode_enc TEXT;

COMMENT ON COLUMN
  users.telecel_agent_operator_id_enc IS
  'Versioned AES-256-GCM encrypted Telecel Agent Operator ID. Never plaintext.';

COMMENT ON COLUMN
  users.telecel_agent_organisation_shortcode_enc IS
  'Versioned AES-256-GCM encrypted Telecel Agent Organisation Shortcode. Never plaintext.';

COMMENT ON COLUMN
  users.telecel_merchant_operator_id_enc IS
  'Versioned AES-256-GCM encrypted Telecel Merchant Operator ID. Never plaintext.';

COMMENT ON COLUMN
  users.telecel_merchant_organisation_shortcode_enc IS
  'Versioned AES-256-GCM encrypted Telecel Merchant Organisation Shortcode. Never plaintext.';
