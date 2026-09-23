-- Persist the fixed Work Type template directly on the version. Historical
-- WorkStageDefinition rows are retained for audit/history, but active Work
-- creation/configuration no longer derives template behavior from stage rows.

ALTER TABLE "work_type_versions"
  ADD COLUMN IF NOT EXISTS "template" VARCHAR(40);

UPDATE "work_type_versions" AS v
SET "template" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "work_stage_definitions" AS s
    WHERE s."work_type_version_id" = v."id"
      AND s."code" = 'EXECUTION'
      AND s."assignment_mode"::text = 'TEAM_OR_USER'
  ) THEN 'ADMINISTRATIVE'
  WHEN EXISTS (
    SELECT 1
    FROM "work_stage_definitions" AS s
    WHERE s."work_type_version_id" = v."id"
      AND s."code" = 'SALES_COORDINATION'
  ) THEN 'TEAM_SALES'
  ELSE 'STANDARD'
END
WHERE "template" IS NULL
   OR "template" NOT IN ('STANDARD', 'TEAM_SALES', 'ADMINISTRATIVE');

ALTER TABLE "work_type_versions"
  ALTER COLUMN "template" SET DEFAULT 'STANDARD',
  ALTER COLUMN "template" SET NOT NULL;

ALTER TABLE "work_type_versions"
  DROP CONSTRAINT IF EXISTS "work_type_versions_template_check";

ALTER TABLE "work_type_versions"
  ADD CONSTRAINT "work_type_versions_template_check"
  CHECK ("template" IN ('STANDARD', 'TEAM_SALES', 'ADMINISTRATIVE'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "work_type_versions"
    WHERE "template" IS NULL
       OR "template" NOT IN ('STANDARD', 'TEAM_SALES', 'ADMINISTRATIVE')
  ) THEN
    RAISE EXCEPTION 'Work Type template backfill reconciliation failed.';
  END IF;
END $$;
