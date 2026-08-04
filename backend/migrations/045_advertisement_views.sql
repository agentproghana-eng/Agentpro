-- Timestamped marketplace ad views for Business Hub analytics.
-- Existing advertisements.views_count remains the lifetime counter.
-- This table records only views occurring after this migration is deployed.

CREATE TABLE IF NOT EXISTS advertisement_views (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  advertisement_id  UUID NOT NULL
                    REFERENCES advertisements(id) ON DELETE CASCADE,
  viewed_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  viewed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advertisement_views_ad_date
  ON advertisement_views (advertisement_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_advertisement_views_viewed_at
  ON advertisement_views (viewed_at DESC);
