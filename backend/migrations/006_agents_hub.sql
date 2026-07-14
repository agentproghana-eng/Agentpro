-- Agents Hub: a cross-company community feed. Every user across every
-- company sees the same shared feed. Normal posts go live immediately
-- (post-hoc moderation - a superuser can remove after the fact).
-- Posts the AI flags as advertisement-like go straight to
-- 'pending_review' instead: hidden from the public feed, visible only
-- to their own author and to superusers, until a superuser approves
-- (-> active) or rejects (-> removed) them.
CREATE TABLE agent_posts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id       UUID NOT NULL REFERENCES users(id),
  content         TEXT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  flagged_reason  TEXT,
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  removed_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE agent_post_likes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE agent_post_comments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID NOT NULL REFERENCES agent_posts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agent_posts_created ON agent_posts(created_at DESC) WHERE status = 'active';
CREATE INDEX idx_agent_posts_pending ON agent_posts(created_at) WHERE status = 'pending_review';
CREATE INDEX idx_agent_post_likes_post ON agent_post_likes(post_id);
CREATE INDEX idx_agent_post_comments_post ON agent_post_comments(post_id);
