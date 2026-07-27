-- Comments/replies can now be voice notes too, mirroring agent_posts'
-- audio_url. Nullable, since a comment can be text, audio, or both -
-- same design as posts.
ALTER TABLE agent_post_comments ADD COLUMN audio_url VARCHAR(500);
