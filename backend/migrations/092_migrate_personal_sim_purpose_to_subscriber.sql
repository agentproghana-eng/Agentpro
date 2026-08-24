-- Migration 089 added the canonical subscriber enum value.
-- That enum addition must commit before PostgreSQL permits the value
-- to be used in UPDATE statements.

UPDATE user_sim_purposes
SET purpose = 'subscriber'
WHERE purpose = 'personal';
