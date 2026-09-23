-- Link platform-owned completion evidence to the completion report that owns it.
-- This migration was omitted from the original completion-evidence patch even though
-- the Prisma schema already declared the relation. Keep it idempotent so databases
-- recovering from the failed retention migration can apply it safely.

ALTER TABLE "work_evidence"
  ADD COLUMN IF NOT EXISTS "completion_report_id" UUID;

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
