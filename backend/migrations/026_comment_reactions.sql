-- Comments/replies get the same reaction capability posts have,
-- mirroring agent_post_likes' structure (separate table rather than
-- a shared one, since post_id and comment_id would otherwise need
-- to coexist awkwardly as nullable alternatives on the same row).
CREATE TABLE agent_post_comment_reactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id    UUID NOT NULL REFERENCES agent_post_comments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  reaction_type VARCHAR(10) NOT NULL DEFAULT 'like',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);
CREATE INDEX idx_agent_post_comment_reactions_comment ON agent_post_comment_reactions(comment_id);
