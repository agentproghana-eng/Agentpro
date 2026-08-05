-- Marketplace verification and featured-business controls are deliberately
-- separate from company account approval. An active company can use AgentPro
-- without automatically receiving a public marketplace trust badge.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS marketplace_verified BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marketplace_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketplace_verified_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS marketplace_featured BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS marketplace_featured_priority INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketplace_featured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS marketplace_featured_by UUID REFERENCES users(id);

ALTER TABLE companies
  DROP CONSTRAINT IF EXISTS chk_marketplace_featured_priority;

ALTER TABLE companies
  ADD CONSTRAINT chk_marketplace_featured_priority
  CHECK (marketplace_featured_priority >= 0);

CREATE INDEX IF NOT EXISTS idx_companies_marketplace_featured
  ON companies (
    marketplace_featured,
    marketplace_featured_priority DESC,
    marketplace_featured_at DESC
  )
  WHERE marketplace_featured = TRUE;

CREATE INDEX IF NOT EXISTS idx_companies_marketplace_verified
  ON companies (marketplace_verified)
  WHERE marketplace_verified = TRUE;
