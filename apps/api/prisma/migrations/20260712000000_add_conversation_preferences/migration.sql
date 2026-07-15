-- Add per-user conversation controls without changing message ownership or group rules.
ALTER TABLE "conversation_participants"
  ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pinned_at" TIMESTAMPTZ(3),
  ADD COLUMN "muted_until" TIMESTAMPTZ(3),
  ADD COLUMN "archived_at" TIMESTAMPTZ(3),
  ADD COLUMN "marked_unread_at" TIMESTAMPTZ(3),
  ADD COLUMN "draft_text" TEXT,
  ADD COLUMN "draft_updated_at" TIMESTAMPTZ(3);

CREATE INDEX "conversation_participants_account_pin_idx"
  ON "conversation_participants"("account_id", "left_at", "is_pinned", "pinned_at");

CREATE INDEX "conversation_participants_account_archive_idx"
  ON "conversation_participants"("account_id", "is_archived", "updated_at");

CREATE INDEX "conversation_participants_account_draft_idx"
  ON "conversation_participants"("account_id", "draft_updated_at");
