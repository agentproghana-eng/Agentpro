-- Retry-safe branch treasury top-ups.
--
-- A client may lose the HTTP response after a successful treasury commit.
-- Reusing the same client_operation_id must resolve to the original top-up
-- rather than crediting branch float a second time.
--
-- Existing historical movements remain valid with NULL operation IDs.

ALTER TABLE float_movements
  ADD COLUMN IF NOT EXISTS client_operation_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS
  idx_float_movements_performer_client_operation
ON float_movements(performed_by, client_operation_id)
WHERE client_operation_id IS NOT NULL;
