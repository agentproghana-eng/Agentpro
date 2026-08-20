CREATE TABLE outbox_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    event_type VARCHAR(100) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id UUID,

    dedupe_key VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 8,

    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(100),

    processed_at TIMESTAMPTZ,
    last_error_code VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_outbox_events_dedupe_key
        UNIQUE (dedupe_key),

    CONSTRAINT chk_outbox_events_event_type
        CHECK (
            event_type <> ''
            AND event_type ~ '^[a-z0-9_.-]+$'
        ),

    CONSTRAINT chk_outbox_events_aggregate_type
        CHECK (
            aggregate_type <> ''
            AND aggregate_type ~ '^[a-z0-9_.-]+$'
        ),

    CONSTRAINT chk_outbox_events_payload_object
        CHECK (jsonb_typeof(payload) = 'object'),

    CONSTRAINT chk_outbox_events_status
        CHECK (
            status IN (
                'pending',
                'processing',
                'processed',
                'dead_letter'
            )
        ),

    CONSTRAINT chk_outbox_events_attempts
        CHECK (attempts >= 0),

    CONSTRAINT chk_outbox_events_max_attempts
        CHECK (
            max_attempts >= 1
            AND max_attempts <= 20
        )
);

CREATE INDEX idx_outbox_events_dispatch_pending
    ON outbox_events (
        available_at,
        created_at
    )
    WHERE status = 'pending';

CREATE INDEX idx_outbox_events_processing_stale
    ON outbox_events (locked_at)
    WHERE status = 'processing';

CREATE INDEX idx_outbox_events_aggregate
    ON outbox_events (
        aggregate_type,
        aggregate_id,
        created_at
    );
