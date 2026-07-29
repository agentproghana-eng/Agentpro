-- Personal Subscriber accounts: individuals using the app for their own
-- regular Mobile Money SIM (Send Money, Buy Airtime/Data/Mash Up, check
-- balances), distinct from the existing Agent/Business side. A single
-- user can hold both at once (Option A from planning discussion): role
-- continues to describe someone's business capacity (unchanged for
-- existing agents/owners/etc.), while presence of a row in
-- personal_subscriptions is what separately marks "this user also has
-- Personal capability" - the two are independent, exactly like account
-- type and subscription plan are meant to be independent per spec.
-- 'customer' was already sitting unused in user_role for this purpose.

CREATE TYPE personal_subscription_plan AS ENUM ('free', 'paid');

CREATE TABLE personal_subscriptions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan          personal_subscription_plan NOT NULL DEFAULT 'free',
  expires_at    TIMESTAMPTZ, -- NULL while on free; set to the paid period's end once subscribed
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only meaningful for a user holding both an Agent/Business role and
-- Personal capability at once. SimCardService only identifies which
-- network a SIM is on, not which "hat" it's for - an agent line and a
-- personal number can easily share the same network, so this needs its
-- own explicit tagging rather than being inferred.
CREATE TYPE sim_purpose AS ENUM ('agent', 'personal');

CREATE TABLE user_sim_purposes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sim_slot    INTEGER NOT NULL,
  sim_iccid   TEXT, -- best-effort cross-check only; slot is the reliable key since ICCID isn't always available
  purpose     sim_purpose NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, sim_slot)
);

-- Extends the same transaction_type enum the Agent side already uses
-- (rather than introduce a second, parallel enum) since ussd_flows.
-- transaction_type is typed against this exact enum, and Personal flows
-- need to use that same column. Extending a shared enum doesn't force
-- every table using it to accept every value in practice - application-
-- level validation still gates what's actually ever inserted per use
-- case, same as with the commission-related values added in migration 011.
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'send_money_same_network';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'send_money_cross_network';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'buy_airtime';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'buy_data';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'buy_mashup';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'check_momo_balance';
ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'check_airtime_balance';

-- Deliberately separate from (not a variant of) the Agent transactions
-- table: no branch_id/company_id (Personal users have neither), no fee,
-- no commission - genuinely simpler, matching what Personal transactions
-- actually are.
CREATE TABLE personal_transactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL REFERENCES users(id),
  reference         VARCHAR(100) NOT NULL UNIQUE,
  network_reference VARCHAR(100),
  provider          provider NOT NULL,
  transaction_type  transaction_type NOT NULL,
  status            transaction_status NOT NULL DEFAULT 'initiated',
  amount            DECIMAL(15, 2), -- NULL for balance-enquiry-style types
  recipient_phone   VARCHAR(20), -- send_money only
  sim_iccid         TEXT,
  sim_slot          INTEGER,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ
);

CREATE INDEX idx_personal_transactions_user ON personal_transactions(user_id, created_at DESC);

-- Personal Community: fully separate from agent_posts (never shared,
-- per spec) but structurally mirrors it for consistency, with one real
-- addition - parent_comment_id enables actual reply-to-comment
-- threading, which the existing Agent community has never had. Added
-- deliberately because the spec calls out "comment on a post" and
-- "reply to a comment" as two distinct capabilities, not the same thing.
CREATE TABLE personal_posts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id       UUID NOT NULL REFERENCES users(id),
  content         TEXT NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  flagged_reason  TEXT,
  reviewed_by     UUID REFERENCES users(id),
  reviewed_at     TIMESTAMPTZ,
  removed_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE personal_post_likes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID NOT NULL REFERENCES personal_posts(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, user_id)
);

CREATE TABLE personal_post_comments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id           UUID NOT NULL REFERENCES personal_posts(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES personal_post_comments(id) ON DELETE CASCADE,
  author_id         UUID NOT NULL REFERENCES users(id),
  content           TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE personal_post_comment_reactions (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  comment_id    UUID NOT NULL REFERENCES personal_post_comments(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id),
  reaction_type VARCHAR(10) NOT NULL DEFAULT 'like',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(comment_id, user_id)
);

CREATE INDEX idx_personal_posts_created ON personal_posts(created_at DESC) WHERE status = 'active';
CREATE INDEX idx_personal_posts_pending ON personal_posts(created_at) WHERE status = 'pending_review';
CREATE INDEX idx_personal_post_likes_post ON personal_post_likes(post_id);
CREATE INDEX idx_personal_post_comments_post ON personal_post_comments(post_id);
CREATE INDEX idx_personal_post_comments_parent ON personal_post_comments(parent_comment_id);
CREATE INDEX idx_personal_post_comment_reactions_comment ON personal_post_comment_reactions(comment_id);

-- Adds a third ownership tier to ussd_flows alongside the existing
-- global (company_id IS NULL) and company-owned tiers: a Personal
-- subscriber's own flow, which overrides the global default for that
-- individual the same way a company's own flow already overrides the
-- global default for its agents. A flow is never both company-owned
-- and personally-owned at once.
ALTER TABLE ussd_flows ADD COLUMN owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ussd_flows ADD CONSTRAINT chk_ussd_flows_single_owner
  CHECK (company_id IS NULL OR owner_user_id IS NULL);

-- Only one active personal flow per user per provider+type, mirroring
-- the existing per-company uniqueness rule.
CREATE UNIQUE INDEX idx_ussd_flows_personal_unique
  ON ussd_flows(owner_user_id, provider, transaction_type)
  WHERE owner_user_id IS NOT NULL AND is_active = true;
