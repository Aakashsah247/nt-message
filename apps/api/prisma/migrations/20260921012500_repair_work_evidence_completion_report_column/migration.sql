-- Repair schema drift observed after the completion-evidence and 90-day-retention
-- migrations were recorded as applied while work_evidence.completion_report_id was
-- still absent in the runtime database.
--
-- Keep this migration idempotent: it is safe for databases where some or all of
-- these columns/indexes already exist.

ALTER TABLE "work_evidence"
  ADD COLUMN IF NOT EXISTS "completion_report_id" UUID,
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "expired_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "purged_at" TIMESTAMPTZ(3);

ALTER TABLE "work_sales_attachments"
  ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "expired_at" TIMESTAMPTZ(3),
  ADD COLUMN IF NOT EXISTS "purged_at" TIMESTAMPTZ(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'work_evidence_completion_report_id_fkey'
  ) THEN
    ALTER TABLE "work_evidence"
      ADD CONSTRAINT "work_evidence_completion_report_id_fkey"
      FOREIGN KEY ("completion_report_id")
      REFERENCES "work_completion_reports"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "work_evidence_completion_report_created_idx"
  ON "work_evidence"("completion_report_id", "created_at");

CREATE INDEX IF NOT EXISTS "work_evidence_expires_purged_idx"
  ON "work_evidence"("expires_at", "purged_at");

CREATE INDEX IF NOT EXISTS "work_sales_attachments_expires_purged_idx"
  ON "work_sales_attachments"("expires_at", "purged_at");
