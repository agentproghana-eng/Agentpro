-- Tracks which physical SIM cards (by ICCID) have been used to process
-- transactions under each agent+provider combo. Multiple ICCIDs per
-- agent+provider are expected over time (legitimate SIM replacement
-- after loss/damage/upgrade) - this isn't a one-SIM-forever allowlist,
-- it's a record of what's already been seen, so a genuinely NEW ICCID
-- can be told apart from a recognized one and flagged for review once,
-- rather than either blocking outright or silently accepting anything.
CREATE TABLE agent_sim_registry (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         provider NOT NULL,
  iccid            TEXT NOT NULL,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transaction_count INTEGER NOT NULL DEFAULT 1,
  UNIQUE(agent_id, provider, iccid)
);

CREATE INDEX idx_agent_sim_registry_agent_provider ON agent_sim_registry(agent_id, provider);
