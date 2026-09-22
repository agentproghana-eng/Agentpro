-- Scale-safe Admin Portal Marketplace Businesses listing.
-- The legacy route remains available; the new cursor route uses this
-- deterministic mixed-direction ordering.

CREATE INDEX IF NOT EXISTS idx_companies_admin_marketplace_cursor
  ON companies (
    marketplace_featured DESC,
    marketplace_featured_priority DESC,
    marketplace_verified DESC,
    name ASC,
    id ASC
  );

CREATE INDEX IF NOT EXISTS idx_companies_admin_marketplace_name_prefix
  ON companies (
    LOWER(name) text_pattern_ops
  );

CREATE INDEX IF NOT EXISTS idx_companies_admin_marketplace_email_prefix
  ON companies (
    LOWER(email) text_pattern_ops
  )
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_marketplace_owner_email_prefix
  ON users (
    LOWER(email) text_pattern_ops,
    company_id
  )
  WHERE role IN (
    'business_owner',
    'marketplace_seller'
  );

CREATE INDEX IF NOT EXISTS idx_subscriptions_company_created_cursor
  ON subscriptions (
    company_id,
    created_at DESC,
    id DESC
  );

CREATE INDEX IF NOT EXISTS idx_advertisements_company_status_id
  ON advertisements (
    company_id,
    status,
    id
  );
