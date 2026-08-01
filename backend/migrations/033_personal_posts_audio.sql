-- Adds voice-note support to Personal Community posts, matching Agent's
-- own agent_posts.audio_url column exactly (same Cloudinary upload
-- helper, same multer config on the route). content was NOT NULL,
-- which blocked a voice-note-only post with no text at all - same as
-- Agent Community allows.
ALTER TABLE personal_posts ADD COLUMN audio_url TEXT;
ALTER TABLE personal_posts ALTER COLUMN content DROP NOT NULL;
