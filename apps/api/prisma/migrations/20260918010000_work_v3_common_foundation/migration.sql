-- Part 1: make common Work behavior platform-owned without rewriting any
-- historical published Work Type version or Work history.

ALTER TYPE "WorkEventType" ADD VALUE IF NOT EXISTS 'NOTE_ADDED';
ALTER TYPE "WorkEventType" ADD VALUE IF NOT EXISTS 'EVIDENCE_ADDED';
ALTER TYPE "WorkEventType" ADD VALUE IF NOT EXISTS 'HELP_REQUESTED';
ALTER TYPE "WorkEventType" ADD VALUE IF NOT EXISTS 'HELP_ACCEPTED';
ALTER TYPE "WorkEventType" ADD VALUE IF NOT EXISTS 'HELP_DECLINED';
ALTER TYPE "WorkEventType" ADD VALUE IF NOT EXISTS 'HELP_CANCELLED';

ALTER TABLE "work_help_requests"
  ADD COLUMN IF NOT EXISTS "work_stage_id" UUID,
  ADD COLUMN IF NOT EXISTS "previous_runtime_status" "WorkRuntimeStatus";

ALTER TABLE "work_help_requests"
  ADD CONSTRAINT "work_help_requests_work_stage_id_fkey"
  FOREIGN KEY ("work_stage_id") REFERENCES "work_stages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "work_help_requests_stage_status_created_idx"
  ON "work_help_requests"("work_stage_id", "status", "created_at");

CREATE TABLE "work_evidence" (
  "id" UUID NOT NULL,
  "work_item_id" UUID NOT NULL,
  "work_stage_id" UUID,
  "field_definition_id" UUID,
  "uploaded_by_account_id" UUID NOT NULL,
  "storage_key" VARCHAR(500) NOT NULL,
  "original_file_name" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "file_size_bytes" INTEGER NOT NULL,
  "scan_status" VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  "note" VARCHAR(1000),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_evidence_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "work_evidence"
  ADD CONSTRAINT "work_evidence_work_item_id_fkey"
  FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_evidence"
  ADD CONSTRAINT "work_evidence_work_stage_id_fkey"
  FOREIGN KEY ("work_stage_id") REFERENCES "work_stages"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_evidence"
  ADD CONSTRAINT "work_evidence_field_definition_id_fkey"
  FOREIGN KEY ("field_definition_id") REFERENCES "work_field_definitions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "work_evidence"
  ADD CONSTRAINT "work_evidence_uploaded_by_account_id_fkey"
  FOREIGN KEY ("uploaded_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "work_evidence_item_created_idx"
  ON "work_evidence"("work_item_id", "created_at");
CREATE INDEX "work_evidence_stage_created_idx"
  ON "work_evidence"("work_stage_id", "created_at");
CREATE INDEX "work_evidence_field_created_idx"
  ON "work_evidence"("field_definition_id", "created_at");
CREATE INDEX "work_evidence_uploader_created_idx"
  ON "work_evidence"("uploaded_by_account_id", "created_at");
CREATE INDEX "work_evidence_storage_key_idx"
  ON "work_evidence"("storage_key");

-- Common completion controls are no longer configurable Work Type fields.
-- Published versions are intentionally untouched. Only editable drafts are
-- normalized so future publication cannot duplicate platform controls.
UPDATE "work_stage_definitions" AS stage
SET "activation_field_definition_id" = NULL,
    "activation_mode" = 'ALWAYS',
    "activation_expected_value" = NULL
FROM "work_field_definitions" AS field,
     "work_type_versions" AS version
WHERE stage."activation_field_definition_id" = field."id"
  AND field."work_type_version_id" = version."id"
  AND version."status" = 'DRAFT'
  AND field."code" IN ('COMPLETION_RESULT', 'COMPLETION_SUMMARY', 'MORE_WORK_REQUIRED');

DELETE FROM "work_field_definitions" AS field
USING "work_type_versions" AS version
WHERE field."work_type_version_id" = version."id"
  AND version."status" = 'DRAFT'
  AND field."code" IN ('COMPLETION_RESULT', 'COMPLETION_SUMMARY', 'MORE_WORK_REQUIRED');
