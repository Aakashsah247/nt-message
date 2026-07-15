-- M4 follow-up: store display profile data on accounts so system Super Admins can also have photos/about text.
ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "profile_photo_key" VARCHAR(500),
  ADD COLUMN IF NOT EXISTS "profile_bio" VARCHAR(160);

CREATE INDEX IF NOT EXISTS "accounts_profile_photo_key_idx"
ON "accounts"("profile_photo_key");
