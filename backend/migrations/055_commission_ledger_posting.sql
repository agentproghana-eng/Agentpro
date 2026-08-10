-- Commission earned by an agent is a real balance movement.
--
-- This migration intentionally contains ONLY the enum addition.
-- The migration runner wraps each migration in BEGIN/COMMIT, and PostgreSQL
-- does not allow a newly-added enum value to be safely used by subsequent
-- statements until that transaction has committed.

ALTER TYPE agent_balance_movement_type
ADD VALUE IF NOT EXISTS 'commission_earned';
