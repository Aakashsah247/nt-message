-- Phase 6 / P6-A: additive Work Runtime V3 foundation.
--
-- This migration introduces the Office/OrgUnit-native runtime structures used
-- by new V3 Work without switching legacy WorkItem reads or writes. Existing
-- Work rows remain valid because the new WorkItem V3 context is nullable until
-- controlled compatibility backfill/cutover is executed in later milestones.
--
-- Locked invariants enforced here:
--   * one Work belongs to one Office and one immutable Work Type Version;
--   * one active Primary Owner OrgUnit per V3 Work;
--   * participants/stages/assignment targets stay inside the Work Office;
--   * runtime stage instances reference definitions from the Work's version;
--   * assignment target shape is explicit and active primary assignment is unique;
--   * stage submissions/approvals and configurable field values are auditable;
--   * high-value references are indexed separately from JSON field payloads;
--   * Work and Stage optimistic-concurrency versions remain positive.
--
-- No legacy Work data is backfilled and no legacy columns are dropped here.

CREATE TYPE "WorkRuntimeStatus" AS ENUM (
  'DRAFT',
  'OPEN',
  'IN_PROGRESS',
  'WAITING',
  'BLOCKED',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "WorkParticipantRole" AS ENUM (
  'PRIMARY_OWNER',
  'REQUIRED_PARTICIPANT',
  'CONDITIONAL_PARTICIPANT',
  'SUPPORTING_PARTICIPANT',
  'OBSERVER'
);

CREATE TYPE "WorkStageStatus" AS ENUM (
  'PENDING',
  'READY',
  'IN_PROGRESS',
  'BLOCKED',
  'SUBMITTED',
  'RETURNED',
  'COMPLETED',
  'SKIPPED',
  'CANCELLED'
);

CREATE TYPE "WorkStageAssignmentTargetType" AS ENUM (
  'ORG_UNIT_QUEUE',
  'TEAM',
  'ACCOUNT'
);

CREATE TYPE "WorkStageAssignmentRole" AS ENUM (
  'PRIMARY',
  'SUPPORTING'
);

CREATE TYPE "WorkStageApprovalDecision" AS ENUM (
  'APPROVED',
  'RETURNED'
);

CREATE TYPE "WorkEventType" AS ENUM (
  'WORK_CREATED',
  'WORK_STATUS_CHANGED',
  'PARTICIPANT_ADDED',
  'PARTICIPANT_ENDED',
  'STAGE_READY',
  'STAGE_ASSIGNED',
  'STAGE_STARTED',
  'STAGE_BLOCKED',
  'STAGE_UNBLOCKED',
  'STAGE_SUBMITTED',
  'STAGE_APPROVED',
  'STAGE_RETURNED',
  'STAGE_COMPLETED',
  'STAGE_SKIPPED',
  'STAGE_CANCELLED',
  'WORK_COMPLETED',
  'WORK_CANCELLED',
  'WORK_REOPENED',
  'OWNERSHIP_TRANSFERRED',
  'FIELD_UPDATED',
  'REFERENCE_UPDATED'
);

ALTER TABLE "work_items"
  ADD COLUMN "office_id" UUID,
  ADD COLUMN "work_type_version_id" UUID,
  ADD COLUMN "primary_owner_org_unit_id" UUID,
  ADD COLUMN "runtime_status" "WorkRuntimeStatus",
  ADD COLUMN "opened_at" TIMESTAMPTZ(3);

ALTER TABLE "work_items"
  ADD CONSTRAINT "work_items_v3_context_complete_check"
  CHECK (
    (
      "office_id" IS NULL
      AND "work_type_version_id" IS NULL
      AND "primary_owner_org_unit_id" IS NULL
      AND "runtime_status" IS NULL
    )
    OR
    (
      "office_id" IS NOT NULL
      AND "work_type_version_id" IS NOT NULL
      AND "primary_owner_org_unit_id" IS NOT NULL
      AND "runtime_status" IS NOT NULL
    )
  );

CREATE INDEX "work_items_office_runtime_status_created_idx"
ON "work_items"("office_id", "runtime_status", "created_at");

CREATE INDEX "work_items_primary_owner_runtime_status_due_idx"
ON "work_items"("primary_owner_org_unit_id", "runtime_status", "due_at");

CREATE INDEX "work_items_work_type_version_created_idx"
ON "work_items"("work_type_version_id", "created_at");

ALTER TABLE "work_items"
  ADD CONSTRAINT "work_items_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_items_work_type_version_id_fkey"
  FOREIGN KEY ("work_type_version_id") REFERENCES "work_type_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_items_primary_owner_org_unit_id_fkey"
  FOREIGN KEY ("primary_owner_org_unit_id") REFERENCES "org_units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_org_unit_participants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_item_id" UUID NOT NULL,
  "org_unit_id" UUID NOT NULL,
  "role" "WorkParticipantRole" NOT NULL,
  "added_by_account_id" UUID,
  "ended_by_account_id" UUID,
  "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMPTZ(3),
  "end_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "work_org_unit_participants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_participants_effective_range_check"
    CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at"),
  CONSTRAINT "work_participants_end_reason_check"
    CHECK (
      ("ended_at" IS NULL AND "ended_by_account_id" IS NULL AND "end_reason" IS NULL)
      OR
      ("ended_at" IS NOT NULL AND "end_reason" IS NOT NULL AND btrim("end_reason") <> '')
    )
);

