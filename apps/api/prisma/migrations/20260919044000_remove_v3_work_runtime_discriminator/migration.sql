-- Cut the canonical WorkItem row completely away from the retired V3 runtime
-- discriminator. WorkStage/WorkEvent/collaboration rows remain as historical
-- evidence, while the obsolete native-V3 collaboration write trigger is retired.


-- This trigger function is typed with WorkItemStatus and checks V3_RUNTIME.
-- Active collaboration writes were removed with the V3 runtime engine, so drop
-- only the obsolete trigger/function before replacing the enum. Historical rows
-- in work_collaboration_requests are preserved.
DROP TRIGGER IF EXISTS "work_collaboration_requests_integrity_trigger"
  ON "work_collaboration_requests";
DROP FUNCTION IF EXISTS "enforce_work_collaboration_request_integrity"();

DROP INDEX IF EXISTS "work_items_office_runtime_status_created_idx";
DROP INDEX IF EXISTS "work_items_primary_owner_runtime_status_due_idx";
DROP INDEX IF EXISTS "work_items_responsible_reviewer_runtime_due_idx";

ALTER TABLE "work_items" DROP COLUMN IF EXISTS "runtime_status";

-- Normalize classic lifecycle snapshots before removing V3_RUNTIME from the
-- canonical enum. Runtime-specific history remains in WorkEvent runtime-status
-- columns and WorkHelpRequest.previous_runtime_status.
UPDATE "work_activities"
SET "from_status" = 'ASSIGNED'::"WorkItemStatus"
WHERE "from_status" = 'V3_RUNTIME'::"WorkItemStatus";

UPDATE "work_activities"
SET "to_status" = 'ASSIGNED'::"WorkItemStatus"
WHERE "to_status" = 'V3_RUNTIME'::"WorkItemStatus";

UPDATE "work_help_requests"
SET "previous_status" = 'ASSIGNED'::"WorkItemStatus"
WHERE "previous_status" = 'V3_RUNTIME'::"WorkItemStatus";

ALTER TABLE "work_items" ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "WorkItemStatus" RENAME TO "WorkItemStatus_retired_v3";
CREATE TYPE "WorkItemStatus" AS ENUM (
  'ASSIGNED',
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'HELP_REQUESTED',
  'COMPLETED_PENDING_REVIEW',
  'CLOSED',
  'REOPENED',
  'BLOCKED',
  'CANCELLED'
);

ALTER TABLE "work_items"
  ALTER COLUMN "status" TYPE "WorkItemStatus"
  USING "status"::text::"WorkItemStatus";
ALTER TABLE "work_activities"
  ALTER COLUMN "from_status" TYPE "WorkItemStatus"
  USING "from_status"::text::"WorkItemStatus",
  ALTER COLUMN "to_status" TYPE "WorkItemStatus"
  USING "to_status"::text::"WorkItemStatus";
ALTER TABLE "work_help_requests"
  ALTER COLUMN "previous_status" TYPE "WorkItemStatus"
  USING "previous_status"::text::"WorkItemStatus";

ALTER TABLE "work_items"
  ALTER COLUMN "status" SET DEFAULT 'ASSIGNED'::"WorkItemStatus";

DROP TYPE "WorkItemStatus_retired_v3";
