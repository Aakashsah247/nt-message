-- Preserve the shift label and time on duty history before allowing an unused future shift to be deleted.
BEGIN;

ALTER TABLE "duty_schedule_series"
  ADD COLUMN IF NOT EXISTS "shift_name" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "shift_start_minute" INTEGER,
  ADD COLUMN IF NOT EXISTS "shift_end_minute" INTEGER,
  ADD COLUMN IF NOT EXISTS "shift_spans_next_day" BOOLEAN;

ALTER TABLE "duty_assignments"
  ADD COLUMN IF NOT EXISTS "shift_name" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "shift_start_minute" INTEGER,
  ADD COLUMN IF NOT EXISTS "shift_end_minute" INTEGER,
  ADD COLUMN IF NOT EXISTS "shift_spans_next_day" BOOLEAN;

UPDATE "duty_schedule_series" AS series
SET
  "shift_name" = template."name",
  "shift_start_minute" = template."start_minute",
  "shift_end_minute" = template."end_minute",
  "shift_spans_next_day" = template."spans_next_day"
FROM "duty_shift_templates" AS template
WHERE series."shift_template_id" = template."id"
  AND (
    series."shift_name" IS NULL
    OR series."shift_start_minute" IS NULL
    OR series."shift_end_minute" IS NULL
    OR series."shift_spans_next_day" IS NULL
  );

UPDATE "duty_assignments" AS assignment
SET
  "shift_name" = template."name",
  "shift_start_minute" = template."start_minute",
  "shift_end_minute" = template."end_minute",
  "shift_spans_next_day" = template."spans_next_day"
FROM "duty_shift_templates" AS template
WHERE assignment."shift_template_id" = template."id"
  AND (
    assignment."shift_name" IS NULL
    OR assignment."shift_start_minute" IS NULL
    OR assignment."shift_end_minute" IS NULL
    OR assignment."shift_spans_next_day" IS NULL
  );

-- Stop safely if any existing duty assignment could not copy its shift details.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "duty_assignments"
    WHERE "shift_name" IS NULL
       OR "shift_start_minute" IS NULL
       OR "shift_end_minute" IS NULL
       OR "shift_spans_next_day" IS NULL
  ) THEN
    RAISE EXCEPTION 'Duty shift details could not be copied for every existing assignment.';
  END IF;
END $$;

-- Every duty assignment keeps its own shift details after the shift is deleted.
ALTER TABLE "duty_assignments"
  ALTER COLUMN "shift_name" SET NOT NULL,
  ALTER COLUMN "shift_start_minute" SET NOT NULL,
  ALTER COLUMN "shift_end_minute" SET NOT NULL,
  ALTER COLUMN "shift_spans_next_day" SET NOT NULL;

-- Shift links may become empty after permanent deletion, while copied details remain available.
ALTER TABLE "duty_schedule_series"
  ALTER COLUMN "shift_template_id" DROP NOT NULL;

ALTER TABLE "duty_assignments"
  ALTER COLUMN "shift_template_id" DROP NOT NULL;

ALTER TABLE "duty_schedule_series"
  DROP CONSTRAINT IF EXISTS "duty_schedule_series_shift_template_id_fkey";
ALTER TABLE "duty_schedule_series"
  ADD CONSTRAINT "duty_schedule_series_shift_template_id_fkey"
  FOREIGN KEY ("shift_template_id") REFERENCES "duty_shift_templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "duty_assignments"
  DROP CONSTRAINT IF EXISTS "duty_assignments_shift_template_id_fkey";
ALTER TABLE "duty_assignments"
  ADD CONSTRAINT "duty_assignments_shift_template_id_fkey"
  FOREIGN KEY ("shift_template_id") REFERENCES "duty_shift_templates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
