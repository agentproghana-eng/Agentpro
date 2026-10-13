-- Escalated fraud signals notify superusers and can later be marked resolved.

ALTER TYPE notification_type
ADD VALUE IF NOT EXISTS 'fraud_signal_escalated';

ALTER TABLE fraud_signals
DROP CONSTRAINT IF EXISTS chk_fraud_signals_review_status;

ALTER TABLE fraud_signals
ADD CONSTRAINT chk_fraud_signals_review_status
CHECK (
    review_status IN (
        'open',
        'reviewed',
        'dismissed',
        'escalated',
        'resolved'
    )
);
