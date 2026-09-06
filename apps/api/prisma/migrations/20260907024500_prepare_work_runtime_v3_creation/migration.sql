-- Phase 6 / P6-B Part 1: prepare WorkItem for native V3 creation.
--
-- P6-A intentionally left legacy WM-V2 columns mandatory because no V3 Work
-- was written yet. Native V3 Work must not fabricate Division/manager/type
-- values merely to satisfy the old schema, so this migration makes only the
-- legacy-only columns nullable while preserving a database check that legacy
-- rows still contain their historical required fields.
--
-- The V3 binding remains additive. No existing Work row is updated here.

ALTER TYPE "WorkItemStatus" ADD VALUE IF NOT EXISTS 'V3_RUNTIME';

ALTER TABLE "work_items"
  ALTER COLUMN "type" DROP NOT NULL,
  ALTER COLUMN "division_id" DROP NOT NULL,
  ALTER COLUMN "registered_at" DROP NOT NULL,
  ALTER COLUMN "responsible_manager_account_id" DROP NOT NULL,
  ADD COLUMN "creation_request_id" UUID,
  ADD COLUMN "creation_request_fingerprint" VARCHAR(64);

ALTER TABLE "work_items"
  ADD CONSTRAINT "work_items_legacy_required_fields_check"
  CHECK (
    "office_id" IS NOT NULL
    OR (
      "type" IS NOT NULL
      AND "division_id" IS NOT NULL
      AND "registered_at" IS NOT NULL
      AND "responsible_manager_account_id" IS NOT NULL
    )
  ),
  ADD CONSTRAINT "work_items_v3_legacy_fields_clear_check"
  CHECK (
    "office_id" IS NULL
    OR (
      "type" IS NULL
      AND "division_id" IS NULL
      AND "department_id" IS NULL
      AND "assigned_team_id" IS NULL
      AND "sales_member_account_id" IS NULL
      AND "sales_coordination_status" IS NULL
      AND "sales_documents_sent_at" IS NULL
      AND "sales_completed_at" IS NULL
      AND "sales_completion_note" IS NULL
      AND "registered_at" IS NULL
      AND "responsible_manager_account_id" IS NULL
      AND "parent_work_item_id" IS NULL
    )
  ),
  ADD CONSTRAINT "work_items_runtime_marker_check"
  CHECK (
    ("office_id" IS NULL AND "status" <> 'V3_RUNTIME')
    OR
    ("office_id" IS NOT NULL AND "status" = 'V3_RUNTIME')
  ),
  ADD CONSTRAINT "work_items_creation_request_pair_check"
  CHECK (
    ("creation_request_id" IS NULL AND "creation_request_fingerprint" IS NULL)
    OR
    ("creation_request_id" IS NOT NULL AND "creation_request_fingerprint" IS NOT NULL)
  ),
  ADD CONSTRAINT "work_items_creation_request_fingerprint_check"
  CHECK (
    "creation_request_fingerprint" IS NULL
    OR "creation_request_fingerprint" ~ '^[0-9a-f]{64}$'
  );

CREATE UNIQUE INDEX "work_items_creator_creation_request_key"
ON "work_items"("created_by_account_id", "creation_request_id")
WHERE "creation_request_id" IS NOT NULL;

CREATE INDEX "work_items_creator_creation_request_idx"
ON "work_items"("created_by_account_id", "creation_request_id");
