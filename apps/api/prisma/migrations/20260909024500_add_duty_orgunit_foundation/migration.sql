-- Phase 11 additive Duty OrgUnit foundation.
-- Legacy Division/Department columns remain for compatibility until the Duty cutover is fully validated.

ALTER TABLE "duty_shift_templates"
  ADD COLUMN "office_id" UUID,
  ADD COLUMN "org_unit_id" UUID;

ALTER TABLE "duty_schedule_series"
  ADD COLUMN "office_id" UUID,
  ADD COLUMN "org_unit_id" UUID;

ALTER TABLE "duty_assignments"
  ADD COLUMN "office_id" UUID,
  ADD COLUMN "org_unit_id" UUID;

ALTER TABLE "duty_coverage_requirements"
  ADD COLUMN "office_id" UUID,
  ADD COLUMN "org_unit_id" UUID;

ALTER TABLE "duty_exceptions"
  ADD COLUMN "office_id" UUID,
  ADD COLUMN "org_unit_id" UUID;

ALTER TABLE "duty_holidays"
  ADD COLUMN "office_id" UUID,
  ADD COLUMN "org_unit_id" UUID;

-- Backfill the most-specific formal OrgUnit from the audited legacy mappings.
UPDATE "duty_shift_templates" AS dst
SET
  "office_id" = mapping."office_id",
  "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" AS mapping
WHERE (
    (dst."department_id" IS NOT NULL
      AND mapping."legacy_entity_type" = 'DEPARTMENT'
      AND mapping."legacy_entity_id" = dst."department_id")
    OR
    (dst."department_id" IS NULL
      AND dst."division_id" IS NOT NULL
      AND mapping."legacy_entity_type" = 'DIVISION'
      AND mapping."legacy_entity_id" = dst."division_id")
  );

UPDATE "duty_schedule_series" AS dss
SET
  "office_id" = mapping."office_id",
  "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" AS mapping
WHERE (
    (dss."department_id" IS NOT NULL
      AND mapping."legacy_entity_type" = 'DEPARTMENT'
      AND mapping."legacy_entity_id" = dss."department_id")
    OR
    (dss."department_id" IS NULL
      AND mapping."legacy_entity_type" = 'DIVISION'
      AND mapping."legacy_entity_id" = dss."division_id")
  );

UPDATE "duty_assignments" AS da
SET
  "office_id" = mapping."office_id",
  "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" AS mapping
WHERE (
    (da."department_id" IS NOT NULL
      AND mapping."legacy_entity_type" = 'DEPARTMENT'
      AND mapping."legacy_entity_id" = da."department_id")
    OR
    (da."department_id" IS NULL
      AND mapping."legacy_entity_type" = 'DIVISION'
      AND mapping."legacy_entity_id" = da."division_id")
  );

UPDATE "duty_coverage_requirements" AS dcr
SET
  "office_id" = mapping."office_id",
  "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" AS mapping
WHERE mapping."legacy_entity_type" = 'DEPARTMENT'
  AND mapping."legacy_entity_id" = dcr."department_id";

UPDATE "duty_exceptions" AS de
SET
  "office_id" = mapping."office_id",
  "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" AS mapping
WHERE (
    (de."department_id" IS NOT NULL
      AND mapping."legacy_entity_type" = 'DEPARTMENT'
      AND mapping."legacy_entity_id" = de."department_id")
    OR
    (de."department_id" IS NULL
      AND mapping."legacy_entity_type" = 'DIVISION'
      AND mapping."legacy_entity_id" = de."division_id")
  );

UPDATE "duty_holidays" AS dh
SET
  "office_id" = mapping."office_id",
  "org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" AS mapping
WHERE (
    (dh."department_id" IS NOT NULL
      AND mapping."legacy_entity_type" = 'DEPARTMENT'
      AND mapping."legacy_entity_id" = dh."department_id")
    OR
    (dh."department_id" IS NULL
      AND dh."division_id" IS NOT NULL
      AND mapping."legacy_entity_type" = 'DIVISION'
      AND mapping."legacy_entity_id" = dh."division_id")
  );

