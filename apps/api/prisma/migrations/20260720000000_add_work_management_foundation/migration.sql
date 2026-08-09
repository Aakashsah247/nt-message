-- M20 Phase 2A: establish role-scoped work and trouble-ticket records.
-- Duty rosters, help requests, completion reports and evidence are added in later migrations.

CREATE TYPE "WorkItemType" AS ENUM (
  'ROUTINE_TASK',
  'TROUBLE_TICKET',
  'MAINTENANCE',
  'INSPECTION',
  'EMERGENCY_WORK',
  'ADMINISTRATIVE_TASK'
);

CREATE TYPE "WorkPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

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

CREATE TYPE "WorkAssignmentRole" AS ENUM ('PRIMARY', 'SUPPORTING');

CREATE TYPE "WorkActivityAction" AS ENUM (
  'CREATED',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'STARTED',
  'STATUS_CHANGED',
  'REASSIGNED',
  'SUPPORT_ADDED',
  'SUPPORT_REMOVED',
  'COMPLETION_SUBMITTED',
  'INFORMATION_REQUESTED',
  'CLOSED',
  'REOPENED',
  'CANCELLED'
);

-- One branch-wide sequence keeps human-readable ticket numbers collision-free.
CREATE SEQUENCE IF NOT EXISTS "work_ticket_sequence" START WITH 1 INCREMENT BY 1;

CREATE TABLE "work_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ticket_number" VARCHAR(50) NOT NULL,
  "type" "WorkItemType" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT NOT NULL,
  "category" VARCHAR(80),
  "priority" "WorkPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "WorkItemStatus" NOT NULL DEFAULT 'ASSIGNED',
  "division_id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "location_text" VARCHAR(300),
  "planned_start_at" TIMESTAMPTZ(3),
  "due_at" TIMESTAMPTZ(3) NOT NULL,
  "created_by_account_id" UUID NOT NULL,
  "responsible_manager_account_id" UUID NOT NULL,
  "completed_at" TIMESTAMPTZ(3),
  "closed_at" TIMESTAMPTZ(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "work_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_items_version_positive_check" CHECK ("version" > 0),
  CONSTRAINT "work_items_due_after_start_check" CHECK (
    "planned_start_at" IS NULL OR "due_at" > "planned_start_at"
  )
);

CREATE TABLE "work_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_item_id" UUID NOT NULL,
  "assignee_account_id" UUID NOT NULL,
  "assignment_role" "WorkAssignmentRole" NOT NULL,
  "assigned_by_account_id" UUID NOT NULL,
  "acknowledged_at" TIMESTAMPTZ(3),
  "started_at" TIMESTAMPTZ(3),
  "ended_at" TIMESTAMPTZ(3),
  "end_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "work_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_activities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_item_id" UUID NOT NULL,
  "actor_account_id" UUID NOT NULL,
  "action" "WorkActivityAction" NOT NULL,
  "from_status" "WorkItemStatus",
  "to_status" "WorkItemStatus",
  "details" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "work_activities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_items_ticket_number_key"
ON "work_items"("ticket_number");

CREATE INDEX "work_items_status_due_idx"
ON "work_items"("status", "due_at");

CREATE INDEX "work_items_division_status_due_idx"
ON "work_items"("division_id", "status", "due_at");

CREATE INDEX "work_items_department_status_due_idx"
ON "work_items"("department_id", "status", "due_at");

CREATE INDEX "work_items_creator_created_idx"
ON "work_items"("created_by_account_id", "created_at");

CREATE INDEX "work_items_manager_status_due_idx"
ON "work_items"("responsible_manager_account_id", "status", "due_at");

CREATE INDEX "work_assignments_item_active_role_idx"
ON "work_assignments"("work_item_id", "ended_at", "assignment_role");

CREATE INDEX "work_assignments_assignee_active_idx"
ON "work_assignments"("assignee_account_id", "ended_at", "created_at");

CREATE INDEX "work_assignments_assigner_created_idx"
ON "work_assignments"("assigned_by_account_id", "created_at");

-- A ticket has exactly one active primary owner and no duplicate active helper.
CREATE UNIQUE INDEX "work_assignments_one_active_primary_key"
ON "work_assignments"("work_item_id")
WHERE "ended_at" IS NULL AND "assignment_role" = 'PRIMARY';

CREATE UNIQUE INDEX "work_assignments_one_active_assignee_key"
ON "work_assignments"("work_item_id", "assignee_account_id")
WHERE "ended_at" IS NULL;

CREATE INDEX "work_activities_item_created_idx"
ON "work_activities"("work_item_id", "created_at");

CREATE INDEX "work_activities_actor_created_idx"
ON "work_activities"("actor_account_id", "created_at");

CREATE INDEX "work_activities_action_created_idx"
ON "work_activities"("action", "created_at");

ALTER TABLE "work_items"
  ADD CONSTRAINT "work_items_division_id_fkey"
  FOREIGN KEY ("division_id") REFERENCES "divisions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_items"
  ADD CONSTRAINT "work_items_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_items"
  ADD CONSTRAINT "work_items_created_by_account_id_fkey"
  FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_items"
  ADD CONSTRAINT "work_items_responsible_manager_account_id_fkey"
  FOREIGN KEY ("responsible_manager_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_assignments"
  ADD CONSTRAINT "work_assignments_work_item_id_fkey"
  FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_assignments"
  ADD CONSTRAINT "work_assignments_assignee_account_id_fkey"
  FOREIGN KEY ("assignee_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_assignments"
  ADD CONSTRAINT "work_assignments_assigned_by_account_id_fkey"
  FOREIGN KEY ("assigned_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_activities"
  ADD CONSTRAINT "work_activities_work_item_id_fkey"
  FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_activities"
  ADD CONSTRAINT "work_activities_actor_account_id_fkey"
  FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
