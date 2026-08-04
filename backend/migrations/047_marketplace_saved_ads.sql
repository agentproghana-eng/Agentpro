-- Saved marketplace advertisements.

CREATE TABLE IF NOT EXISTS marketplace_saved_ads (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ad_id       UUID NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_marketplace_saved_ads_user_ad
    UNIQUE (user_id, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_marketplace_saved_ads_user_created
  ON marketplace_saved_ads (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_saved_ads_ad
  ON marketplace_saved_ads (ad_id);