CREATE UNIQUE INDEX "work_participants_one_active_primary_owner_key"
ON "work_org_unit_participants"("work_item_id")
WHERE "role" = 'PRIMARY_OWNER' AND "ended_at" IS NULL;

CREATE UNIQUE INDEX "work_participants_active_unit_role_key"
ON "work_org_unit_participants"("work_item_id", "org_unit_id", "role")
WHERE "ended_at" IS NULL;

CREATE INDEX "work_participants_item_active_role_idx"
ON "work_org_unit_participants"("work_item_id", "ended_at", "role");

CREATE INDEX "work_participants_unit_active_role_idx"
ON "work_org_unit_participants"("org_unit_id", "ended_at", "role");

CREATE INDEX "work_participants_added_by_created_idx"
ON "work_org_unit_participants"("added_by_account_id", "created_at");

CREATE INDEX "work_participants_ended_by_ended_idx"
ON "work_org_unit_participants"("ended_by_account_id", "ended_at");

ALTER TABLE "work_org_unit_participants"
  ADD CONSTRAINT "work_participants_work_item_id_fkey"
  FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_participants_org_unit_id_fkey"
  FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_participants_added_by_account_id_fkey"
  FOREIGN KEY ("added_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_participants_ended_by_account_id_fkey"
  FOREIGN KEY ("ended_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_stages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_item_id" UUID NOT NULL,
  "stage_definition_id" UUID NOT NULL,
  "responsible_org_unit_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "assignment_mode" "WorkStageAssignmentMode" NOT NULL,
  "approval_mode" "WorkStageApprovalMode" NOT NULL DEFAULT 'NONE',
  "approval_leadership_type" "OrgLeadershipType",
  "activation_mode" "WorkStageActivationMode" NOT NULL DEFAULT 'ALWAYS',
  "activation_field_code" VARCHAR(80),
  "activation_expected_value" JSONB,
  "sla_minutes" INTEGER,
  "status" "WorkStageStatus" NOT NULL DEFAULT 'PENDING',
  "version" INTEGER NOT NULL DEFAULT 1,
  "blocked_from_status" "WorkStageStatus",
  "blocker_reason" VARCHAR(1000),
  "due_at" TIMESTAMPTZ(3),
  "ready_at" TIMESTAMPTZ(3),
  "started_at" TIMESTAMPTZ(3),
  "submitted_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "blocked_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "work_stages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_stages_sort_order_check" CHECK ("sort_order" >= 0),
  CONSTRAINT "work_stages_sla_positive_check" CHECK ("sla_minutes" IS NULL OR "sla_minutes" > 0),
  CONSTRAINT "work_stages_version_positive_check" CHECK ("version" > 0),
  CONSTRAINT "work_stages_code_format_check" CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  CONSTRAINT "work_stages_approval_check"
    CHECK (
      ("approval_mode" = 'SPECIFIC_LEADERSHIP' AND "approval_leadership_type" IS NOT NULL)
      OR
      ("approval_mode" <> 'SPECIFIC_LEADERSHIP' AND "approval_leadership_type" IS NULL)
    ),
  CONSTRAINT "work_stages_activation_check"
    CHECK (
      (
        "activation_mode" IN ('ALWAYS', 'MANUAL_WHEN_REQUIRED')
        AND "activation_field_code" IS NULL
        AND "activation_expected_value" IS NULL
      )
      OR
      (
        "activation_mode" = 'FIELD_TRUE'
        AND "activation_field_code" IS NOT NULL
        AND "activation_expected_value" IS NULL
      )
      OR
      (
        "activation_mode" = 'FIELD_EQUALS'
        AND "activation_field_code" IS NOT NULL
        AND "activation_expected_value" IS NOT NULL
      )
    ),
  CONSTRAINT "work_stages_blocker_state_check"
    CHECK (
      (
        "status" = 'BLOCKED'
        AND "blocked_from_status" IN ('READY', 'IN_PROGRESS')
        AND "blocker_reason" IS NOT NULL
        AND btrim("blocker_reason") <> ''
        AND "blocked_at" IS NOT NULL
      )
      OR
      (
        "status" <> 'BLOCKED'
        AND "blocked_from_status" IS NULL
        AND "blocker_reason" IS NULL
        AND "blocked_at" IS NULL
      )
    )
);

CREATE UNIQUE INDEX "work_stages_item_definition_key"
ON "work_stages"("work_item_id", "stage_definition_id");

CREATE INDEX "work_stages_item_status_idx"
ON "work_stages"("work_item_id", "status");

CREATE INDEX "work_stages_responsible_unit_status_idx"
ON "work_stages"("responsible_org_unit_id", "status");

CREATE INDEX "work_stages_status_due_idx"
ON "work_stages"("status", "due_at");

CREATE INDEX "work_stages_definition_idx"
ON "work_stages"("stage_definition_id");

ALTER TABLE "work_stages"
  ADD CONSTRAINT "work_stages_work_item_id_fkey"
  FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_stages_stage_definition_id_fkey"
  FOREIGN KEY ("stage_definition_id") REFERENCES "work_stage_definitions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_stages_responsible_org_unit_id_fkey"
  FOREIGN KEY ("responsible_org_unit_id") REFERENCES "org_units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_stage_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_stage_id" UUID NOT NULL,
  "target_type" "WorkStageAssignmentTargetType" NOT NULL,
  "target_org_unit_id" UUID,
  "target_account_id" UUID,
  "assignment_role" "WorkStageAssignmentRole" NOT NULL DEFAULT 'PRIMARY',
  "assigned_by_account_id" UUID,
  "ended_by_account_id" UUID,
  "assignment_reason" VARCHAR(500),
  "end_reason" VARCHAR(500),
  "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ends_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "work_stage_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_stage_assignments_target_shape_check"
    CHECK (
      (
        "target_type" IN ('ORG_UNIT_QUEUE', 'TEAM')
        AND "target_org_unit_id" IS NOT NULL
        AND "target_account_id" IS NULL
      )
      OR
      (
        "target_type" = 'ACCOUNT'
        AND "target_org_unit_id" IS NULL
        AND "target_account_id" IS NOT NULL
      )
    ),
  CONSTRAINT "work_stage_assignments_effective_range_check"
    CHECK ("ends_at" IS NULL OR "ends_at" >= "starts_at"),
  CONSTRAINT "work_stage_assignments_end_reason_check"
    CHECK (
      ("ends_at" IS NULL AND "ended_by_account_id" IS NULL AND "end_reason" IS NULL)
      OR
      ("ends_at" IS NOT NULL AND "end_reason" IS NOT NULL AND btrim("end_reason") <> '')
    )
);

