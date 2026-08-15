-- Phase 2B: track whether an expired attachment's physical object was removed.
-- Logical message/announcement records stay in PostgreSQL so the UI can show
-- "Attachment expired" while failed storage deletions remain retryable.

ALTER TABLE "message_attachments"
  ADD COLUMN "purged_at" TIMESTAMPTZ(3);

CREATE INDEX "message_attachments_purge_idx"
  ON "message_attachments" ("purged_at", "expires_at");

ALTER TABLE "announcement_attachments"
  ADD COLUMN "purged_at" TIMESTAMPTZ(3);

CREATE INDEX "announcement_attachments_purge_idx"
  ON "announcement_attachments" ("purged_at", "expires_at");
