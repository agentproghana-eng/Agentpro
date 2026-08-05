-- Community moderation, organization, saving, and accepted-answer foundation.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'community_post_type'
  ) THEN
    CREATE TYPE community_post_type AS ENUM (
      'general',
      'question',
      'network_issue',
      'fraud_alert',
      'business_tip',
      'announcement'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'community_report_status'
  ) THEN
    CREATE TYPE community_report_status AS ENUM (
      'pending',
      'reviewed',
      'dismissed',
      'actioned'
    );
  END IF;
END
$$;

ALTER TABLE agent_posts
  ADD COLUMN IF NOT EXISTS post_type community_post_type
    NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN
    NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_official BOOLEAN
    NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN
    NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS accepted_comment_id UUID,
  ADD COLUMN IF NOT EXISTS moderated_by UUID
    REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_agent_posts_accepted_comment'
  ) THEN
    ALTER TABLE agent_posts
      ADD CONSTRAINT fk_agent_posts_accepted_comment
      FOREIGN KEY (accepted_comment_id)
      REFERENCES agent_post_comments(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS agent_post_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  post_id UUID NOT NULL
    REFERENCES agent_posts(id)
    ON DELETE CASCADE,

  reported_by UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  reason VARCHAR(50) NOT NULL
    CHECK (
      reason IN (
        'spam',
        'fraud',
        'harassment',
        'misinformation',
        'inappropriate',
        'privacy',
        'other'
      )
    ),

  details TEXT,
  status community_report_status
    NOT NULL DEFAULT 'pending',

  reviewed_by UUID
    REFERENCES users(id)
    ON DELETE SET NULL,

  reviewed_at TIMESTAMPTZ,
  resolution_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_agent_post_report_user
    UNIQUE (post_id, reported_by)
);

CREATE TABLE IF NOT EXISTS agent_comment_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  comment_id UUID NOT NULL
    REFERENCES agent_post_comments(id)
    ON DELETE CASCADE,

  reported_by UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  reason VARCHAR(50) NOT NULL
    CHECK (
      reason IN (
        'spam',
        'fraud',
        'harassment',
        'misinformation',
        'inappropriate',
        'privacy',
        'other'
      )
    ),

  details TEXT,
  status community_report_status
    NOT NULL DEFAULT 'pending',

  reviewed_by UUID
    REFERENCES users(id)
    ON DELETE SET NULL,

  reviewed_at TIMESTAMPTZ,
  resolution_note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_agent_comment_report_user
    UNIQUE (comment_id, reported_by)
);

CREATE TABLE IF NOT EXISTS agent_community_blocks (
  blocker_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  blocked_user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (blocker_id, blocked_user_id),

  CONSTRAINT chk_agent_community_block_self
    CHECK (blocker_id <> blocked_user_id)
);

CREATE TABLE IF NOT EXISTS agent_saved_posts (
  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  post_id UUID NOT NULL
    REFERENCES agent_posts(id)
    ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS agent_post_moderation_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  post_id UUID NOT NULL
    REFERENCES agent_posts(id)
    ON DELETE CASCADE,

  moderator_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  action VARCHAR(40) NOT NULL
    CHECK (
      action IN (
        'approve',
        'remove',
        'restore',
        'pin',
        'unpin',
        'mark_official',
        'remove_official',
        'mark_urgent',
        'remove_urgent',
        'change_type'
      )
    ),

  previous_values JSONB,
  new_values JSONB,
  reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_posts_feed_priority
  ON agent_posts (
    is_pinned DESC,
    is_urgent DESC,
    created_at DESC
  )
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_agent_posts_type_created
  ON agent_posts (post_type, created_at DESC)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_agent_post_reports_status_created
  ON agent_post_reports (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_agent_comment_reports_status_created
  ON agent_comment_reports (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_agent_saved_posts_user_created
  ON agent_saved_posts (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_blocks_blocker
  ON agent_community_blocks (blocker_id);

CREATE INDEX IF NOT EXISTS idx_agent_blocks_blocked
  ON agent_community_blocks (blocked_user_id);

CREATE INDEX IF NOT EXISTS idx_agent_moderation_history_post_created
  ON agent_post_moderation_history (post_id, created_at DESC);

CREATE OR REPLACE FUNCTION touch_community_report_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_agent_post_report
  ON agent_post_reports;

CREATE TRIGGER trg_touch_agent_post_report
BEFORE UPDATE ON agent_post_reports
FOR EACH ROW
EXECUTE FUNCTION touch_community_report_updated_at();

DROP TRIGGER IF EXISTS trg_touch_agent_comment_report
  ON agent_comment_reports;

CREATE TRIGGER trg_touch_agent_comment_report
BEFORE UPDATE ON agent_comment_reports
FOR EACH ROW
EXECUTE FUNCTION touch_community_report_updated_at();
