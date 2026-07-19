-- Voice notes on posts, and threaded replies on comments.
--
-- audio_url on agent_posts: nullable, since posts remain text-primary
-- by default - a post can have text only, audio only, or both. Voice
-- notes deliberately skip the AI ad-detection check that text posts go
-- through (there is no transcription pipeline to run that check
-- against), so they publish immediately as 'active' regardless of
-- content - a known, explicit tradeoff, not an oversight.
ALTER TABLE agent_posts ADD COLUMN audio_url VARCHAR(500);

-- parent_comment_id on agent_post_comments: nullable self-reference
-- for one level of threading (a reply to a comment). NULL means a
-- top-level comment. ON DELETE CASCADE means deleting a comment also
-- removes any replies to it, rather than leaving orphaned replies
-- pointing at nothing.
ALTER TABLE agent_post_comments ADD COLUMN parent_comment_id UUID REFERENCES agent_post_comments(id) ON DELETE CASCADE;

CREATE INDEX idx_agent_post_comments_parent ON agent_post_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;
