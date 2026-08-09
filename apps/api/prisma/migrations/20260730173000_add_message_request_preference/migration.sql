-- Preserve the existing first-contact policy for every account by default.
ALTER TABLE "accounts"
ADD COLUMN "require_message_requests" BOOLEAN NOT NULL DEFAULT true;
