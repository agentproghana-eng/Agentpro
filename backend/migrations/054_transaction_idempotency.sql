-- Stable client-generated operation ID for retry-safe transaction creation.
--
-- A transaction may be retried after a network timeout where the server
-- created the row but the client never received the response. The same
-- client_operation_id must resolve to the original transaction rather than
-- creating a duplicate financial event.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS client_operation_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_transactions_agent_client_operation
ON transactions(agent_id, client_operation_id)
WHERE client_operation_id IS NOT NULL;