CREATE UNIQUE INDEX "work_stage_assignments_one_active_primary_key"
ON "work_stage_assignments"("work_stage_id")
WHERE "assignment_role" = 'PRIMARY' AND "ends_at" IS NULL;

CREATE UNIQUE INDEX "work_stage_assignments_active_org_target_key"
ON "work_stage_assignments"("work_stage_id", "target_type", "target_org_unit_id")
WHERE "target_org_unit_id" IS NOT NULL AND "ends_at" IS NULL;

CREATE UNIQUE INDEX "work_stage_assignments_active_account_target_key"
ON "work_stage_assignments"("work_stage_id", "target_account_id")
WHERE "target_account_id" IS NOT NULL AND "ends_at" IS NULL;

CREATE INDEX "work_stage_assignments_stage_active_role_idx"
ON "work_stage_assignments"("work_stage_id", "ends_at", "assignment_role");

CREATE INDEX "work_stage_assignments_target_unit_active_idx"
ON "work_stage_assignments"("target_org_unit_id", "ends_at");

CREATE INDEX "work_stage_assignments_target_account_active_idx"
ON "work_stage_assignments"("target_account_id", "ends_at");

CREATE INDEX "work_stage_assignments_assigned_by_created_idx"
ON "work_stage_assignments"("assigned_by_account_id", "created_at");

CREATE INDEX "work_stage_assignments_ended_by_ended_idx"
ON "work_stage_assignments"("ended_by_account_id", "ends_at");

