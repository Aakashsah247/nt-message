-- Phase B foundation: freeze the version-bound Information field values that
-- were submitted with each completion report. The legacy dedicated columns
-- remain for compatibility while runtime consumers cut over to this snapshot.
ALTER TABLE "work_completion_reports"
ADD COLUMN "field_values_snapshot" JSONB;
