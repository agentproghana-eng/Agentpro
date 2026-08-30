-- Community service-request foundation.
--
-- Privacy:
-- Exact residential or street coordinates are not stored.
-- Application input is reduced to approximate coordinates before
-- persistence and proximity matching.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'community_service_request_status'
  ) THEN
    CREATE TYPE community_service_request_status AS ENUM (
      'requested',
      'providers_found',
      'offers_received',
      'provider_selected',
      'in_progress',
      'completed',
      'reviewed'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'community_service_offer_status'
  ) THEN
    CREATE TYPE community_service_offer_status AS ENUM (
      'submitted',
      'selected',
      'rejected',
      'withdrawn'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS community_service_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_service_provider_profiles (
  user_id UUID PRIMARY KEY
    REFERENCES users(id)
    ON DELETE CASCADE,

  display_name VARCHAR(120) NOT NULL,
  business_name VARCHAR(160),
  bio VARCHAR(1000),
  area_label VARCHAR(160) NOT NULL,

  approx_latitude NUMERIC(5, 2) NOT NULL
    CHECK (
      approx_latitude >= -90
      AND approx_latitude <= 90
    ),

  approx_longitude NUMERIC(6, 2) NOT NULL
    CHECK (
      approx_longitude >= -180
      AND approx_longitude <= 180
    ),

  service_radius_km NUMERIC(5, 1) NOT NULL DEFAULT 15
    CHECK (
      service_radius_km >= 1
      AND service_radius_km <= 50
    ),

  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_service_provider_categories (
  provider_user_id UUID NOT NULL
    REFERENCES community_service_provider_profiles(user_id)
    ON DELETE CASCADE,

  category_id UUID NOT NULL
    REFERENCES community_service_categories(id)
    ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (
    provider_user_id,
    category_id
  )
);

CREATE TABLE IF NOT EXISTS community_service_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  requester_user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  category_id UUID NOT NULL
    REFERENCES community_service_categories(id),

  title VARCHAR(140) NOT NULL,
  description VARCHAR(2000) NOT NULL,
  area_label VARCHAR(160) NOT NULL,

  approx_latitude NUMERIC(5, 2) NOT NULL
    CHECK (
      approx_latitude >= -90
      AND approx_latitude <= 90
    ),

  approx_longitude NUMERIC(6, 2) NOT NULL
    CHECK (
      approx_longitude >= -180
      AND approx_longitude <= 180
    ),

  search_radius_km NUMERIC(5, 1) NOT NULL DEFAULT 15
    CHECK (
      search_radius_km >= 1
      AND search_radius_km <= 50
    ),

  status community_service_request_status
    NOT NULL DEFAULT 'requested',

  selected_provider_user_id UUID
    REFERENCES users(id)
    ON DELETE SET NULL,

  selected_offer_id UUID,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_service_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  request_id UUID NOT NULL
    REFERENCES community_service_requests(id)
    ON DELETE CASCADE,

  provider_user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  message VARCHAR(1000) NOT NULL,

  price_amount NUMERIC(14, 2)
    CHECK (
      price_amount IS NULL
      OR price_amount >= 0
    ),

  currency VARCHAR(3) NOT NULL DEFAULT 'GHS',
  availability_note VARCHAR(300),

  status community_service_offer_status
    NOT NULL DEFAULT 'submitted',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_community_service_offer_provider
    UNIQUE (
      request_id,
      provider_user_id
    )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname =
      'fk_community_service_request_selected_offer'
  ) THEN
    ALTER TABLE community_service_requests
      ADD CONSTRAINT
        fk_community_service_request_selected_offer
      FOREIGN KEY (selected_offer_id)
      REFERENCES community_service_offers(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS community_service_reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  request_id UUID NOT NULL UNIQUE
    REFERENCES community_service_requests(id)
    ON DELETE CASCADE,

  requester_user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  provider_user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  rating INTEGER NOT NULL
    CHECK (
      rating >= 1
      AND rating <= 5
    ),

  comment VARCHAR(1000),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS community_service_request_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  request_id UUID NOT NULL
    REFERENCES community_service_requests(id)
    ON DELETE CASCADE,

  actor_user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  from_status community_service_request_status,
  to_status community_service_request_status NOT NULL,
  event_type VARCHAR(60) NOT NULL,
  metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_service_provider_category
  ON community_service_provider_categories (
    category_id,
    provider_user_id
  );

CREATE INDEX IF NOT EXISTS idx_community_service_provider_location
  ON community_service_provider_profiles (
    active,
    approx_latitude,
    approx_longitude
  );

CREATE INDEX IF NOT EXISTS idx_community_service_request_owner
  ON community_service_requests (
    requester_user_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_community_service_request_discovery
  ON community_service_requests (
    category_id,
    status,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_community_service_request_location
  ON community_service_requests (
    category_id,
    status,
    approx_latitude,
    approx_longitude
  );

CREATE INDEX IF NOT EXISTS idx_community_service_offer_request
  ON community_service_offers (
    request_id,
    status,
    created_at ASC
  );

CREATE INDEX IF NOT EXISTS idx_community_service_event_request
  ON community_service_request_events (
    request_id,
    created_at ASC
  );

INSERT INTO community_service_categories (
  slug,
  name,
  description
)
VALUES
  ('plumbing', 'Plumbing', 'Plumbing and water-system services.'),
  ('carpentry', 'Carpentry', 'Carpentry, furniture and woodwork services.'),
  ('electrical', 'Electrical', 'Electrical installation and repair services.'),
  ('fashion-design', 'Fashion Design', 'Tailoring, sewing and fashion design.'),
  ('barbering', 'Barbering', 'Barbering and grooming services.'),
  ('beauty', 'Beauty', 'Hair, makeup and beauty services.'),
  ('teaching-tutoring', 'Teaching & Tutoring', 'Teaching and tutoring services.'),
  ('cleaning', 'Cleaning', 'Residential and commercial cleaning services.'),
  ('repairs-maintenance', 'Repairs & Maintenance', 'General repair and maintenance services.'),
  ('transport-delivery', 'Transport & Delivery', 'Transport, courier and delivery services.'),
  ('catering', 'Catering', 'Food preparation and catering services.'),
  ('photography-videography', 'Photography & Videography', 'Photography and video services.'),
  ('technology', 'Technology', 'IT, software and digital services.'),
  ('construction', 'Construction', 'Construction and building services.'),
  ('other', 'Other Services', 'Other professional and community services.')
ON CONFLICT (slug)
DO NOTHING;

-- Community service request moderation foundation.
--
-- Job lifecycle state and content moderation state are deliberately
-- separate. Moderation must never mutate the seven-stage service
-- request lifecycle.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'community_report_status'
  ) THEN
    CREATE TYPE community_report_status AS ENUM (
      'pending',
      'reviewed',
      'dismissed',
      'actioned'
    );
  END IF;
END
$$;

ALTER TABLE community_service_requests
  ADD COLUMN IF NOT EXISTS content_status VARCHAR(20)
    NOT NULL DEFAULT 'active'
    CHECK (
      content_status IN (
        'active',
        'pending_review',
        'removed'
      )
    ),

  ADD COLUMN IF NOT EXISTS moderated_by UUID
    REFERENCES users(id)
    ON DELETE SET NULL,

  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,

  ADD COLUMN IF NOT EXISTS moderation_reason TEXT;

CREATE TABLE IF NOT EXISTS community_service_request_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  request_id UUID NOT NULL
    REFERENCES community_service_requests(id)
    ON DELETE CASCADE,

  reported_by UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  reason VARCHAR(50) NOT NULL
    CHECK (
      reason IN (
        'spam',
        'fraud',
        'harassment',
        'misinformation',
        'inappropriate',
        'privacy',
        'other'
      )
    ),

  details TEXT
    CHECK (
      details IS NULL
      OR char_length(details) <= 2000
    ),

  status community_report_status
    NOT NULL DEFAULT 'pending',

  reviewed_by UUID
    REFERENCES users(id)
    ON DELETE SET NULL,

  reviewed_at TIMESTAMPTZ,

  resolution_note TEXT
    CHECK (
      resolution_note IS NULL
      OR char_length(resolution_note) <= 2000
    ),

  created_at TIMESTAMPTZ
    NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ
    NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_community_service_request_report_user
    UNIQUE (
      request_id,
      reported_by
    )
);

CREATE TABLE IF NOT EXISTS community_service_request_moderation_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  request_id UUID NOT NULL
    REFERENCES community_service_requests(id)
    ON DELETE CASCADE,

  moderator_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  action VARCHAR(40) NOT NULL
    CHECK (
      action IN (
        'mark_pending_review',
        'remove',
        'restore'
      )
    ),

  previous_values JSONB,

  new_values JSONB,

  reason TEXT
    CHECK (
      reason IS NULL
      OR char_length(reason) <= 2000
    ),

  created_at TIMESTAMPTZ
    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_service_request_reports_status
  ON community_service_request_reports (
    status,
    created_at ASC
  );

CREATE INDEX IF NOT EXISTS idx_community_service_request_reports_request
  ON community_service_request_reports (
    request_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_community_service_request_moderation_history
  ON community_service_request_moderation_history (
    request_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_community_service_visible_discovery
  ON community_service_requests (
    category_id,
    status,
    approx_latitude,
    approx_longitude,
    created_at DESC
  )
  WHERE content_status = 'active';