-- Branch-wide legacy records had no Division/Department key. They can be assigned
-- automatically only when the installation currently contains exactly one Office.
WITH single_office AS (
  SELECT "id" AS "office_id"
  FROM "offices"
  WHERE (SELECT COUNT(*) FROM "offices") = 1
  LIMIT 1
)
UPDATE "duty_shift_templates" AS dst
SET "office_id" = single_office."office_id"
FROM single_office
WHERE dst."office_id" IS NULL
  AND dst."division_id" IS NULL
  AND dst."department_id" IS NULL;

WITH single_office AS (
  SELECT "id" AS "office_id"
  FROM "offices"
  WHERE (SELECT COUNT(*) FROM "offices") = 1
  LIMIT 1
)
UPDATE "duty_holidays" AS dh
SET "office_id" = single_office."office_id"
FROM single_office
WHERE dh."office_id" IS NULL
  AND dh."division_id" IS NULL
  AND dh."department_id" IS NULL;

ALTER TABLE "duty_shift_templates"
  ADD CONSTRAINT "duty_shift_templates_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "duty_shift_templates_org_unit_id_fkey"
  FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_schedule_series"
  ADD CONSTRAINT "duty_schedule_series_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "duty_schedule_series_org_unit_id_fkey"
  FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_assignments"
  ADD CONSTRAINT "duty_assignments_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "duty_assignments_org_unit_id_fkey"
  FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_coverage_requirements"
  ADD CONSTRAINT "duty_coverage_requirements_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "duty_coverage_requirements_org_unit_id_fkey"
  FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_exceptions"
  ADD CONSTRAINT "duty_exceptions_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "duty_exceptions_org_unit_id_fkey"
  FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "duty_holidays"
  ADD CONSTRAINT "duty_holidays_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "duty_holidays_org_unit_id_fkey"
  FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "duty_shift_templates_v3_scope_active_idx"
  ON "duty_shift_templates"("office_id", "org_unit_id", "is_active");
CREATE INDEX "duty_schedule_series_v3_scope_dates_idx"
  ON "duty_schedule_series"("office_id", "org_unit_id", "start_date", "end_date");
CREATE INDEX "duty_assignments_v3_scope_window_idx"
  ON "duty_assignments"("office_id", "org_unit_id", "starts_at", "ends_at");
CREATE INDEX "duty_coverage_requirements_v3_scope_dates_idx"
  ON "duty_coverage_requirements"("office_id", "org_unit_id", "effective_from", "effective_until");
CREATE INDEX "duty_exceptions_v3_scope_date_idx"
  ON "duty_exceptions"("office_id", "org_unit_id", "exception_date");
CREATE INDEX "duty_holidays_v3_scope_dates_idx"
  ON "duty_holidays"("office_id", "org_unit_id", "start_date", "end_date");

-- Keep additive compatibility safe: an OrgUnit-scoped row may not exist without an Office.
ALTER TABLE "duty_shift_templates"
  ADD CONSTRAINT "duty_shift_templates_v3_scope_check"
  CHECK ("org_unit_id" IS NULL OR "office_id" IS NOT NULL);
ALTER TABLE "duty_schedule_series"
  ADD CONSTRAINT "duty_schedule_series_v3_scope_check"
  CHECK ("org_unit_id" IS NULL OR "office_id" IS NOT NULL);
ALTER TABLE "duty_assignments"
  ADD CONSTRAINT "duty_assignments_v3_scope_check"
  CHECK ("org_unit_id" IS NULL OR "office_id" IS NOT NULL);
ALTER TABLE "duty_coverage_requirements"
  ADD CONSTRAINT "duty_coverage_requirements_v3_scope_check"
  CHECK ("org_unit_id" IS NULL OR "office_id" IS NOT NULL);
ALTER TABLE "duty_exceptions"
  ADD CONSTRAINT "duty_exceptions_v3_scope_check"
  CHECK ("org_unit_id" IS NULL OR "office_id" IS NOT NULL);
ALTER TABLE "duty_holidays"
  ADD CONSTRAINT "duty_holidays_v3_scope_check"
  CHECK ("org_unit_id" IS NULL OR "office_id" IS NOT NULL);
