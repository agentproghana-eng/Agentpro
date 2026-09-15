-- Marketplace newest active feed.
CREATE INDEX IF NOT EXISTS idx_advertisements_active_cursor
  ON advertisements (published_at DESC, id DESC)
  WHERE status = 'active';

-- Agent Community ranking order.
CREATE INDEX IF NOT EXISTS idx_agent_posts_feed_cursor
  ON agent_posts (
    is_pinned DESC,
    is_urgent DESC,
    created_at DESC,
    id DESC
  )
  WHERE status IN ('active', 'pending_review');

-- Personal Community chronological feed.
CREATE INDEX IF NOT EXISTS idx_personal_posts_feed_cursor
  ON personal_posts (created_at DESC, id DESC)
  WHERE status IN ('active', 'pending_review');
