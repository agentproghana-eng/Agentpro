-- Upgrade post likes to typed reactions. All existing rows keep
-- their meaning by defaulting to 'like' - a bare like is just one
-- reaction type among the new set, not something being replaced.
ALTER TABLE agent_post_likes ADD COLUMN reaction_type VARCHAR(10) NOT NULL DEFAULT 'like';
