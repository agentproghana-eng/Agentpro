-- Preserve enough device-local SIM identity to distinguish transactions
-- when Android cannot expose a physical SIM ICCID.
--
-- ICCID remains the preferred durable physical-SIM identifier.
-- installation_id + sim_subscription_id is only a controlled fallback and
-- must be treated as unresolved identity, not as proof of a physical SIM.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS installation_id UUID;

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS sim_subscription_id INTEGER;

CREATE INDEX IF NOT EXISTS
  idx_transactions_unresolved_sim_identity
ON transactions (
  agent_id,
  provider,
  installation_id,
  sim_subscription_id
)
WHERE sim_iccid IS NULL
  AND installation_id IS NOT NULL
  AND sim_subscription_id IS NOT NULL;
