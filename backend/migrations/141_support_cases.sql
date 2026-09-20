-- AgentPro Help & Support case records.
--
-- Privacy boundary:
-- - complaint / feedback text lives only in these support-case tables;
-- - no PIN, password, OTP, raw USSD screen, or transaction payload is
--   automatically collected by this feature;
-- - broad audit logs receive case metadata, never the message body.

CREATE TABLE support_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number BIGSERIAL NOT NULL UNIQUE,

    requester_user_id UUID
      REFERENCES users(id)
      ON DELETE SET NULL,

    company_id UUID
      REFERENCES companies(id)
      ON DELETE SET NULL,

    type VARCHAR(20) NOT NULL
      CHECK (type IN ('complaint', 'feedback', 'suggestion')),

    subject VARCHAR(120) NOT NULL,
    initial_message TEXT NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'open'
      CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),

    priority VARCHAR(20) NOT NULL DEFAULT 'normal'
      CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

    source VARCHAR(20) NOT NULL DEFAULT 'mobile',
    app_version VARCHAR(40),
    app_build VARCHAR(40),
    platform VARCHAR(40),
    source_commit VARCHAR(80),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,

    CHECK (char_length(subject) BETWEEN 3 AND 120),
    CHECK (char_length(initial_message) BETWEEN 10 AND 4000)
);

CREATE TABLE support_case_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    case_id UUID NOT NULL
      REFERENCES support_cases(id)
      ON DELETE CASCADE,

    author_user_id UUID
      REFERENCES users(id)
      ON DELETE SET NULL,

    author_role VARCHAR(20) NOT NULL
      CHECK (author_role IN ('requester', 'admin')),

    body TEXT NOT NULL,
    visible_to_requester BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (char_length(body) BETWEEN 2 AND 4000)
);

CREATE INDEX idx_support_cases_status_created_cursor
  ON support_cases (status, created_at DESC, id DESC);

CREATE INDEX idx_support_cases_type_status_created_cursor
  ON support_cases (type, status, created_at DESC, id DESC);

CREATE INDEX idx_support_cases_priority_status_created_cursor
  ON support_cases (priority, status, created_at DESC, id DESC);

CREATE INDEX idx_support_cases_requester_created
  ON support_cases (requester_user_id, created_at DESC, id DESC);

CREATE INDEX idx_support_cases_company_created
  ON support_cases (company_id, created_at DESC, id DESC);

CREATE INDEX idx_support_case_messages_case_created
  ON support_case_messages (case_id, created_at ASC, id ASC);
