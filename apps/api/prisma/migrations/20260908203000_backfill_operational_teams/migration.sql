-- TS-B: Backfill legacy DepartmentTeam data into the new Operational Team model.
--
-- Business rule:
-- - Operational Team is an execution grouping under a formal OrgUnit.
-- - Operational Team is NOT an OrgUnit and never participates in OrgUnitClosure.
-- - Existing legacy Team OrgUnits and legacy mappings remain untouched for
--   historical compatibility until the later cleanup phase.
--
-- Historical safety:
-- - Team and Team-member timestamps are copied from proven legacy rows.
-- - The legacy schema stores only the current Team Admin, not a reliable
--   effective-history interval. Therefore only the CURRENT active Team Lead is
--   established here, effective from this migration, without inventing an
--   earlier leadership period.

BEGIN;

-- Fail closed if any legacy Team cannot be attached to its formal Department
-- OrgUnit or if the mapped Department target is itself marked as a Team.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "department_teams" AS team
    LEFT JOIN "legacy_org_unit_mappings" AS department_mapping
      ON department_mapping."legacy_entity_type" = 'DEPARTMENT'
     AND department_mapping."legacy_entity_id" = team."department_id"
    LEFT JOIN "org_units" AS department_unit
      ON department_unit."id" = department_mapping."org_unit_id"
    LEFT JOIN "org_unit_types" AS department_unit_type
      ON department_unit_type."id" = department_unit."org_unit_type_id"
    WHERE department_mapping."id" IS NULL
       OR department_unit."id" IS NULL
       OR department_unit_type."is_team" IS DISTINCT FROM FALSE
  ) THEN
    RAISE EXCEPTION
      'TS-B cannot backfill Operational Teams because a legacy Team is missing a formal non-Team Department OrgUnit mapping.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "department_teams" AS team
    LEFT JOIN "legacy_org_unit_mappings" AS team_mapping
      ON team_mapping."legacy_entity_type" = 'TEAM'
     AND team_mapping."legacy_entity_id" = team."id"
    LEFT JOIN "org_units" AS legacy_team_unit
      ON legacy_team_unit."id" = team_mapping."org_unit_id"
    LEFT JOIN "org_unit_types" AS legacy_team_unit_type
      ON legacy_team_unit_type."id" = legacy_team_unit."org_unit_type_id"
    WHERE team_mapping."id" IS NULL
       OR legacy_team_unit."id" IS NULL
       OR legacy_team_unit_type."is_team" IS DISTINCT FROM TRUE
  ) THEN
    RAISE EXCEPTION
      'TS-B cannot backfill Operational Teams because a legacy Team compatibility OrgUnit mapping is missing or invalid.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "department_teams" AS team
    WHERE team."is_active" = TRUE
      AND NOT EXISTS (
        SELECT 1
        FROM "department_team_members" AS member
        WHERE member."team_id" = team."id"
          AND member."employee_id" = team."team_admin_employee_id"
      )
  ) THEN
    RAISE EXCEPTION
      'TS-B cannot establish current Team Leads because an active legacy Team Admin is not a member of that Team.';
  END IF;
END
$$;

-- Preserve the old Team OrgUnit code as the Operational Team code. The Team is
-- attached to the formal Department OrgUnit instead of the old Team OrgUnit.
INSERT INTO "operational_teams" (
  "id",
  "org_unit_id",
  "legacy_department_team_id",
  "code",
  "name",
  "name_key",
  "is_active",
  "sort_order",
  "archived_at",
  "created_by_account_id",
  "updated_by_account_id",
  "archived_by_account_id",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  department_mapping."org_unit_id",
  team."id",
  legacy_team_unit."code",
  team."name",
  team."name_key",
  team."is_active",
  legacy_team_unit."sort_order",
  team."archived_at",
  team."created_by_account_id",
  team."updated_by_account_id",
  team."archived_by_account_id",
  team."created_at",
  team."updated_at"
FROM "department_teams" AS team
JOIN "legacy_org_unit_mappings" AS department_mapping
  ON department_mapping."legacy_entity_type" = 'DEPARTMENT'
 AND department_mapping."legacy_entity_id" = team."department_id"
JOIN "legacy_org_unit_mappings" AS team_mapping
  ON team_mapping."legacy_entity_type" = 'TEAM'
 AND team_mapping."legacy_entity_id" = team."id"
JOIN "org_units" AS legacy_team_unit
  ON legacy_team_unit."id" = team_mapping."org_unit_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "operational_teams" AS existing_team
  WHERE existing_team."legacy_department_team_id" = team."id"
);

