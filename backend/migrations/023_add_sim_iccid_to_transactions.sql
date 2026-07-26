-- Adds the physical SIM card's ICCID to each transaction record, when
-- available. Not universally populated (some devices/Android versions
-- don't reliably expose it), so nullable - this is a foundation for
-- detecting when a different physical SIM is used under the same
-- agent account than usual, not a required field.
ALTER TABLE transactions ADD COLUMN sim_iccid TEXT;

CREATE INDEX idx_transactions_sim_iccid ON transactions(agent_id, provider, sim_iccid) WHERE sim_iccid IS NOT NULL;
