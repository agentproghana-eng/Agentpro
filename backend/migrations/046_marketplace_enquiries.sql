-- Private customer-to-seller conversations attached to marketplace ads.

CREATE TABLE marketplace_conversations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  advertisement_id  UUID NOT NULL
                    REFERENCES advertisements(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
  seller_id         UUID NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
  status            VARCHAR(20) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'closed')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (advertisement_id, customer_id),
  CHECK (customer_id <> seller_id)
);

CREATE TABLE marketplace_messages (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id   UUID NOT NULL
                    REFERENCES marketplace_conversations(id)
                    ON DELETE CASCADE,
  sender_id         UUID NOT NULL
                    REFERENCES users(id) ON DELETE CASCADE,
  body              TEXT NOT NULL
                    CHECK (
                      CHAR_LENGTH(BTRIM(body)) BETWEEN 1 AND 2000
                    ),
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_marketplace_conversations_customer
  ON marketplace_conversations (customer_id, updated_at DESC);

CREATE INDEX idx_marketplace_conversations_seller
  ON marketplace_conversations (seller_id, updated_at DESC);

CREATE INDEX idx_marketplace_messages_conversation
  ON marketplace_messages (conversation_id, created_at ASC);

CREATE INDEX idx_marketplace_messages_unread
  ON marketplace_messages (conversation_id, sender_id, read_at)
  WHERE read_at IS NULL;
