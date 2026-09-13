-- Phase 13: establish the final platform account-class boundary without
-- removing legacy AccountRole compatibility data yet.
CREATE TYPE "AccountClass" AS ENUM ('SUPER_ADMIN', 'OFFICE_USER');

ALTER TABLE "accounts"
ADD COLUMN "account_class" "AccountClass";

UPDATE "accounts"
SET "account_class" = CASE
  WHEN "role" = 'SUPER_ADMIN'::"AccountRole" THEN 'SUPER_ADMIN'::"AccountClass"
  ELSE 'OFFICE_USER'::"AccountClass"
END;

ALTER TABLE "accounts"
ALTER COLUMN "account_class" SET NOT NULL,
ALTER COLUMN "account_class" SET DEFAULT 'OFFICE_USER'::"AccountClass";

CREATE INDEX "accounts_account_class_idx" ON "accounts"("account_class");

-- Access/refresh tokens issued before this cutover carry the legacy role claim.
-- Revoke existing sessions so every account signs in again with accountClass tokens.
UPDATE "auth_sessions"
SET "revoked_at" = NOW()
WHERE "revoked_at" IS NULL;
