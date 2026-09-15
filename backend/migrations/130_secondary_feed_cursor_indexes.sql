-- Seller-owned ads, newest first.
CREATE INDEX IF NOT EXISTS idx_advertisements_owner_created_cursor
  ON advertisements (posted_by, created_at DESC, id DESC);

-- Seller review stream. The advertisement join filters ownership.
CREATE INDEX IF NOT EXISTS idx_ad_ratings_ad_created_cursor
  ON ad_ratings (advertisement_id, created_at DESC, id DESC);

-- Agent Community moderation list includes all statuses.
CREATE INDEX IF NOT EXISTS idx_agent_posts_moderation_cursor
  ON agent_posts (
    is_pinned DESC,
    is_urgent DESC,
    created_at DESC,
    id DESC
  );

-- Global moderation history, newest first.
CREATE INDEX IF NOT EXISTS idx_agent_moderation_history_created_cursor
  ON agent_post_moderation_history (created_at DESC, id DESC);
