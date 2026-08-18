-- pg_trgm accelerates the existing case-insensitive substring semantics used by
-- Search messages without changing what users can find.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Message bodies can grow to millions of rows per long-lived conversation. A
-- trigram GIN index prevents ILIKE '%term%' from degenerating into a full table scan.
CREATE INDEX IF NOT EXISTS "messages_text_content_trgm_idx"
ON "messages" USING GIN ("text_content" gin_trgm_ops);

-- Sender-name search is resolved to account IDs before the message query. This
-- composite index keeps sender-only matches efficient inside one conversation.
CREATE INDEX IF NOT EXISTS "messages_conversation_sender_sent_idx"
ON "messages" ("conversation_id", "sender_account_id", "sent_at", "id");

-- Attachment filename search keeps the same substring behavior while avoiding a
-- sequential scan across an ever-growing attachment table.
CREATE INDEX IF NOT EXISTS "message_attachments_original_file_name_trgm_idx"
ON "message_attachments" USING GIN ("original_file_name" gin_trgm_ops);
