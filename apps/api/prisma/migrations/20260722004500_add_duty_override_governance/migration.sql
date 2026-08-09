-- Duty overrides remain explicit, auditable and queryable without replacing existing schedules.
CREATE TYPE "DutyAssignmentAuthority" AS ENUM (
  'STANDARD_HIERARCHY',
  'SUPER_ADMIN_OVERRIDE'
);

ALTER TYPE "DutyActivityAction" ADD VALUE IF NOT EXISTS 'OVERRIDE_ASSIGNED';

ALTER TABLE "duty_schedule_series"
ADD COLUMN "authority" "DutyAssignmentAuthority" NOT NULL DEFAULT 'STANDARD_HIERARCHY',
ADD COLUMN "override_reason" VARCHAR(500),
ADD COLUMN "hierarchy_override" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "conflict_override" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "duty_assignments"
ADD COLUMN "authority" "DutyAssignmentAuthority" NOT NULL DEFAULT 'STANDARD_HIERARCHY',
ADD COLUMN "override_reason" VARCHAR(500),
ADD COLUMN "hierarchy_override" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "conflict_override" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "duty_assignments_created_by_start_idx"
ON "duty_assignments"("created_by_account_id", "starts_at");

CREATE INDEX "duty_assignments_authority_start_idx"
ON "duty_assignments"("authority", "starts_at");

-- Database checks prevent future code paths from recording silent or reasonless overrides.
ALTER TABLE "duty_schedule_series"
ADD CONSTRAINT "duty_schedule_series_override_governance_check"
CHECK (
  (
    "authority" = 'STANDARD_HIERARCHY'
    AND "override_reason" IS NULL
    AND "hierarchy_override" = false
    AND "conflict_override" = false
  )
  OR
  (
    "authority" = 'SUPER_ADMIN_OVERRIDE'
    AND "override_reason" IS NOT NULL
    AND char_length(btrim("override_reason")) >= 10
    AND ("hierarchy_override" = true OR "conflict_override" = true)
  )
);

ALTER TABLE "duty_assignments"
ADD CONSTRAINT "duty_assignments_override_governance_check"
CHECK (
  (
    "authority" = 'STANDARD_HIERARCHY'
    AND "override_reason" IS NULL
    AND "hierarchy_override" = false
    AND "conflict_override" = false
  )
  OR
  (
    "authority" = 'SUPER_ADMIN_OVERRIDE'
    AND "override_reason" IS NOT NULL
    AND char_length(btrim("override_reason")) >= 10
    AND ("hierarchy_override" = true OR "conflict_override" = true)
  )
);
