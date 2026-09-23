-- Align the WorkStageAssignment target-shape constraint with the V3 Operational Team cutover.
--
-- Canonical runtime writes:
--   * ORG_UNIT_QUEUE -> target_org_unit_id only
--   * TEAM           -> target_operational_team_id only
--   * ACCOUNT        -> target_account_id only
--
-- Historical TEAM rows created during the TS-C compatibility window may still
-- retain target_org_unit_id together with target_operational_team_id. Keep that
-- historical shape readable while requiring every TEAM assignment to identify
-- either the canonical Operational Team target or the retained legacy OrgUnit.

BEGIN;

ALTER TABLE "work_stage_assignments"
  DROP CONSTRAINT IF EXISTS "work_stage_assignments_target_shape_check";

ALTER TABLE "work_stage_assignments"
  ADD CONSTRAINT "work_stage_assignments_target_shape_check"
  CHECK (
    (
      "target_type" = 'ORG_UNIT_QUEUE'
      AND "target_org_unit_id" IS NOT NULL
      AND "target_account_id" IS NULL
      AND "target_operational_team_id" IS NULL
    )
    OR
    (
      "target_type" = 'TEAM'
      AND "target_account_id" IS NULL
      AND (
        "target_operational_team_id" IS NOT NULL
        OR "target_org_unit_id" IS NOT NULL
      )
    )
    OR
    (
      "target_type" = 'ACCOUNT'
      AND "target_org_unit_id" IS NULL
      AND "target_account_id" IS NOT NULL
      AND "target_operational_team_id" IS NULL
    )
  );

COMMIT;
