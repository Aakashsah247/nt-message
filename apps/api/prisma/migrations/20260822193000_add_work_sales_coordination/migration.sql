-- WM-V2-4A: track the small Sales coordination state on the existing work item.
-- The actual profile/billing operation stays in Nepal Telecom's existing systems.
CREATE TYPE "WorkSalesCoordinationStatus" AS ENUM (
  'WAITING_FOR_DOCUMENTS',
  'READY_FOR_SALES',
  'COMPLETED'
);

ALTER TABLE "work_items"
  ADD COLUMN "sales_coordination_status" "WorkSalesCoordinationStatus",
  ADD COLUMN "sales_documents_sent_at" TIMESTAMPTZ(3),
  ADD COLUMN "sales_completed_at" TIMESTAMPTZ(3),
  ADD COLUMN "sales_completion_note" VARCHAR(1500);

-- Grandfather existing work so this migration never blocks an in-flight or historical ticket.
-- Only work created after WM-V2-4A starts at WAITING_FOR_DOCUMENTS.
UPDATE "work_items"
SET "sales_coordination_status" = 'COMPLETED',
    "sales_completed_at" = COALESCE("closed_at", "completed_at", NOW()),
    "sales_completion_note" = 'Existing work preserved during WM-V2 Sales workflow rollout.'
WHERE "sales_member_account_id" IS NOT NULL
  AND "sales_coordination_status" IS NULL;

CREATE INDEX "work_items_sales_coordination_due_idx"
ON "work_items"("sales_member_account_id", "sales_coordination_status", "due_at");