-- Legacy DepartmentTeamMember rows represent the current active legacy Team
-- membership set. Preserve their proven start timestamp and assignment actor.
INSERT INTO "operational_team_members" (
  "id",
  "team_id",
  "employee_id",
  "assignment_source",
  "starts_at",
  "ends_at",
  "assigned_by_account_id",
  "ended_by_account_id",
  "assignment_reason",
  "end_reason",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  operational_team."id",
  member."employee_id",
  'LEGACY_MIGRATION'::"OrgAssignmentSource",
  member."created_at",
  NULL,
  member."added_by_account_id",
  NULL,
  'Backfilled from legacy DepartmentTeam membership.',
  NULL,
  member."created_at",
  member."created_at"
FROM "department_team_members" AS member
JOIN "operational_teams" AS operational_team
  ON operational_team."legacy_department_team_id" = member."team_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "operational_team_members" AS existing_member
  WHERE existing_member."team_id" = operational_team."id"
    AND existing_member."employee_id" = member."employee_id"
    AND existing_member."ends_at" IS NULL
);

-- The legacy Team model only proves who the CURRENT Team Admin is. Establish
-- one current Team Lead for each active Team from the migration instant. Do not
-- fabricate an earlier effective interval.
INSERT INTO "operational_team_lead_assignments" (
  "id",
  "team_id",
  "employee_id",
  "assignment_source",
  "is_acting",
  "effective_from",
  "effective_until",
  "assigned_by_account_id",
  "ended_by_account_id",
  "assignment_reason",
  "end_reason",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  operational_team."id",
  team."team_admin_employee_id",
  'LEGACY_MIGRATION'::"OrgAssignmentSource",
  FALSE,
  CURRENT_TIMESTAMP,
  NULL,
  NULL,
  NULL,
  'Current legacy Team Admin established as Operational Team Lead at Team Separation cutover; no earlier effective period inferred.',
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "department_teams" AS team
JOIN "operational_teams" AS operational_team
  ON operational_team."legacy_department_team_id" = team."id"
WHERE team."is_active" = TRUE
  AND team."archived_at" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "operational_team_lead_assignments" AS existing_lead
    WHERE existing_lead."team_id" = operational_team."id"
      AND existing_lead."employee_id" = team."team_admin_employee_id"
      AND existing_lead."effective_until" IS NULL
  );

-- Reconciliation gates. Any mismatch aborts and rolls back the entire migration.
DO $$
DECLARE
  legacy_team_count INTEGER;
  operational_team_count INTEGER;
  legacy_member_count INTEGER;
  operational_member_count INTEGER;
  active_legacy_team_count INTEGER;
  active_lead_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO legacy_team_count
  FROM "department_teams";

  SELECT COUNT(*)
    INTO operational_team_count
  FROM "operational_teams"
  WHERE "legacy_department_team_id" IS NOT NULL;

  IF operational_team_count <> legacy_team_count THEN
    RAISE EXCEPTION
      'TS-B Operational Team reconciliation failed: expected %, found %.',
      legacy_team_count,
      operational_team_count;
  END IF;

  SELECT COUNT(*)
    INTO legacy_member_count
  FROM "department_team_members";

  SELECT COUNT(*)
    INTO operational_member_count
  FROM "operational_team_members" AS member
  JOIN "operational_teams" AS team
    ON team."id" = member."team_id"
  WHERE team."legacy_department_team_id" IS NOT NULL
    AND member."ends_at" IS NULL;

  IF operational_member_count <> legacy_member_count THEN
    RAISE EXCEPTION
      'TS-B Team member reconciliation failed: expected %, found %.',
      legacy_member_count,
      operational_member_count;
  END IF;

  SELECT COUNT(*)
    INTO active_legacy_team_count
  FROM "department_teams"
  WHERE "is_active" = TRUE
    AND "archived_at" IS NULL;

  SELECT COUNT(*)
    INTO active_lead_count
  FROM "operational_team_lead_assignments" AS lead
  JOIN "operational_teams" AS team
    ON team."id" = lead."team_id"
  WHERE team."legacy_department_team_id" IS NOT NULL
    AND lead."effective_until" IS NULL;

  IF active_lead_count <> active_legacy_team_count THEN
    RAISE EXCEPTION
      'TS-B Team Lead reconciliation failed: expected %, found %.',
      active_legacy_team_count,
      active_lead_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "operational_teams" AS team
    JOIN "org_units" AS unit
      ON unit."id" = team."org_unit_id"
    JOIN "org_unit_types" AS unit_type
      ON unit_type."id" = unit."org_unit_type_id"
    WHERE unit_type."is_team" = TRUE
  ) THEN
    RAISE EXCEPTION
      'TS-B attached an Operational Team to a legacy Team OrgUnit instead of a formal OrgUnit.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "operational_teams" AS operational_team
    JOIN "department_teams" AS legacy_team
      ON legacy_team."id" = operational_team."legacy_department_team_id"
    JOIN "legacy_org_unit_mappings" AS department_mapping
      ON department_mapping."legacy_entity_type" = 'DEPARTMENT'
     AND department_mapping."legacy_entity_id" = legacy_team."department_id"
    WHERE operational_team."org_unit_id" <> department_mapping."org_unit_id"
  ) THEN
    RAISE EXCEPTION
      'TS-B Operational Team parent reconciliation failed.';
  END IF;
END
$$;

COMMIT;
