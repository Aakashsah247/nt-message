-- M6: account-level privacy settings for messaging presence and read receipts.
ALTER TABLE "accounts"
  ADD COLUMN IF NOT EXISTS "show_online_status" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "show_read_receipts" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "accounts_show_online_status_idx"
ON "accounts"("show_online_status");
