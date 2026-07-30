-- Phase 2b's completeTransaction was written without checking the
-- exact shape the Flutter automation screen actually sends on
-- completion - it sends failure_reason and a sanitized ussd_session_log
-- (same as the Agent side), neither of which personal_transactions had
-- a column for, so both would have been silently dropped. Catching up
-- to the Agent side's transactions table exactly (same types).
ALTER TABLE personal_transactions ADD COLUMN failure_reason TEXT;
ALTER TABLE personal_transactions ADD COLUMN ussd_session_log JSONB;
