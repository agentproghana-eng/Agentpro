ALTER TABLE operational_incidents
  ADD COLUMN last_notification_at TIMESTAMPTZ,
  ADD COLUMN last_notification_severity VARCHAR(16),
  ADD COLUMN next_notification_at TIMESTAMPTZ,
  ADD COLUMN recovery_notification_at TIMESTAMPTZ;

ALTER TABLE operational_incidents
  ADD CONSTRAINT chk_operational_incidents_notification_severity
  CHECK (
    last_notification_severity IS NULL
    OR last_notification_severity IN ('warning', 'critical')
  );

ALTER TABLE operational_incidents
  ADD CONSTRAINT chk_operational_incidents_notification_pair
  CHECK (
    (
      last_notification_at IS NULL
      AND last_notification_severity IS NULL
    )
    OR
    (
      last_notification_at IS NOT NULL
      AND last_notification_severity IS NOT NULL
    )
  );

ALTER TABLE operational_incidents
  ADD CONSTRAINT chk_operational_incidents_recovery_notification
  CHECK (
    recovery_notification_at IS NULL
    OR resolved_at IS NOT NULL
  );

CREATE INDEX idx_operational_incidents_notification_due
  ON operational_incidents (
    next_notification_at ASC
  )
  WHERE resolved_at IS NULL;
