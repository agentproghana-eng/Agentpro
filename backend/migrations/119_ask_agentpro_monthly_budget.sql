-- Ask AgentPro monthly Full-diagnostic budget.
--
-- Personal:
--   one monthly allowance per user.
--
-- Business:
--   one monthly allowance per company, shared by staff.
--
-- Basic/free-tier requests do not add financial spend.

CREATE TABLE IF NOT EXISTS ask_agentpro_monthly_usage (
  scope_type VARCHAR(20) NOT NULL
    CHECK (scope_type IN ('personal', 'business')),

  scope_id UUID NOT NULL,

  period_start DATE NOT NULL,

  spent_ghs NUMERIC(12, 6) NOT NULL DEFAULT 0
    CHECK (spent_ghs >= 0),

  reserved_ghs NUMERIC(12, 6) NOT NULL DEFAULT 0
    CHECK (reserved_ghs >= 0),

  full_requests INTEGER NOT NULL DEFAULT 0
    CHECK (full_requests >= 0),

  basic_requests INTEGER NOT NULL DEFAULT 0
    CHECK (basic_requests >= 0),

  active_full_token UUID,
  active_full_expires_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (
    scope_type,
    scope_id,
    period_start
  )
);

CREATE INDEX IF NOT EXISTS
  idx_ask_agentpro_usage_period
ON ask_agentpro_monthly_usage (
  period_start,
  scope_type
);

ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS ai_mode VARCHAR(20);

ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(40);

ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS input_tokens INTEGER;

ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS output_tokens INTEGER;

ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS cached_input_tokens INTEGER;

ALTER TABLE ai_messages
  ADD COLUMN IF NOT EXISTS cost_ghs NUMERIC(12, 6);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_messages_ai_mode_check'
  ) THEN
    ALTER TABLE ai_messages
      ADD CONSTRAINT ai_messages_ai_mode_check
      CHECK (
        ai_mode IS NULL
        OR ai_mode IN ('basic', 'full')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_messages_input_tokens_check'
  ) THEN
    ALTER TABLE ai_messages
      ADD CONSTRAINT ai_messages_input_tokens_check
      CHECK (
        input_tokens IS NULL
        OR input_tokens >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_messages_output_tokens_check'
  ) THEN
    ALTER TABLE ai_messages
      ADD CONSTRAINT ai_messages_output_tokens_check
      CHECK (
        output_tokens IS NULL
        OR output_tokens >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_messages_cached_input_tokens_check'
  ) THEN
    ALTER TABLE ai_messages
      ADD CONSTRAINT ai_messages_cached_input_tokens_check
      CHECK (
        cached_input_tokens IS NULL
        OR cached_input_tokens >= 0
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_messages_cost_ghs_check'
  ) THEN
    ALTER TABLE ai_messages
      ADD CONSTRAINT ai_messages_cost_ghs_check
      CHECK (
        cost_ghs IS NULL
        OR cost_ghs >= 0
      );
  END IF;
END
$$;
