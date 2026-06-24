-- Stop the migration if historical duplicate official positions already exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "management_positions"
    WHERE "position_type" = 'SENIOR_MANAGEMENT'
    GROUP BY "division_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate Senior Management positions exist for the same division.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "management_positions"
    WHERE "position_type" = 'TEAM_MANAGER'
    GROUP BY "department_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate Team Manager positions exist for the same department.';
  END IF;
END
$$;

-- Replace active-only indexes with permanent official-position uniqueness.
DROP INDEX "management_positions_active_senior_division_key";

DROP INDEX "management_positions_active_team_department_key";

-- A division can have only one official Senior Management position,
-- whether that position is active or inactive.
CREATE UNIQUE INDEX
"management_positions_senior_division_key"
ON "management_positions" ("division_id")
WHERE "position_type" = 'SENIOR_MANAGEMENT';

-- A department can have only one official Team Manager position,
-- whether that position is active or inactive.
CREATE UNIQUE INDEX
"management_positions_team_department_key"
ON "management_positions" ("department_id")
WHERE "position_type" = 'TEAM_MANAGER';
