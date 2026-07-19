-- Voice-only posts have no text at all - content must become nullable
-- to support them (it was NOT NULL from the original Agents Hub
-- schema, before voice notes existed). A post is now valid with either
-- content, audio_url, or both - enforced in application code
-- (createPost), not a DB constraint, since "at least one of two
-- nullable columns" isn't expressible as a simple NOT NULL check
-- without a CHECK constraint that's easy to get subtly wrong.
ALTER TABLE agent_posts ALTER COLUMN content DROP NOT NULL;
