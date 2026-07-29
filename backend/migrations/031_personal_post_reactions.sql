-- Phase 1's personal_post_likes mirrored agent_post_likes' *original*
-- schema (006_agents_hub.sql), but the Agent side later gained typed
-- reactions via 025_post_reactions.sql. Catching Personal up to that
-- same current shape now, before the Personal Community controller is
-- written, rather than build against an already-outdated mirror.
ALTER TABLE personal_post_likes ADD COLUMN reaction_type VARCHAR(10) NOT NULL DEFAULT 'like';
