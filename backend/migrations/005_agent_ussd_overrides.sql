-- Per-agent USSD dial pattern overrides. Saving one only affects that
-- single agent's own dialing - immediate effect, no approval needed,
-- since a mistake here is contained to the person who made it.
CREATE TABLE agent_ussd_overrides (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            provider NOT NULL,
  transaction_type    transaction_type NOT NULL,
  ussd_string_pattern VARCHAR(255) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(agent_id, provider, transaction_type)
);
