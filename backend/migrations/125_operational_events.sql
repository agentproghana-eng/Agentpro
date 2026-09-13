-- Canonical, privacy-safe domain events for support timelines, fraud signals,
-- and product analytics. This is an immutable event record, not a delivery
-- queue; external side effects continue to use outbox_events.
CREATE TABLE operational_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_name VARCHAR(100) NOT NULL,
    event_version SMALLINT NOT NULL DEFAULT 1,
    source VARCHAR(50) NOT NULL,

    actor_user_id UUID,
    company_id UUID,
    subject_type VARCHAR(100) NOT NULL,
    subject_id VARCHAR(255) NOT NULL,

    correlation_id UUID NOT NULL,
    causation_event_id UUID REFERENCES operational_events(id),
    dedupe_key VARCHAR(255),

    attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_operational_events_dedupe_key
        UNIQUE (dedupe_key),

    CONSTRAINT chk_operational_events_event_name
        CHECK (
            event_name <> ''
            AND event_name ~ '^[a-z0-9_.-]+$'
        ),

    CONSTRAINT chk_operational_events_source
        CHECK (
            source <> ''
            AND source ~ '^[a-z0-9_.-]+$'
        ),

    CONSTRAINT chk_operational_events_subject_type
        CHECK (
            subject_type <> ''
            AND subject_type ~ '^[a-z0-9_.-]+$'
        ),

    CONSTRAINT chk_operational_events_subject_id
        CHECK (subject_id <> ''),

    CONSTRAINT chk_operational_events_version
        CHECK (
            event_version >= 1
            AND event_version <= 100
        ),

    CONSTRAINT chk_operational_events_attributes_object
        CHECK (jsonb_typeof(attributes) = 'object'),

    CONSTRAINT chk_operational_events_dedupe_key
        CHECK (
            dedupe_key IS NULL
            OR dedupe_key <> ''
        )
);

CREATE INDEX idx_operational_events_correlation_timeline
    ON operational_events (correlation_id, occurred_at, id);

CREATE INDEX idx_operational_events_subject_timeline
    ON operational_events (
        subject_type,
        subject_id,
        occurred_at DESC
    );

CREATE INDEX idx_operational_events_user_timeline
    ON operational_events (actor_user_id, occurred_at DESC)
    WHERE actor_user_id IS NOT NULL;

CREATE INDEX idx_operational_events_company_timeline
    ON operational_events (company_id, occurred_at DESC)
    WHERE company_id IS NOT NULL;

CREATE INDEX idx_operational_events_name_time
    ON operational_events (event_name, occurred_at DESC);
