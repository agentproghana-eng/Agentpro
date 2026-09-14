-- Durable, reviewable fraud/anomaly signals.
-- Detection is advisory only: this table must not itself block,
-- suspend, reject, or mutate customer/account state.

CREATE TABLE fraud_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    signal_type VARCHAR(100) NOT NULL,
    rule_id VARCHAR(100) NOT NULL,

    severity VARCHAR(20) NOT NULL,
    risk_score SMALLINT NOT NULL,

    subject_type VARCHAR(100) NOT NULL,
    subject_id VARCHAR(255) NOT NULL,

    actor_user_id UUID,
    company_id UUID,
    provider VARCHAR(50),

    window_started_at TIMESTAMPTZ NOT NULL,
    window_ended_at TIMESTAMPTZ NOT NULL,

    observed_event_count INTEGER NOT NULL,

    metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,

    dedupe_key VARCHAR(255) NOT NULL,

    review_status VARCHAR(20) NOT NULL DEFAULT 'open',
    reviewed_at TIMESTAMPTZ,
    reviewed_by UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_fraud_signals_dedupe_key
        UNIQUE (dedupe_key),

    CONSTRAINT chk_fraud_signals_signal_type
        CHECK (
            signal_type <> ''
            AND signal_type ~ '^[a-z0-9_.-]+$'
        ),

    CONSTRAINT chk_fraud_signals_rule_id
        CHECK (
            rule_id <> ''
            AND rule_id ~ '^[a-z0-9_.-]+$'
        ),

    CONSTRAINT chk_fraud_signals_severity
        CHECK (
            severity IN (
                'low',
                'medium',
                'high',
                'critical'
            )
        ),

    CONSTRAINT chk_fraud_signals_risk_score
        CHECK (
            risk_score >= 0
            AND risk_score <= 100
        ),

    CONSTRAINT chk_fraud_signals_subject_type
        CHECK (
            subject_type <> ''
            AND subject_type ~ '^[a-z0-9_.-]+$'
        ),

    CONSTRAINT chk_fraud_signals_subject_id
        CHECK (subject_id <> ''),

    CONSTRAINT chk_fraud_signals_provider
        CHECK (
            provider IS NULL
            OR (
                provider <> ''
                AND provider ~ '^[a-z0-9_.-]+$'
            )
        ),

    CONSTRAINT chk_fraud_signals_window
        CHECK (
            window_started_at <= window_ended_at
        ),

    CONSTRAINT chk_fraud_signals_observed_count
        CHECK (observed_event_count >= 0),

    CONSTRAINT chk_fraud_signals_metrics_object
        CHECK (jsonb_typeof(metrics) = 'object'),

    CONSTRAINT chk_fraud_signals_evidence_object
        CHECK (jsonb_typeof(evidence) = 'object'),

    CONSTRAINT chk_fraud_signals_review_status
        CHECK (
            review_status IN (
                'open',
                'reviewed',
                'dismissed',
                'escalated'
            )
        ),

    CONSTRAINT chk_fraud_signals_review_metadata
        CHECK (
            (
                review_status = 'open'
                AND reviewed_at IS NULL
                AND reviewed_by IS NULL
            )
            OR
            (
                review_status <> 'open'
                AND reviewed_at IS NOT NULL
                AND reviewed_by IS NOT NULL
            )
        )
);

CREATE INDEX idx_fraud_signals_open_risk
    ON fraud_signals (
        risk_score DESC,
        created_at DESC
    )
    WHERE review_status = 'open';

CREATE INDEX idx_fraud_signals_actor_time
    ON fraud_signals (
        actor_user_id,
        created_at DESC
    )
    WHERE actor_user_id IS NOT NULL;

CREATE INDEX idx_fraud_signals_company_time
    ON fraud_signals (
        company_id,
        created_at DESC
    )
    WHERE company_id IS NOT NULL;

CREATE INDEX idx_fraud_signals_rule_time
    ON fraud_signals (
        rule_id,
        created_at DESC
    );
