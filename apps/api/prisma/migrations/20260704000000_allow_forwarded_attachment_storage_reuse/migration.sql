-- Y23F: allow forwarded attachment messages to reuse the same stored object.
DROP INDEX IF EXISTS "message_attachments_storage_key_key";
CREATE INDEX IF NOT EXISTS "message_attachments_storage_key_idx"
ON "message_attachments"("storage_key");
