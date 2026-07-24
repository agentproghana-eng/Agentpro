-- Adds edit tracking to agent_posts, and both edit tracking and a
-- soft-delete status to agent_post_comments (which previously had no
-- status column at all, unlike posts). Comments use a simple
-- VARCHAR status like posts do, rather than a full enum, since they
-- only ever need active/removed, with no moderation states.
ALTER TABLE agent_posts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

ALTER TABLE agent_post_comments ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE agent_post_comments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
