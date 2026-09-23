ALTER TABLE "work_items"
ADD COLUMN "responsible_reviewer_account_id" UUID;

ALTER TABLE "work_items"
ADD CONSTRAINT "work_items_responsible_reviewer_account_id_fkey"
FOREIGN KEY ("responsible_reviewer_account_id") REFERENCES "accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "work_items_responsible_reviewer_runtime_due_idx"
ON "work_items"("responsible_reviewer_account_id", "runtime_status", "due_at");

-- Restore the finalized manager-review flow for the eight default NT Work Types.
-- Stage execution submits directly; one selected Responsible Reviewer performs
-- the final Work review instead of adding a mandatory Team Lead stage approval.
UPDATE "work_stage_definitions" AS stage
SET
  "approval_mode" = 'NONE',
  "approval_leadership_type" = NULL
FROM "work_type_versions" AS version, "work_type_definitions" AS definition
WHERE stage."work_type_version_id" = version."id"
  AND version."work_type_definition_id" = definition."id"
  AND stage."code" = 'EXECUTION'
  AND definition."code" IN (
    'ROUTINE_WORK',
    'TROUBLE_TICKET',
    'NETWORK_MAINTENANCE',
    'NEW_INSTALLATION',
    'UPDATE_SERVICES',
    'INSPECTION',
    'EMERGENCY_WORK',
    'ADMINISTRATIVE_WORK'
  );

UPDATE "work_type_versions" AS version
SET
  "final_closure_mode" = 'PRIMARY_OWNER_HEAD',
  "final_closure_leadership_type" = NULL
FROM "work_type_definitions" AS definition
WHERE version."work_type_definition_id" = definition."id"
  AND definition."code" IN (
    'ROUTINE_WORK',
    'TROUBLE_TICKET',
    'NETWORK_MAINTENANCE',
    'NEW_INSTALLATION',
    'UPDATE_SERVICES',
    'INSPECTION',
    'EMERGENCY_WORK',
    'ADMINISTRATIVE_WORK'
  );
