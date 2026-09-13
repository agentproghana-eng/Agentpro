-- Independent durable delivery state for critical
-- operational incident email alerts.
--
-- These columns are intentionally separate from the existing
-- push/outbox notification lifecycle so either delivery channel
-- may fail or recover without advancing the other channel.

ALTER TABLE operational_incidents
  ADD COLUMN last_email_at TIMESTAMPTZ,
  ADD COLUMN next_email_at TIMESTAMPTZ,
  ADD COLUMN recovery_email_at TIMESTAMPTZ;

ALTER TABLE operational_incidents
  ADD CONSTRAINT chk_operational_incidents_email_due_pair
  CHECK (
    (
      last_email_at IS NULL
      AND next_email_at IS NULL
    )
    OR
    (
      last_email_at IS NOT NULL
      AND next_email_at IS NOT NULL
    )
  );

ALTER TABLE operational_incidents
  ADD CONSTRAINT chk_operational_incidents_recovery_email
  CHECK (
    recovery_email_at IS NULL
    OR (
      resolved_at IS NOT NULL
      AND last_email_at IS NOT NULL
    )
  );

CREATE INDEX idx_operational_incidents_email_due
  ON operational_incidents (
    next_email_at ASC
  )
  WHERE
    resolved_at IS NULL
    AND severity = 'critical';
