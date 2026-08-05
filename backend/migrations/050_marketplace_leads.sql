-- Marketplace CRM foundation.
--
-- Each marketplace conversation corresponds to one sales lead for the seller.
-- Existing conversations are backfilled, while a trigger creates leads for
-- future conversations automatically.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'marketplace_lead_status'
  ) THEN
    CREATE TYPE marketplace_lead_status AS ENUM (
      'new',
      'contacted',
      'negotiating',
      'payment_pending',
      'completed',
      'lost'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS marketplace_leads (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  conversation_id       UUID NOT NULL
                          REFERENCES marketplace_conversations(id)
                          ON DELETE CASCADE,

  advertisement_id      UUID NOT NULL
                          REFERENCES advertisements(id)
                          ON DELETE CASCADE,

  seller_id             UUID NOT NULL
                          REFERENCES users(id)
                          ON DELETE CASCADE,

  customer_id           UUID NOT NULL
                          REFERENCES users(id)
                          ON DELETE CASCADE,

  status                marketplace_lead_status
                          NOT NULL DEFAULT 'new',

  priority              VARCHAR(20)
                          NOT NULL DEFAULT 'normal'
                          CHECK (
                            priority IN (
                              'low',
                              'normal',
                              'high',
                              'urgent'
                            )
                          ),

  assigned_to           UUID
                          REFERENCES users(id)
                          ON DELETE SET NULL,

  estimated_value       NUMERIC(14, 2)
                          CHECK (
                            estimated_value IS NULL
                            OR estimated_value >= 0
                          ),

  next_follow_up_at     TIMESTAMPTZ,
  last_contacted_at     TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_marketplace_lead_conversation
    UNIQUE (conversation_id),

  CONSTRAINT chk_marketplace_lead_participants
    CHECK (seller_id <> customer_id),

  CONSTRAINT chk_marketplace_lead_closed_state
    CHECK (
      (
        status IN ('completed', 'lost')
        AND closed_at IS NOT NULL
      )
      OR
      (
        status NOT IN ('completed', 'lost')
        AND closed_at IS NULL
      )
    )
);

CREATE TABLE IF NOT EXISTS marketplace_lead_notes (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  lead_id               UUID NOT NULL
                          REFERENCES marketplace_leads(id)
                          ON DELETE CASCADE,

  created_by            UUID NOT NULL
                          REFERENCES users(id)
                          ON DELETE CASCADE,

  note                  TEXT NOT NULL
                          CHECK (
                            CHAR_LENGTH(BTRIM(note))
                            BETWEEN 1 AND 5000
                          ),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_leads_seller_updated
  ON marketplace_leads (seller_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_leads_seller_status
  ON marketplace_leads (seller_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_leads_customer
  ON marketplace_leads (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_leads_advertisement
  ON marketplace_leads (advertisement_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketplace_leads_assigned
  ON marketplace_leads (assigned_to, status, updated_at DESC)
  WHERE assigned_to IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_marketplace_leads_follow_up
  ON marketplace_leads (
    seller_id,
    next_follow_up_at
  )
  WHERE
    next_follow_up_at IS NOT NULL
    AND status NOT IN ('completed', 'lost');

CREATE INDEX IF NOT EXISTS idx_marketplace_lead_notes_lead_created
  ON marketplace_lead_notes (lead_id, created_at DESC);

-- Backfill a lead for every existing marketplace conversation.
INSERT INTO marketplace_leads (
  conversation_id,
  advertisement_id,
  seller_id,
  customer_id,
  status,
  created_at,
  updated_at
)
SELECT
  mc.id,
  mc.advertisement_id,
  mc.seller_id,
  mc.customer_id,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM marketplace_messages mm
      WHERE mm.conversation_id = mc.id
        AND mm.sender_id = mc.seller_id
    )
      THEN 'contacted'::marketplace_lead_status
    ELSE 'new'::marketplace_lead_status
  END,
  mc.created_at,
  mc.updated_at
FROM marketplace_conversations mc
ON CONFLICT (conversation_id) DO NOTHING;

-- Automatically create a CRM lead when a customer opens a new enquiry.
CREATE OR REPLACE FUNCTION create_marketplace_lead_from_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO marketplace_leads (
    conversation_id,
    advertisement_id,
    seller_id,
    customer_id,
    status,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.advertisement_id,
    NEW.seller_id,
    NEW.customer_id,
    'new',
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT (conversation_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_marketplace_lead
  ON marketplace_conversations;

CREATE TRIGGER trg_create_marketplace_lead
AFTER INSERT ON marketplace_conversations
FOR EACH ROW
EXECUTE FUNCTION create_marketplace_lead_from_conversation();

-- Keep updated_at current and maintain closed_at consistently.
CREATE OR REPLACE FUNCTION maintain_marketplace_lead_state()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();

  IF NEW.status IN ('completed', 'lost') THEN
    IF OLD.status IS DISTINCT FROM NEW.status
       OR NEW.closed_at IS NULL THEN
      NEW.closed_at = NOW();
    END IF;
  ELSE
    NEW.closed_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintain_marketplace_lead_state
  ON marketplace_leads;

CREATE TRIGGER trg_maintain_marketplace_lead_state
BEFORE UPDATE ON marketplace_leads
FOR EACH ROW
EXECUTE FUNCTION maintain_marketplace_lead_state();

CREATE OR REPLACE FUNCTION touch_marketplace_lead_note()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_marketplace_lead_note
  ON marketplace_lead_notes;

CREATE TRIGGER trg_touch_marketplace_lead_note
BEFORE UPDATE ON marketplace_lead_notes
FOR EACH ROW
EXECUTE FUNCTION touch_marketplace_lead_note();
