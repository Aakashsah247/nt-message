-- Reconcile legacy migration history with the canonical Prisma schema.
--
-- These UUID and updated_at defaults were created by older migrations.
-- Current Prisma models generate UUID values through Prisma Client and
-- manage updatedAt through Prisma, so these PostgreSQL defaults must not
-- remain when the migration history is replayed.

ALTER TABLE "duty_activities"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "duty_assignments"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "duty_exceptions"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "duty_schedule_series"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "duty_shift_templates"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "emergency_alert_recipients"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "emergency_alerts"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "super_admin_profiles"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "work_activities"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "work_assignments"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "work_completion_reports"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "work_help_requests"
  ALTER COLUMN "id" DROP DEFAULT;

ALTER TABLE "work_items"
  ALTER COLUMN "id" DROP DEFAULT;
