-- Durable operational incident lifecycle state.
--
-- Alert evaluation remains read-only. This table is the persistence
-- primitive that a later singleton incident monitor will reconcile.
--
-- Exactly one unresolved incident may exist for a stable incident key.
-- A resolved incident remains as history, and a later recurrence can
-- open a new lifecycle row.

CREATE TABLE operational_incidents (
  id BIGSERIAL PRIMARY KEY,

  incident_key VARCHAR(160) NOT NULL,
  alert_code VARCHAR(160) NOT NULL,
  component VARCHAR(120) NOT NULL,

  severity VARCHAR(16) NOT NULL,

  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  occurrence_count BIGINT NOT NULL DEFAULT 1,

  latest_observed JSONB NOT NULL DEFAULT '{}'::jsonb,
  latest_threshold JSONB NOT NULL DEFAULT '{}'::jsonb,
  latest_window JSONB,

  resolved_at TIMESTAMPTZ,

  CONSTRAINT chk_operational_incidents_severity
    CHECK (severity IN ('warning', 'critical')),

  CONSTRAINT chk_operational_incidents_occurrence_count
    CHECK (occurrence_count >= 1),

  CONSTRAINT chk_operational_incidents_latest_observed_object
    CHECK (jsonb_typeof(latest_observed) = 'object'),

  CONSTRAINT chk_operational_incidents_latest_threshold_object
    CHECK (jsonb_typeof(latest_threshold) = 'object'),

  CONSTRAINT chk_operational_incidents_latest_window
    CHECK (
      latest_window IS NULL
      OR jsonb_typeof(latest_window) = 'object'
    )
);

CREATE UNIQUE INDEX
  uq_operational_incidents_active_key
ON operational_incidents (incident_key)
WHERE resolved_at IS NULL;

CREATE INDEX
  idx_operational_incidents_active_severity
ON operational_incidents (
  severity,
  last_seen_at DESC
)
WHERE resolved_at IS NULL;

CREATE INDEX
  idx_operational_incidents_history
ON operational_incidents (
  incident_key,
  first_seen_at DESC
);