ALTER TABLE "work_stage_assignments"
  ADD CONSTRAINT "work_stage_assignments_work_stage_id_fkey"
  FOREIGN KEY ("work_stage_id") REFERENCES "work_stages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_stage_assignments_target_org_unit_id_fkey"
  FOREIGN KEY ("target_org_unit_id") REFERENCES "org_units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_stage_assignments_target_account_id_fkey"
  FOREIGN KEY ("target_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_stage_assignments_assigned_by_account_id_fkey"
  FOREIGN KEY ("assigned_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_stage_assignments_ended_by_account_id_fkey"
  FOREIGN KEY ("ended_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_stage_submissions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_stage_id" UUID NOT NULL,
  "submitted_by_account_id" UUID NOT NULL,
  "submission_number" INTEGER NOT NULL,
  "stage_version" INTEGER NOT NULL,
  "values_snapshot" JSONB NOT NULL,
  "note" VARCHAR(2000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "work_stage_submissions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_stage_submissions_number_positive_check" CHECK ("submission_number" > 0),
  CONSTRAINT "work_stage_submissions_version_positive_check" CHECK ("stage_version" > 0)
);

CREATE UNIQUE INDEX "work_stage_submissions_stage_number_key"
ON "work_stage_submissions"("work_stage_id", "submission_number");

CREATE INDEX "work_stage_submissions_submitter_created_idx"
ON "work_stage_submissions"("submitted_by_account_id", "created_at");

CREATE INDEX "work_stage_submissions_stage_created_idx"
ON "work_stage_submissions"("work_stage_id", "created_at");

ALTER TABLE "work_stage_submissions"
  ADD CONSTRAINT "work_stage_submissions_work_stage_id_fkey"
  FOREIGN KEY ("work_stage_id") REFERENCES "work_stages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_stage_submissions_submitted_by_account_id_fkey"
  FOREIGN KEY ("submitted_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_stage_approvals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_stage_id" UUID NOT NULL,
  "submission_id" UUID NOT NULL,
  "decided_by_account_id" UUID NOT NULL,
  "decision" "WorkStageApprovalDecision" NOT NULL,
  "reason" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "work_stage_approvals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_stage_approvals_return_reason_check"
    CHECK (
      "decision" <> 'RETURNED'
      OR ("reason" IS NOT NULL AND btrim("reason") <> '')
    )
);

CREATE UNIQUE INDEX "work_stage_approvals_submission_key"
ON "work_stage_approvals"("submission_id");

CREATE INDEX "work_stage_approvals_stage_created_idx"
ON "work_stage_approvals"("work_stage_id", "created_at");

CREATE INDEX "work_stage_approvals_decider_created_idx"
ON "work_stage_approvals"("decided_by_account_id", "created_at");

ALTER TABLE "work_stage_approvals"
  ADD CONSTRAINT "work_stage_approvals_work_stage_id_fkey"
  FOREIGN KEY ("work_stage_id") REFERENCES "work_stages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_stage_approvals_submission_id_fkey"
  FOREIGN KEY ("submission_id") REFERENCES "work_stage_submissions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_stage_approvals_decided_by_account_id_fkey"
  FOREIGN KEY ("decided_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_field_values" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_item_id" UUID NOT NULL,
  "field_definition_id" UUID NOT NULL,
  "work_stage_id" UUID,
  "value" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_by_account_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "work_field_values_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_field_values_version_positive_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "work_field_values_item_definition_key"
ON "work_field_values"("work_item_id", "field_definition_id");

CREATE INDEX "work_field_values_stage_idx"
ON "work_field_values"("work_stage_id");

CREATE INDEX "work_field_values_definition_idx"
ON "work_field_values"("field_definition_id");

CREATE INDEX "work_field_values_updated_by_at_idx"
ON "work_field_values"("updated_by_account_id", "updated_at");

ALTER TABLE "work_field_values"
  ADD CONSTRAINT "work_field_values_work_item_id_fkey"
  FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_field_values_field_definition_id_fkey"
  FOREIGN KEY ("field_definition_id") REFERENCES "work_field_definitions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_field_values_work_stage_id_fkey"
  FOREIGN KEY ("work_stage_id") REFERENCES "work_stages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_field_values_updated_by_account_id_fkey"
  FOREIGN KEY ("updated_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_references" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_item_id" UUID NOT NULL,
  "reference_type" VARCHAR(80) NOT NULL,
  "value" VARCHAR(255) NOT NULL,
  "normalized_value" VARCHAR(255) NOT NULL,
  "source_field_definition_id" UUID,
  "created_by_account_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "work_references_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_references_type_nonempty_check" CHECK (btrim("reference_type") <> ''),
  CONSTRAINT "work_references_value_nonempty_check" CHECK (btrim("value") <> ''),
  CONSTRAINT "work_references_normalized_nonempty_check" CHECK (btrim("normalized_value") <> '')
);

CREATE UNIQUE INDEX "work_references_item_type_normalized_key"
ON "work_references"("work_item_id", "reference_type", "normalized_value");

CREATE INDEX "work_references_type_normalized_idx"
ON "work_references"("reference_type", "normalized_value");

CREATE INDEX "work_references_item_type_idx"
ON "work_references"("work_item_id", "reference_type");

CREATE INDEX "work_references_source_field_idx"
ON "work_references"("source_field_definition_id");

CREATE INDEX "work_references_created_by_created_idx"
ON "work_references"("created_by_account_id", "created_at");

ALTER TABLE "work_references"
  ADD CONSTRAINT "work_references_work_item_id_fkey"
  FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_references_source_field_definition_id_fkey"
  FOREIGN KEY ("source_field_definition_id") REFERENCES "work_field_definitions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_references_created_by_account_id_fkey"
  FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_ownership_transfers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_item_id" UUID NOT NULL,
  "from_org_unit_id" UUID NOT NULL,
  "to_org_unit_id" UUID NOT NULL,
  "requested_by_account_id" UUID NOT NULL,
  "approved_by_account_id" UUID NOT NULL,
  "reason" VARCHAR(1000) NOT NULL,
  "effective_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "work_ownership_transfers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_ownership_transfers_distinct_units_check" CHECK ("from_org_unit_id" <> "to_org_unit_id"),
  CONSTRAINT "work_ownership_transfers_reason_nonempty_check" CHECK (btrim("reason") <> '')
);

CREATE INDEX "work_ownership_transfers_item_effective_idx"
ON "work_ownership_transfers"("work_item_id", "effective_at");

CREATE INDEX "work_ownership_transfers_from_unit_idx"
ON "work_ownership_transfers"("from_org_unit_id", "effective_at");

CREATE INDEX "work_ownership_transfers_to_unit_idx"
ON "work_ownership_transfers"("to_org_unit_id", "effective_at");

ALTER TABLE "work_ownership_transfers"
  ADD CONSTRAINT "work_ownership_transfers_work_item_id_fkey"
  FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_ownership_transfers_from_org_unit_id_fkey"
  FOREIGN KEY ("from_org_unit_id") REFERENCES "org_units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_ownership_transfers_to_org_unit_id_fkey"
  FOREIGN KEY ("to_org_unit_id") REFERENCES "org_units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_ownership_transfers_requested_by_account_id_fkey"
  FOREIGN KEY ("requested_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_ownership_transfers_approved_by_account_id_fkey"
  FOREIGN KEY ("approved_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_item_id" UUID NOT NULL,
  "work_stage_id" UUID,
  "actor_account_id" UUID,
  "event_type" "WorkEventType" NOT NULL,
  "from_work_status" "WorkRuntimeStatus",
  "to_work_status" "WorkRuntimeStatus",
  "from_stage_status" "WorkStageStatus",
  "to_stage_status" "WorkStageStatus",
  "details" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "work_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "work_events_item_created_idx"
ON "work_events"("work_item_id", "created_at");

CREATE INDEX "work_events_stage_created_idx"
ON "work_events"("work_stage_id", "created_at");

CREATE INDEX "work_events_actor_created_idx"
ON "work_events"("actor_account_id", "created_at");

CREATE INDEX "work_events_type_created_idx"
ON "work_events"("event_type", "created_at");

ALTER TABLE "work_events"
  ADD CONSTRAINT "work_events_work_item_id_fkey"
  FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_events_work_stage_id_fkey"
  FOREIGN KEY ("work_stage_id") REFERENCES "work_stages"("id")
  ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "work_events_actor_account_id_fkey"
  FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Work-level V3 Office/version/owner coherence. Existing legacy rows with a
-- completely NULL V3 context bypass this guard until controlled backfill.
CREATE OR REPLACE FUNCTION "enforce_work_item_v3_context_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  version_office_id UUID;
  owner_office_id UUID;
BEGIN
  IF NEW."office_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT definition."office_id"
    INTO version_office_id
  FROM "work_type_versions" version_record
  JOIN "work_type_definitions" definition
    ON definition."id" = version_record."work_type_definition_id"
  WHERE version_record."id" = NEW."work_type_version_id";

  IF FOUND AND version_office_id <> NEW."office_id" THEN
    RAISE EXCEPTION
      'Work Type Version must belong to the same Office as the Work.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_items_work_type_version_same_office_check';
  END IF;

  SELECT unit."office_id"
    INTO owner_office_id
  FROM "org_units" unit
  WHERE unit."id" = NEW."primary_owner_org_unit_id";

  IF FOUND AND owner_office_id <> NEW."office_id" THEN
    RAISE EXCEPTION
      'Primary Owner OrgUnit must belong to the same Office as the Work.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_items_primary_owner_same_office_check';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."office_id" IS NOT NULL
     AND NEW."office_id" IS DISTINCT FROM OLD."office_id" THEN
    RAISE EXCEPTION
      'A V3 Work cannot move to another Office.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_items_office_immutable_check';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."work_type_version_id" IS NOT NULL
     AND NEW."work_type_version_id" IS DISTINCT FROM OLD."work_type_version_id" THEN
    RAISE EXCEPTION
      'A V3 Work cannot change its immutable Work Type Version.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_items_work_type_version_immutable_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "work_items_v3_context_integrity_trigger"
BEFORE INSERT OR UPDATE OF "office_id", "work_type_version_id", "primary_owner_org_unit_id"
ON "work_items"
FOR EACH ROW
EXECUTE FUNCTION "enforce_work_item_v3_context_integrity"();

CREATE OR REPLACE FUNCTION "enforce_work_participant_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  work_office_id UUID;
  owner_org_unit_id UUID;
  participant_office_id UUID;
BEGIN
  SELECT work_item."office_id", work_item."primary_owner_org_unit_id"
    INTO work_office_id, owner_org_unit_id
  FROM "work_items" work_item
  WHERE work_item."id" = NEW."work_item_id";

  IF work_office_id IS NULL THEN
    RAISE EXCEPTION
      'Work participants require a V3 Work context.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_participants_v3_work_required_check';
  END IF;

  SELECT unit."office_id"
    INTO participant_office_id
  FROM "org_units" unit
  WHERE unit."id" = NEW."org_unit_id";

  IF FOUND AND participant_office_id <> work_office_id THEN
    RAISE EXCEPTION
      'Work participant OrgUnit must belong to the Work Office.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_participants_same_office_check';
  END IF;

  IF NEW."role" = 'PRIMARY_OWNER' AND NEW."org_unit_id" <> owner_org_unit_id THEN
    RAISE EXCEPTION
      'PRIMARY_OWNER participant must match Work.primaryOwnerOrgUnitId.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_participants_primary_owner_match_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "work_participants_integrity_trigger"
BEFORE INSERT OR UPDATE OF "work_item_id", "org_unit_id", "role"
ON "work_org_unit_participants"
FOR EACH ROW
EXECUTE FUNCTION "enforce_work_participant_integrity"();

CREATE OR REPLACE FUNCTION "enforce_work_stage_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  work_office_id UUID;
  work_version_id UUID;
  definition_version_id UUID;
  responsible_office_id UUID;
BEGIN
  SELECT work_item."office_id", work_item."work_type_version_id"
    INTO work_office_id, work_version_id
  FROM "work_items" work_item
  WHERE work_item."id" = NEW."work_item_id";

  IF work_office_id IS NULL OR work_version_id IS NULL THEN
    RAISE EXCEPTION
      'Runtime stages require a V3 Work context.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_stages_v3_work_required_check';
  END IF;

  SELECT definition."work_type_version_id"
    INTO definition_version_id
  FROM "work_stage_definitions" definition
  WHERE definition."id" = NEW."stage_definition_id";

  IF FOUND AND definition_version_id <> work_version_id THEN
    RAISE EXCEPTION
      'Runtime stage definition must belong to the Work Type Version used by the Work.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_stages_definition_version_check';
  END IF;

  SELECT unit."office_id"
    INTO responsible_office_id
  FROM "org_units" unit
  WHERE unit."id" = NEW."responsible_org_unit_id";

  IF FOUND AND responsible_office_id <> work_office_id THEN
    RAISE EXCEPTION
      'Runtime stage responsible OrgUnit must belong to the Work Office.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_stages_responsible_same_office_check';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "work_org_unit_participants" participant
    WHERE participant."work_item_id" = NEW."work_item_id"
      AND participant."org_unit_id" = NEW."responsible_org_unit_id"
      AND participant."ended_at" IS NULL
      AND participant."role" <> 'OBSERVER'
  ) THEN
    RAISE EXCEPTION
      'Runtime stage responsible OrgUnit must be an active operational participant in the Work.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_stages_responsible_participant_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "work_stages_integrity_trigger"
BEFORE INSERT OR UPDATE OF "work_item_id", "stage_definition_id", "responsible_org_unit_id"
ON "work_stages"
FOR EACH ROW
EXECUTE FUNCTION "enforce_work_stage_integrity"();

CREATE OR REPLACE FUNCTION "enforce_work_stage_assignment_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  work_office_id UUID;
  responsible_org_unit_id UUID;
  assignment_mode "WorkStageAssignmentMode";
  target_office_id UUID;
  target_is_team BOOLEAN;
  target_employee_id UUID;
BEGIN
  SELECT work_item."office_id", stage."responsible_org_unit_id", stage."assignment_mode"
    INTO work_office_id, responsible_org_unit_id, assignment_mode
  FROM "work_stages" stage
  JOIN "work_items" work_item ON work_item."id" = stage."work_item_id"
  WHERE stage."id" = NEW."work_stage_id";

  IF assignment_mode = 'ORG_UNIT_QUEUE' AND NEW."target_type" <> 'ORG_UNIT_QUEUE' THEN
    RAISE EXCEPTION
      'ORG_UNIT_QUEUE stage must use an OrgUnit queue assignment target.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_mode_target_check';
  ELSIF assignment_mode = 'TEAM' AND NEW."target_type" <> 'TEAM' THEN
    RAISE EXCEPTION
      'TEAM stage must use a Team assignment target.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_mode_target_check';
  ELSIF assignment_mode = 'INDIVIDUAL' AND NEW."target_type" <> 'ACCOUNT' THEN
    RAISE EXCEPTION
      'INDIVIDUAL stage must use an account assignment target.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_mode_target_check';
  ELSIF assignment_mode = 'ORG_UNIT_OR_TEAM'
        AND NEW."target_type" NOT IN ('ORG_UNIT_QUEUE', 'TEAM') THEN
    RAISE EXCEPTION
      'ORG_UNIT_OR_TEAM stage must use an OrgUnit queue or Team assignment target.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_mode_target_check';
  ELSIF assignment_mode = 'ORG_UNIT_OR_USER'
        AND NEW."target_type" NOT IN ('ORG_UNIT_QUEUE', 'ACCOUNT') THEN
    RAISE EXCEPTION
      'ORG_UNIT_OR_USER stage must use an OrgUnit queue or account assignment target.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_mode_target_check';
  ELSIF assignment_mode = 'RESPONSIBLE_ORG_UNIT_HEAD' AND NEW."target_type" <> 'ACCOUNT' THEN
    RAISE EXCEPTION
      'RESPONSIBLE_ORG_UNIT_HEAD stage must resolve to an account assignment target.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_mode_target_check';
  END IF;

  IF NEW."target_org_unit_id" IS NOT NULL THEN
    SELECT unit."office_id", unit_type."is_team"
      INTO target_office_id, target_is_team
    FROM "org_units" unit
    JOIN "org_unit_types" unit_type ON unit_type."id" = unit."org_unit_type_id"
    WHERE unit."id" = NEW."target_org_unit_id";

    IF FOUND AND target_office_id <> work_office_id THEN
      RAISE EXCEPTION
        'Stage assignment OrgUnit must belong to the Work Office.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_target_unit_same_office_check';
    END IF;

    IF NEW."target_type" = 'ORG_UNIT_QUEUE'
       AND NEW."target_org_unit_id" <> responsible_org_unit_id THEN
      RAISE EXCEPTION
        'OrgUnit queue assignment must target the responsible OrgUnit.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_queue_responsible_unit_check';
    END IF;

    IF NEW."target_type" = 'TEAM' AND FOUND AND NOT target_is_team THEN
      RAISE EXCEPTION
        'TEAM stage assignment must target a Team OrgUnit.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_team_target_check';
    END IF;

    IF NEW."target_type" = 'TEAM' AND NOT EXISTS (
      SELECT 1
      FROM "org_unit_closure" closure
      WHERE closure."ancestor_org_unit_id" = responsible_org_unit_id
        AND closure."descendant_org_unit_id" = NEW."target_org_unit_id"
    ) THEN
      RAISE EXCEPTION
        'Team assignment must target a Team inside the responsible OrgUnit subtree.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_team_responsible_scope_check';
    END IF;
  END IF;

  IF NEW."target_account_id" IS NOT NULL THEN
    SELECT account."employee_id"
      INTO target_employee_id
    FROM "accounts" account
    WHERE account."id" = NEW."target_account_id";

    IF FOUND AND (
      target_employee_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM "org_memberships" membership
        JOIN "org_unit_closure" closure
          ON closure."descendant_org_unit_id" = membership."org_unit_id"
        WHERE membership."employee_id" = target_employee_id
          AND membership."office_id" = work_office_id
          AND closure."ancestor_org_unit_id" = responsible_org_unit_id
          AND membership."starts_at" <= NEW."starts_at"
          AND (membership."ends_at" IS NULL OR membership."ends_at" > NEW."starts_at")
      )
    ) THEN
      RAISE EXCEPTION
        'Stage assignment account must have an effective membership inside the responsible OrgUnit scope.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_stage_assignments_target_account_responsible_scope_check';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "work_stage_assignments_integrity_trigger"
BEFORE INSERT OR UPDATE OF "work_stage_id", "target_type", "target_org_unit_id", "target_account_id", "starts_at"
ON "work_stage_assignments"
FOR EACH ROW
EXECUTE FUNCTION "enforce_work_stage_assignment_integrity"();

CREATE OR REPLACE FUNCTION "enforce_work_field_value_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  work_version_id UUID;
  field_version_id UUID;
  field_stage_definition_id UUID;
  runtime_stage_work_id UUID;
  runtime_stage_definition_id UUID;
BEGIN
  SELECT work_item."work_type_version_id"
    INTO work_version_id
  FROM "work_items" work_item
  WHERE work_item."id" = NEW."work_item_id";

  IF work_version_id IS NULL THEN
    RAISE EXCEPTION
      'Runtime field values require a V3 Work context.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_field_values_v3_work_required_check';
  END IF;

  SELECT field_definition."work_type_version_id", field_definition."stage_definition_id"
    INTO field_version_id, field_stage_definition_id
  FROM "work_field_definitions" field_definition
  WHERE field_definition."id" = NEW."field_definition_id";

  IF FOUND AND field_version_id <> work_version_id THEN
    RAISE EXCEPTION
      'Runtime field definition must belong to the Work Type Version used by the Work.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_field_values_definition_version_check';
  END IF;

  IF field_stage_definition_id IS NULL AND NEW."work_stage_id" IS NOT NULL THEN
    RAISE EXCEPTION
      'Work-level field values cannot be attached to a runtime stage.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_field_values_work_level_stage_check';
  END IF;

  IF field_stage_definition_id IS NOT NULL THEN
    IF NEW."work_stage_id" IS NULL THEN
      RAISE EXCEPTION
        'Stage field values require the corresponding runtime stage.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_field_values_stage_required_check';
    END IF;

    SELECT stage."work_item_id", stage."stage_definition_id"
      INTO runtime_stage_work_id, runtime_stage_definition_id
    FROM "work_stages" stage
    WHERE stage."id" = NEW."work_stage_id";

    IF FOUND AND (
      runtime_stage_work_id <> NEW."work_item_id"
      OR runtime_stage_definition_id <> field_stage_definition_id
    ) THEN
      RAISE EXCEPTION
        'Stage field value must use the matching runtime stage for the Work.'
        USING ERRCODE = '23514', CONSTRAINT = 'work_field_values_stage_match_check';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "work_field_values_integrity_trigger"
BEFORE INSERT OR UPDATE OF "work_item_id", "field_definition_id", "work_stage_id"
ON "work_field_values"
FOR EACH ROW
EXECUTE FUNCTION "enforce_work_field_value_integrity"();

CREATE OR REPLACE FUNCTION "enforce_work_reference_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  work_version_id UUID;
  field_version_id UUID;
BEGIN
  IF NEW."source_field_definition_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT work_item."work_type_version_id"
    INTO work_version_id
  FROM "work_items" work_item
  WHERE work_item."id" = NEW."work_item_id";

  SELECT field_definition."work_type_version_id"
    INTO field_version_id
  FROM "work_field_definitions" field_definition
  WHERE field_definition."id" = NEW."source_field_definition_id";

  IF work_version_id IS NULL OR (FOUND AND field_version_id <> work_version_id) THEN
    RAISE EXCEPTION
      'Work reference source field must belong to the Work Type Version used by the Work.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_references_source_field_version_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "work_references_integrity_trigger"
BEFORE INSERT OR UPDATE OF "work_item_id", "source_field_definition_id"
ON "work_references"
FOR EACH ROW
EXECUTE FUNCTION "enforce_work_reference_integrity"();

CREATE OR REPLACE FUNCTION "enforce_work_stage_approval_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  submission_stage_id UUID;
BEGIN
  SELECT submission."work_stage_id"
    INTO submission_stage_id
  FROM "work_stage_submissions" submission
  WHERE submission."id" = NEW."submission_id";

  IF FOUND AND submission_stage_id <> NEW."work_stage_id" THEN
    RAISE EXCEPTION
      'Stage approval must reference a submission from the same runtime stage.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_stage_approvals_submission_stage_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "work_stage_approvals_integrity_trigger"
BEFORE INSERT OR UPDATE OF "work_stage_id", "submission_id"
ON "work_stage_approvals"
FOR EACH ROW
EXECUTE FUNCTION "enforce_work_stage_approval_integrity"();

CREATE OR REPLACE FUNCTION "enforce_work_event_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  stage_work_item_id UUID;
BEGIN
  IF NEW."work_stage_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT stage."work_item_id"
    INTO stage_work_item_id
  FROM "work_stages" stage
  WHERE stage."id" = NEW."work_stage_id";

  IF FOUND AND stage_work_item_id <> NEW."work_item_id" THEN
    RAISE EXCEPTION
      'Work event stage must belong to the same Work.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_events_stage_work_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "work_events_integrity_trigger"
BEFORE INSERT OR UPDATE OF "work_item_id", "work_stage_id"
ON "work_events"
FOR EACH ROW
EXECUTE FUNCTION "enforce_work_event_integrity"();

CREATE OR REPLACE FUNCTION "enforce_work_ownership_transfer_integrity"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  work_office_id UUID;
  from_office_id UUID;
  to_office_id UUID;
BEGIN
  SELECT work_item."office_id"
    INTO work_office_id
  FROM "work_items" work_item
  WHERE work_item."id" = NEW."work_item_id";

  IF work_office_id IS NULL THEN
    RAISE EXCEPTION
      'Ownership transfers require a V3 Work context.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_ownership_transfers_v3_work_required_check';
  END IF;

  SELECT unit."office_id" INTO from_office_id
  FROM "org_units" unit
  WHERE unit."id" = NEW."from_org_unit_id";

  SELECT unit."office_id" INTO to_office_id
  FROM "org_units" unit
  WHERE unit."id" = NEW."to_org_unit_id";

  IF (from_office_id IS NOT NULL AND from_office_id <> work_office_id)
     OR (to_office_id IS NOT NULL AND to_office_id <> work_office_id) THEN
    RAISE EXCEPTION
      'Ownership transfer OrgUnits must belong to the Work Office.'
      USING ERRCODE = '23514', CONSTRAINT = 'work_ownership_transfers_same_office_check';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "work_ownership_transfers_integrity_trigger"
BEFORE INSERT OR UPDATE OF "work_item_id", "from_org_unit_id", "to_org_unit_id"
ON "work_ownership_transfers"
FOR EACH ROW
EXECUTE FUNCTION "enforce_work_ownership_transfer_integrity"();
