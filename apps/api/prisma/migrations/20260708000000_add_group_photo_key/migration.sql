-- M5B: optional group display photos for personal and official group conversations.
ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "group_photo_key" VARCHAR(500);

CREATE INDEX IF NOT EXISTS "conversations_group_photo_key_idx"
ON "conversations"("group_photo_key");
