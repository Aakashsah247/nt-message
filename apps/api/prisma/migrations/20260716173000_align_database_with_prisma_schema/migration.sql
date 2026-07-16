-- Align database-level definitions with the authoritative Prisma schema.
--
-- The preceding reconciliation migration intentionally restored missing
-- historical objects, but it also introduced several defaults, one index and
-- a narrower username type that are not represented by schema.prisma.
-- Removing these definitions does not modify existing rows.

DROP INDEX IF EXISTS "accounts_show_online_status_idx";

ALTER TABLE "accounts"
  ALTER COLUMN "username" SET DATA TYPE VARCHAR(255);

ALTER TABLE "activation_invitations"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "activity_events"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "daily_activity_summaries"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "group_invitation_links"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "message_attachments"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "messaging_account_blocks"
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "messaging_notifications"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "updated_at" DROP DEFAULT;
