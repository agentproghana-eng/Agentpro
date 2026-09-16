-- Cursor indexes for scalable Ask AgentPro history retrieval.
--
-- Conversation history:
--   user scoped, newest updated conversation first.
--
-- Message history:
--   conversation scoped, newest message first.

CREATE INDEX IF NOT EXISTS
  idx_ai_conversations_user_updated_cursor
ON ai_conversations (
  user_id,
  updated_at DESC,
  id DESC
);

CREATE INDEX IF NOT EXISTS
  idx_ai_messages_conversation_created_cursor
ON ai_messages (
  conversation_id,
  created_at DESC,
  id DESC
);
