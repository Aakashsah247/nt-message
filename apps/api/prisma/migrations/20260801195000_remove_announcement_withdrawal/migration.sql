-- Announcement deletion is now permanent for every deletable lifecycle state.
-- Existing withdrawn records are removed before the obsolete enum value and
-- withdrawal metadata columns are dropped.
DELETE FROM "announcements"
WHERE "status" = 'WITHDRAWN';

ALTER TABLE "announcements"
DROP CONSTRAINT IF EXISTS "announcements_withdrawn_by_account_id_fkey";

ALTER TABLE "announcements"
DROP COLUMN IF EXISTS "withdrawn_by_account_id",
DROP COLUMN IF EXISTS "withdrawn_at";

ALTER TABLE "announcements"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "AnnouncementStatus" RENAME TO "AnnouncementStatus_old";

CREATE TYPE "AnnouncementStatus" AS ENUM (
  'DRAFT',
  'SCHEDULED',
  'PUBLISHING',
  'PUBLISHED',
  'EXPIRED'
);

ALTER TABLE "announcements"
ALTER COLUMN "status" TYPE "AnnouncementStatus"
USING ("status"::text::"AnnouncementStatus");

ALTER TABLE "announcements"
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE "AnnouncementStatus_old";
