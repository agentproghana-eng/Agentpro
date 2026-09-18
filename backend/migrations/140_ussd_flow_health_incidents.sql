-- Event-driven USSD Flow Builder health incidents.
--
-- SECURITY / PRIVACY:
-- This table deliberately stores no raw USSD screen content,
-- customer phone, amount, reference, account number, PIN,
-- SIM ICCID, subscription ID, installation ID, or device ID.
--
-- mismatch_step_index is zero-based because it comes from the
-- native Flow Builder interpreter. The Admin Portal presents it
-- to humans as step_index + 1.

CREATE TABLE ussd_flow_health_incidents (
  id BIGSERIAL PRIMARY KEY,

  flow_id UUID NOT NULL
    REFERENCES ussd_flows(id)
    ON DELETE CASCADE,

  mismatch_step_index INTEGER NOT NULL,
  step_count INTEGER NOT NULL,

  status VARCHAR(16)
    NOT NULL
    DEFAULT 'open',

  first_detected_at TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  last_detected_at TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  occurrence_count BIGINT
    NOT NULL
    DEFAULT 1,

  last_transaction_id UUID NOT NULL,

  last_app_build INTEGER,
  last_source_commit VARCHAR(64),

  recovered_at TIMESTAMPTZ,

  dismissed_at TIMESTAMPTZ,

  dismissed_by UUID
    REFERENCES users(id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  updated_at TIMESTAMPTZ
    NOT NULL
    DEFAULT NOW(),

  CONSTRAINT
    chk_ussd_flow_health_step_index
  CHECK (
    mismatch_step_index >= 0
  ),

  CONSTRAINT
    chk_ussd_flow_health_step_count
  CHECK (
    step_count >= 1
    AND step_count <= 64
  ),

  CONSTRAINT
    chk_ussd_flow_health_occurrence_count
  CHECK (
    occurrence_count >= 1
  ),

  CONSTRAINT
    chk_ussd_flow_health_status
  CHECK (
    status IN (
      'open',
      'recovered',
      'dismissed'
    )
  )
);

CREATE UNIQUE INDEX
  uq_ussd_flow_health_open_flow_step
ON ussd_flow_health_incidents (
  flow_id,
  mismatch_step_index
)
WHERE status = 'open';

CREATE INDEX
  idx_ussd_flow_health_open_recent
ON ussd_flow_health_incidents (
  last_detected_at DESC,
  id DESC
)
WHERE status = 'open';

CREATE INDEX
  idx_ussd_flow_health_flow_history
ON ussd_flow_health_incidents (
  flow_id,
  created_at DESC,
  id DESC
);
