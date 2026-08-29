-- WM-V2 retires per-work priority. All work follows the same operational priority.
-- Historical priority-change activities are retained as generic detail updates so
-- the audit record remains present while the retired enum value is removed.

ALTER TABLE "work_items" DROP COLUMN "priority";
DROP TYPE "WorkPriority";

ALTER TABLE "work_activities"
  ALTER COLUMN "action" TYPE TEXT USING "action"::TEXT;

UPDATE "work_activities"
SET "action" = 'DETAILS_UPDATED'
WHERE "action" = 'PRIORITY_CHANGED';

DROP TYPE "WorkActivityAction";

CREATE TYPE "WorkActivityAction" AS ENUM (
  'CREATED',
  'ASSIGNED',
  'TEAM_ASSIGNED',
  'SALES_MEMBER_ASSIGNED',
  'SALES_DOCUMENTS_SENT',
  'SALES_WORK_COMPLETED',
  'ACKNOWLEDGED',
  'STARTED',
  'STATUS_CHANGED',
  'REASSIGNED',
  'SUPPORT_ADDED',
  'SUPPORT_REMOVED',
  'HELP_REQUESTED',
  'HELP_ACCEPTED',
  'HELP_DECLINED',
  'COMPLETION_SUBMITTED',
  'INFORMATION_REQUESTED',
  'CLOSED',
  'REOPENED',
  'CANCELLED',
  'DETAILS_UPDATED',
  'DUE_DATE_CHANGED',
  'RETENTION_HOLD_APPLIED',
  'RETENTION_HOLD_RELEASED',
  'DELETION_REVIEW_REQUESTED',
  'DELETION_REVIEW_CANCELLED',
  'DELEGATED'
);

ALTER TABLE "work_activities"
  ALTER COLUMN "action" TYPE "WorkActivityAction"
  USING "action"::"WorkActivityAction";
