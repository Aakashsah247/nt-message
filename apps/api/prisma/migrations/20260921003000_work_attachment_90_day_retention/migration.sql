-- Work attachments are operational transfer/evidence files, not the authoritative
-- customer record. Keep lightweight metadata with Work history, but purge physical
-- Sales and completion files 90 days after their business process becomes terminal.
-- IF NOT EXISTS keeps this retry-safe if PostgreSQL preserved any DDL before a failed
-- Prisma migration was marked rolled back and re-applied.

ALTER TABLE "work_sales_attachments"
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "expired_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "purged_at" TIMESTAMPTZ(3);

ALTER TABLE "work_evidence"
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "expired_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "purged_at" TIMESTAMPTZ(3);

CREATE INDEX IF NOT EXISTS "work_sales_attachments_expires_purged_idx"
  ON "work_sales_attachments"("expires_at", "purged_at");
CREATE INDEX IF NOT EXISTS "work_evidence_expires_purged_idx"
  ON "work_evidence"("expires_at", "purged_at");

-- Existing Sales files start their 90-day clock from the recorded Sales completion.
UPDATE "work_sales_attachments" AS attachment
SET "expires_at" = work_item."sales_completed_at" + INTERVAL '90 days'
FROM "work_sales_messages" AS message
JOIN "work_items" AS work_item ON work_item."id" = message."work_item_id"
WHERE attachment."message_id" = message."id"
  AND work_item."sales_completed_at" IS NOT NULL;

-- Existing completion-report evidence starts its clock from terminal Work time.
-- General stage/field evidence is intentionally not included in this policy.
UPDATE "work_evidence" AS evidence
SET "expires_at" = COALESCE(work_item."closed_at", work_item."cancelled_at") + INTERVAL '90 days'
FROM "work_items" AS work_item
WHERE evidence."work_item_id" = work_item."id"
  AND evidence."completion_report_id" IS NOT NULL
  AND COALESCE(work_item."closed_at", work_item."cancelled_at") IS NOT NULL;
