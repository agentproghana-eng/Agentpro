-- Optimizes per-user recently viewed and recommendation queries.
CREATE INDEX IF NOT EXISTS idx_advertisement_views_user_date
  ON advertisement_views (viewed_by, viewed_at DESC)
  WHERE viewed_by IS NOT NULL;
