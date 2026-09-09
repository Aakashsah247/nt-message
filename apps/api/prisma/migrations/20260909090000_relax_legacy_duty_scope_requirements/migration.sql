-- Phase 11 P11-3: make Office/OrgUnit the authoritative Duty scope.
-- Legacy Division/Department columns remain for compatibility/history but are no longer required for new Duty writes.
ALTER TABLE "duty_schedule_series"
  ALTER COLUMN "division_id" DROP NOT NULL;

ALTER TABLE "duty_assignments"
  ALTER COLUMN "division_id" DROP NOT NULL;

ALTER TABLE "duty_coverage_requirements"
  ALTER COLUMN "department_id" DROP NOT NULL;

ALTER TABLE "duty_exceptions"
  ALTER COLUMN "division_id" DROP NOT NULL;
