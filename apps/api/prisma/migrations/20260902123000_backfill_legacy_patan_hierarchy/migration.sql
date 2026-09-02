BEGIN;

-- ============================================================
-- NT MESSAGE HIERARCHY V3
-- LEGACY PATAN ORGANIZATION BACKFILL
--
-- This migration is deliberately non-destructive:
-- legacy Division / Department / DepartmentTeam /
-- ManagementAssignment records remain intact.
-- ============================================================

CREATE TABLE "legacy_org_unit_mappings" (
  "id" UUID NOT NULL,
  "office_id" UUID NOT NULL,
  "legacy_entity_type" VARCHAR(30) NOT NULL,
  "legacy_entity_id" UUID NOT NULL,
  "org_unit_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "legacy_org_unit_mappings_pkey"
    PRIMARY KEY ("id"),

  CONSTRAINT "legacy_org_unit_mappings_entity_type_check"
    CHECK (
      "legacy_entity_type" IN (
        'DIVISION',
        'DEPARTMENT',
        'TEAM'
      )
    )
);

CREATE UNIQUE INDEX
  "legacy_org_unit_mappings_org_unit_id_key"
ON "legacy_org_unit_mappings" ("org_unit_id");

CREATE UNIQUE INDEX
  "legacy_org_unit_mappings_entity_key"
ON "legacy_org_unit_mappings" (
  "legacy_entity_type",
  "legacy_entity_id"
);

CREATE INDEX
  "legacy_org_unit_mappings_office_type_idx"
ON "legacy_org_unit_mappings" (
  "office_id",
  "legacy_entity_type"
);

ALTER TABLE "legacy_org_unit_mappings"
ADD CONSTRAINT "legacy_org_unit_mappings_office_id_fkey"
FOREIGN KEY ("office_id")
REFERENCES "offices"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "legacy_org_unit_mappings"
ADD CONSTRAINT "legacy_org_unit_mappings_org_unit_id_fkey"
FOREIGN KEY ("org_unit_id")
REFERENCES "org_units"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;


-- ============================================================
-- PRECONDITIONS
-- ============================================================

DO $$
BEGIN
  IF
    EXISTS (SELECT 1 FROM "offices")
    OR EXISTS (SELECT 1 FROM "org_unit_types")
    OR EXISTS (SELECT 1 FROM "org_units")
    OR EXISTS (SELECT 1 FROM "org_unit_closure")
    OR EXISTS (SELECT 1 FROM "org_memberships")
    OR EXISTS (SELECT 1 FROM "org_leadership_assignments")
  THEN
    RAISE EXCEPTION
      'Hierarchy V3 backfill requires an empty new organization hierarchy.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "employees"
    WHERE "division_id" IS NULL
  ) THEN
    RAISE EXCEPTION
      'One or more employees have no legacy Division.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "employees" e
    JOIN "departments" d
      ON d."id" = e."department_id"
    WHERE
      e."department_id" IS NOT NULL
      AND e."division_id" IS DISTINCT FROM d."division_id"
  ) THEN
    RAISE EXCEPTION
      'Employee Division/Department legacy placement is inconsistent.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "department_team_members" tm
    JOIN "employees" e
      ON e."id" = tm."employee_id"
    JOIN "department_teams" t
      ON t."id" = tm."team_id"
    WHERE
      e."department_id" IS DISTINCT FROM t."department_id"
  ) THEN
    RAISE EXCEPTION
      'Cross-Department legacy Team membership requires manual reconciliation.';
  END IF;

  IF EXISTS (
    SELECT ma."position_id"
    FROM "management_assignments" ma
    WHERE ma."ended_at" IS NULL
    GROUP BY ma."position_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'A legacy management position has multiple active occupants.';
  END IF;

  IF EXISTS (
    SELECT ma."employee_id"
    FROM "management_assignments" ma
    WHERE ma."ended_at" IS NULL
    GROUP BY ma."employee_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'A legacy employee has multiple active management assignments.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "management_assignments" ma
    JOIN "employees" e
      ON e."id" = ma."employee_id"
    WHERE
      ma."ended_at" IS NULL
      AND (
        e."status" <> 'ACTIVE'
        OR e."employment_status" <> 'ACTIVE'
        OR e."archived_at" IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION
      'An active management assignment belongs to an inactive employee.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "department_teams" t
    JOIN "employees" e
      ON e."id" = t."team_admin_employee_id"
    WHERE
      t."is_active" = true
      AND t."archived_at" IS NULL
      AND (
        e."status" <> 'ACTIVE'
        OR e."employment_status" <> 'ACTIVE'
        OR e."archived_at" IS NOT NULL
      )
  ) THEN
    RAISE EXCEPTION
      'An active Team has an inactive Team Admin.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "department_teams" t
    WHERE
      t."is_active" = true
      AND t."archived_at" IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "department_team_members" tm
        WHERE
          tm."team_id" = t."id"
          AND tm."employee_id" = t."team_admin_employee_id"
      )
  ) THEN
    RAISE EXCEPTION
      'An active legacy Team Admin is not a Team member.';
  END IF;
END
$$;


-- OrgUnit codes are Office-wide unique in V3.
DO $$
BEGIN
  IF EXISTS (
    WITH candidate_codes AS (
      SELECT
        UPPER(BTRIM(d."code")) AS code
      FROM "divisions" d

      UNION ALL

      SELECT
        UPPER(BTRIM(dep."code"))
      FROM "departments" dep

      UNION ALL

      SELECT
        UPPER(
          BTRIM(dep."code")
          || '-TEAM-'
          || BTRIM(
            REGEXP_REPLACE(
              BTRIM(t."name"),
              '[^A-Za-z0-9]+',
              '-',
              'g'
            ),
            '-'
          )
        )
      FROM "department_teams" t
      JOIN "departments" dep
        ON dep."id" = t."department_id"
    )
    SELECT 1
    FROM candidate_codes
    GROUP BY code
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Legacy organization values would create duplicate V3 OrgUnit codes.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "department_teams" t
    JOIN "departments" dep
      ON dep."id" = t."department_id"
    WHERE LENGTH(
      UPPER(
        BTRIM(dep."code")
        || '-TEAM-'
        || BTRIM(
          REGEXP_REPLACE(
            BTRIM(t."name"),
            '[^A-Za-z0-9]+',
            '-',
            'g'
          ),
          '-'
        )
      )
    ) > 50
  ) THEN
    RAISE EXCEPTION
      'A generated Team OrgUnit code exceeds 50 characters.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "divisions"
    GROUP BY LOWER(
      REGEXP_REPLACE(
        BTRIM("name"),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate normalized legacy Division names were found.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "departments"
    GROUP BY
      "division_id",
      LOWER(
        REGEXP_REPLACE(
          BTRIM("name"),
          '[[:space:]]+',
          ' ',
          'g'
        )
      )
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate normalized legacy Department sibling names were found.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "department_teams"
    GROUP BY
      "department_id",
      LOWER(
        REGEXP_REPLACE(
          BTRIM("name"),
          '[[:space:]]+',
          ' ',
          'g'
        )
      )
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Duplicate normalized legacy Team sibling names were found.';
  END IF;
END
$$;


-- ============================================================
-- OFFICE
-- ============================================================

INSERT INTO "offices" (
  "id",
  "code",
  "name",
  "name_key",
  "is_active",
  "sort_order",
  "created_at",
  "updated_at"
)
VALUES (
  gen_random_uuid(),
  'PATAN',
  'Patan Telecom Office',
  'patan telecom office',
  true,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);


-- ============================================================
-- CONFIGURABLE ORG UNIT TYPES
-- ============================================================

INSERT INTO "org_unit_types" (
  "id",
  "office_id",
  "code",
  "name",
  "name_key",
  "is_team",
  "is_active",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  o."id",
  v.code,
  v.name,
  v.name_key,
  v.is_team,
  true,
  v.sort_order,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "offices" o
CROSS JOIN (
  VALUES
    ('DIVISION',   'Division', 'division', false, 10),
    ('DEPARTMENT', 'Department', 'department', false, 20),
    ('SECTION',    'Section', 'section', false, 30),
    ('UNIT',       'Unit', 'unit', false, 40),
    ('SUB_UNIT',   'Sub-Unit', 'sub-unit', false, 50),
    ('TEAM',       'Team', 'team', true, 60),
    ('OTHER',      'Other', 'other', false, 70)
) AS v(
  code,
  name,
  name_key,
  is_team,
  sort_order
)
WHERE o."code" = 'PATAN';


-- ============================================================
-- TEMPORARY MIGRATION MAP
-- ============================================================

CREATE TEMP TABLE "_legacy_org_backfill_map" (
  "entity_type" VARCHAR(30) NOT NULL,
  "legacy_id" UUID NOT NULL,
  "new_org_unit_id" UUID NOT NULL,

  PRIMARY KEY ("entity_type", "legacy_id"),
  UNIQUE ("new_org_unit_id")
) ON COMMIT DROP;

INSERT INTO "_legacy_org_backfill_map" (
  "entity_type",
  "legacy_id",
  "new_org_unit_id"
)
SELECT
  'DIVISION',
  d."id",
  gen_random_uuid()
FROM "divisions" d;

INSERT INTO "_legacy_org_backfill_map" (
  "entity_type",
  "legacy_id",
  "new_org_unit_id"
)
SELECT
  'DEPARTMENT',
  d."id",
  gen_random_uuid()
FROM "departments" d;

INSERT INTO "_legacy_org_backfill_map" (
  "entity_type",
  "legacy_id",
  "new_org_unit_id"
)
SELECT
  'TEAM',
  t."id",
  gen_random_uuid()
FROM "department_teams" t;


-- ============================================================
-- DIVISION ORG UNITS
-- ============================================================

INSERT INTO "org_units" (
  "id",
  "office_id",
  "org_unit_type_id",
  "parent_org_unit_id",
  "code",
  "name",
  "name_key",
  "is_active",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  m."new_org_unit_id",
  o."id",
  type."id",
  NULL,
  UPPER(BTRIM(d."code")),
  REGEXP_REPLACE(
    BTRIM(d."name"),
    '[[:space:]]+',
    ' ',
    'g'
  ),
  LOWER(
    REGEXP_REPLACE(
      BTRIM(d."name"),
      '[[:space:]]+',
      ' ',
      'g'
    )
  ),
  d."is_active",
  (
    ROW_NUMBER() OVER (
      ORDER BY LOWER(d."name"), d."id"
    ) - 1
  )::INTEGER,
  d."created_at",
  d."updated_at"
FROM "divisions" d
JOIN "_legacy_org_backfill_map" m
  ON m."entity_type" = 'DIVISION'
 AND m."legacy_id" = d."id"
JOIN "offices" o
  ON o."code" = 'PATAN'
JOIN "org_unit_types" type
  ON type."office_id" = o."id"
 AND type."code" = 'DIVISION';


-- ============================================================
-- DEPARTMENT ORG UNITS
-- ============================================================

INSERT INTO "org_units" (
  "id",
  "office_id",
  "org_unit_type_id",
  "parent_org_unit_id",
  "code",
  "name",
  "name_key",
  "is_active",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  department_map."new_org_unit_id",
  o."id",
  type."id",
  division_map."new_org_unit_id",
  UPPER(BTRIM(dep."code")),
  REGEXP_REPLACE(
    BTRIM(dep."name"),
    '[[:space:]]+',
    ' ',
    'g'
  ),
  LOWER(
    REGEXP_REPLACE(
      BTRIM(dep."name"),
      '[[:space:]]+',
      ' ',
      'g'
    )
  ),
  dep."is_active",
  (
    ROW_NUMBER() OVER (
      PARTITION BY dep."division_id"
      ORDER BY LOWER(dep."name"), dep."id"
    ) - 1
  )::INTEGER,
  dep."created_at",
  dep."updated_at"
FROM "departments" dep
JOIN "_legacy_org_backfill_map" department_map
  ON department_map."entity_type" = 'DEPARTMENT'
 AND department_map."legacy_id" = dep."id"
JOIN "_legacy_org_backfill_map" division_map
  ON division_map."entity_type" = 'DIVISION'
 AND division_map."legacy_id" = dep."division_id"
JOIN "offices" o
  ON o."code" = 'PATAN'
JOIN "org_unit_types" type
  ON type."office_id" = o."id"
 AND type."code" = 'DEPARTMENT';


-- ============================================================
-- TEAM ORG UNITS
-- ============================================================

INSERT INTO "org_units" (
  "id",
  "office_id",
  "org_unit_type_id",
  "parent_org_unit_id",
  "code",
  "name",
  "name_key",
  "is_active",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  team_map."new_org_unit_id",
  o."id",
  type."id",
  department_map."new_org_unit_id",

  UPPER(
    BTRIM(dep."code")
    || '-TEAM-'
    || BTRIM(
      REGEXP_REPLACE(
        BTRIM(t."name"),
        '[^A-Za-z0-9]+',
        '-',
        'g'
      ),
      '-'
    )
  ),

  REGEXP_REPLACE(
    BTRIM(t."name"),
    '[[:space:]]+',
    ' ',
    'g'
  ),

  LOWER(
    REGEXP_REPLACE(
      BTRIM(t."name"),
      '[[:space:]]+',
      ' ',
      'g'
    )
  ),

  (
    t."is_active"
    AND t."archived_at" IS NULL
  ),

  (
    ROW_NUMBER() OVER (
      PARTITION BY t."department_id"
      ORDER BY LOWER(t."name"), t."id"
    ) - 1
  )::INTEGER,

  t."created_at",
  t."updated_at"

FROM "department_teams" t
JOIN "departments" dep
  ON dep."id" = t."department_id"
JOIN "_legacy_org_backfill_map" team_map
  ON team_map."entity_type" = 'TEAM'
 AND team_map."legacy_id" = t."id"
JOIN "_legacy_org_backfill_map" department_map
  ON department_map."entity_type" = 'DEPARTMENT'
 AND department_map."legacy_id" = t."department_id"
JOIN "offices" o
  ON o."code" = 'PATAN'
JOIN "org_unit_types" type
  ON type."office_id" = o."id"
 AND type."code" = 'TEAM';


-- ============================================================
-- PERMANENT LEGACY ↔ V3 MAPPING
-- ============================================================

INSERT INTO "legacy_org_unit_mappings" (
  "id",
  "office_id",
  "legacy_entity_type",
  "legacy_entity_id",
  "org_unit_id",
  "created_at"
)
SELECT
  gen_random_uuid(),
  o."id",
  m."entity_type",
  m."legacy_id",
  m."new_org_unit_id",
  CURRENT_TIMESTAMP
FROM "_legacy_org_backfill_map" m
JOIN "offices" o
  ON o."code" = 'PATAN';


-- ============================================================
-- CLOSURE TABLE
-- ============================================================

-- Every unit is its own ancestor at depth 0.
INSERT INTO "org_unit_closure" (
  "ancestor_org_unit_id",
  "descendant_org_unit_id",
  "depth"
)
SELECT
  u."id",
  u."id",
  0
FROM "org_units" u
JOIN "offices" o
  ON o."id" = u."office_id"
WHERE o."code" = 'PATAN';


-- Division -> Department.
INSERT INTO "org_unit_closure" (
  "ancestor_org_unit_id",
  "descendant_org_unit_id",
  "depth"
)
SELECT
  division_map."new_org_unit_id",
  department_map."new_org_unit_id",
  1
FROM "departments" dep
JOIN "_legacy_org_backfill_map" division_map
  ON division_map."entity_type" = 'DIVISION'
 AND division_map."legacy_id" = dep."division_id"
JOIN "_legacy_org_backfill_map" department_map
  ON department_map."entity_type" = 'DEPARTMENT'
 AND department_map."legacy_id" = dep."id";


-- Department -> Team.
INSERT INTO "org_unit_closure" (
  "ancestor_org_unit_id",
  "descendant_org_unit_id",
  "depth"
)
SELECT
  department_map."new_org_unit_id",
  team_map."new_org_unit_id",
  1
FROM "department_teams" t
JOIN "_legacy_org_backfill_map" department_map
  ON department_map."entity_type" = 'DEPARTMENT'
 AND department_map."legacy_id" = t."department_id"
JOIN "_legacy_org_backfill_map" team_map
  ON team_map."entity_type" = 'TEAM'
 AND team_map."legacy_id" = t."id";


-- Division -> Team.
INSERT INTO "org_unit_closure" (
  "ancestor_org_unit_id",
  "descendant_org_unit_id",
  "depth"
)
SELECT
  division_map."new_org_unit_id",
  team_map."new_org_unit_id",
  2
FROM "department_teams" t
JOIN "departments" dep
  ON dep."id" = t."department_id"
JOIN "_legacy_org_backfill_map" division_map
  ON division_map."entity_type" = 'DIVISION'
 AND division_map."legacy_id" = dep."division_id"
JOIN "_legacy_org_backfill_map" team_map
  ON team_map."entity_type" = 'TEAM'
 AND team_map."legacy_id" = t."id";


-- ============================================================
-- PRIMARY MEMBERSHIP HISTORY
-- ============================================================

INSERT INTO "org_memberships" (
  "id",
  "employee_id",
  "office_id",
  "org_unit_id",
  "membership_type",
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
  e."id",
  o."id",

  COALESCE(
    department_map."new_org_unit_id",
    division_map."new_org_unit_id"
  ),

  'PRIMARY'::"OrgMembershipType",
  'LEGACY_MIGRATION'::"OrgAssignmentSource",

  e."created_at",

  CASE
    WHEN
      e."status" = 'ACTIVE'
      AND e."employment_status" = 'ACTIVE'
      AND e."archived_at" IS NULL
    THEN NULL

    ELSE GREATEST(
      COALESCE(
        e."employment_ended_at",
        e."archived_at",
        e."updated_at",
        CURRENT_TIMESTAMP
      ),
      e."created_at" + INTERVAL '1 millisecond'
    )
  END,

  NULL,
  NULL,

  'Backfilled from legacy Division/Department placement.',

  CASE
    WHEN
      e."status" = 'ACTIVE'
      AND e."employment_status" = 'ACTIVE'
      AND e."archived_at" IS NULL
    THEN NULL
    ELSE LEFT(
      COALESCE(
        NULLIF(BTRIM(e."employment_end_reason"), ''),
        'Legacy employee placement ended before hierarchy migration.'
      ),
      500
    )
  END,

  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP

FROM "employees" e
JOIN "offices" o
  ON o."code" = 'PATAN'
JOIN "_legacy_org_backfill_map" division_map
  ON division_map."entity_type" = 'DIVISION'
 AND division_map."legacy_id" = e."division_id"
LEFT JOIN "_legacy_org_backfill_map" department_map
  ON department_map."entity_type" = 'DEPARTMENT'
 AND department_map."legacy_id" = e."department_id";


-- ============================================================
-- LEGACY TEAM MEMBERSHIP -> SECONDARY MEMBERSHIP
-- ============================================================

INSERT INTO "org_memberships" (
  "id",
  "employee_id",
  "office_id",
  "org_unit_id",
  "membership_type",
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
  tm."employee_id",
  o."id",
  team_map."new_org_unit_id",
  'SECONDARY'::"OrgMembershipType",
  'LEGACY_MIGRATION'::"OrgAssignmentSource",

  tm."created_at",

  CASE
    WHEN
      t."is_active" = true
      AND t."archived_at" IS NULL
      AND e."status" = 'ACTIVE'
      AND e."employment_status" = 'ACTIVE'
      AND e."archived_at" IS NULL
    THEN NULL

    ELSE GREATEST(
      COALESCE(
        t."archived_at",
        e."employment_ended_at",
        e."archived_at",
        t."updated_at",
        e."updated_at",
        CURRENT_TIMESTAMP
      ),
      tm."created_at" + INTERVAL '1 millisecond'
    )
  END,

  NULL,
  NULL,

  'Backfilled from legacy Team membership.',

  CASE
    WHEN
      t."is_active" = true
      AND t."archived_at" IS NULL
      AND e."status" = 'ACTIVE'
      AND e."employment_status" = 'ACTIVE'
      AND e."archived_at" IS NULL
    THEN NULL
    ELSE 'Legacy Team membership was inactive at hierarchy migration.'
  END,

  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP

FROM "department_team_members" tm
JOIN "department_teams" t
  ON t."id" = tm."team_id"
JOIN "employees" e
  ON e."id" = tm."employee_id"
JOIN "_legacy_org_backfill_map" team_map
  ON team_map."entity_type" = 'TEAM'
 AND team_map."legacy_id" = tm."team_id"
JOIN "offices" o
  ON o."code" = 'PATAN';


-- ============================================================
-- MANAGEMENT ASSIGNMENT HISTORY -> ORG UNIT HEAD HISTORY
-- ============================================================

INSERT INTO "org_leadership_assignments" (
  "id",
  "employee_id",
  "office_id",
  "org_unit_id",
  "leadership_type",
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
  ma."employee_id",
  o."id",

  CASE
    WHEN mp."position_type" = 'SENIOR_MANAGEMENT'
      THEN division_map."new_org_unit_id"
    WHEN mp."position_type" = 'TEAM_MANAGER'
      THEN department_map."new_org_unit_id"
  END,

  'ORG_UNIT_HEAD'::"OrgLeadershipType",
  'LEGACY_MIGRATION'::"OrgAssignmentSource",
  false,

  ma."started_at",

  CASE
    WHEN ma."ended_at" IS NULL
      THEN NULL
    ELSE GREATEST(
      ma."ended_at",
      ma."started_at" + INTERVAL '1 millisecond'
    )
  END,

  NULL,
  NULL,

  LEFT(
    COALESCE(
      NULLIF(BTRIM(ma."assignment_reason"), ''),
      'Backfilled from legacy management assignment.'
    ),
    500
  ),

  CASE
    WHEN ma."ended_at" IS NULL
      THEN NULL
    ELSE LEFT(
      COALESCE(
        NULLIF(BTRIM(ma."end_reason"), ''),
        'Legacy management assignment ended.'
      ),
      500
    )
  END,

  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP

FROM "management_assignments" ma
JOIN "management_positions" mp
  ON mp."id" = ma."position_id"
JOIN "offices" o
  ON o."code" = 'PATAN'
JOIN "_legacy_org_backfill_map" division_map
  ON division_map."entity_type" = 'DIVISION'
 AND division_map."legacy_id" = mp."division_id"
LEFT JOIN "_legacy_org_backfill_map" department_map
  ON department_map."entity_type" = 'DEPARTMENT'
 AND department_map."legacy_id" = mp."department_id"
WHERE mp."position_type" IN (
  'SENIOR_MANAGEMENT',
  'TEAM_MANAGER'
);


-- ============================================================
-- LEGACY TEAM ADMIN -> TEAM LEAD
-- ============================================================

INSERT INTO "org_leadership_assignments" (
  "id",
  "employee_id",
  "office_id",
  "org_unit_id",
  "leadership_type",
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
  t."team_admin_employee_id",
  o."id",
  team_map."new_org_unit_id",
  'TEAM_LEAD'::"OrgLeadershipType",
  'LEGACY_MIGRATION'::"OrgAssignmentSource",
  false,

  t."created_at",

  CASE
    WHEN
      t."is_active" = true
      AND t."archived_at" IS NULL
    THEN NULL
    ELSE GREATEST(
      COALESCE(
        t."archived_at",
        t."updated_at",
        CURRENT_TIMESTAMP
      ),
      t."created_at" + INTERVAL '1 millisecond'
    )
  END,

  NULL,
  NULL,

  'Backfilled from legacy Team Admin assignment.',

  CASE
    WHEN
      t."is_active" = true
      AND t."archived_at" IS NULL
    THEN NULL
    ELSE 'Legacy Team Admin assignment ended before hierarchy migration.'
  END,

  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP

FROM "department_teams" t
JOIN "_legacy_org_backfill_map" team_map
  ON team_map."entity_type" = 'TEAM'
 AND team_map."legacy_id" = t."id"
JOIN "offices" o
  ON o."code" = 'PATAN';


-- ============================================================
-- POST-BACKFILL RECONCILIATION ASSERTIONS
-- ============================================================

DO $$
DECLARE
  expected_org_units INTEGER;
  actual_org_units INTEGER;

  expected_closure INTEGER;
  actual_closure INTEGER;

  expected_primary INTEGER;
  actual_primary INTEGER;

  expected_open_primary INTEGER;
  actual_open_primary INTEGER;

  expected_secondary INTEGER;
  actual_secondary INTEGER;

  expected_leadership INTEGER;
  actual_leadership INTEGER;

  expected_open_leadership INTEGER;
  actual_open_leadership INTEGER;

  expected_mapping INTEGER;
  actual_mapping INTEGER;
BEGIN

  SELECT
    (
      (SELECT COUNT(*) FROM "divisions")
      +
      (SELECT COUNT(*) FROM "departments")
      +
      (SELECT COUNT(*) FROM "department_teams")
    )
  INTO expected_org_units;

  SELECT COUNT(*)
  INTO actual_org_units
  FROM "org_units";

  IF actual_org_units <> expected_org_units THEN
    RAISE EXCEPTION
      'OrgUnit reconciliation failed. Expected %, got %.',
      expected_org_units,
      actual_org_units;
  END IF;


  SELECT
    (
      (SELECT COUNT(*) FROM "divisions")
      +
      2 * (SELECT COUNT(*) FROM "departments")
      +
      3 * (SELECT COUNT(*) FROM "department_teams")
    )
  INTO expected_closure;

  SELECT COUNT(*)
  INTO actual_closure
  FROM "org_unit_closure";

  IF actual_closure <> expected_closure THEN
    RAISE EXCEPTION
      'Closure reconciliation failed. Expected %, got %.',
      expected_closure,
      actual_closure;
  END IF;


  SELECT COUNT(*)
  INTO expected_mapping
  FROM (
    SELECT "id" FROM "divisions"
    UNION ALL
    SELECT "id" FROM "departments"
    UNION ALL
    SELECT "id" FROM "department_teams"
  ) x;

  SELECT COUNT(*)
  INTO actual_mapping
  FROM "legacy_org_unit_mappings";

  IF actual_mapping <> expected_mapping THEN
    RAISE EXCEPTION
      'Legacy mapping reconciliation failed. Expected %, got %.',
      expected_mapping,
      actual_mapping;
  END IF;


  SELECT COUNT(*)
  INTO expected_primary
  FROM "employees"
  WHERE "division_id" IS NOT NULL;

  SELECT COUNT(*)
  INTO actual_primary
  FROM "org_memberships"
  WHERE "membership_type" = 'PRIMARY';

  IF actual_primary <> expected_primary THEN
    RAISE EXCEPTION
      'Primary membership reconciliation failed. Expected %, got %.',
      expected_primary,
      actual_primary;
  END IF;


  SELECT COUNT(*)
  INTO expected_open_primary
  FROM "employees"
  WHERE
    "division_id" IS NOT NULL
    AND "status" = 'ACTIVE'
    AND "employment_status" = 'ACTIVE'
    AND "archived_at" IS NULL;

  SELECT COUNT(*)
  INTO actual_open_primary
  FROM "org_memberships"
  WHERE
    "membership_type" = 'PRIMARY'
    AND "ends_at" IS NULL;

  IF actual_open_primary <> expected_open_primary THEN
    RAISE EXCEPTION
      'Open primary membership reconciliation failed. Expected %, got %.',
      expected_open_primary,
      actual_open_primary;
  END IF;


  SELECT COUNT(*)
  INTO expected_secondary
  FROM "department_team_members";

  SELECT COUNT(*)
  INTO actual_secondary
  FROM "org_memberships"
  WHERE "membership_type" = 'SECONDARY';

  IF actual_secondary <> expected_secondary THEN
    RAISE EXCEPTION
      'Secondary membership reconciliation failed. Expected %, got %.',
      expected_secondary,
      actual_secondary;
  END IF;


  SELECT
    (
      (SELECT COUNT(*) FROM "management_assignments")
      +
      (SELECT COUNT(*) FROM "department_teams")
    )
  INTO expected_leadership;

  SELECT COUNT(*)
  INTO actual_leadership
  FROM "org_leadership_assignments";

  IF actual_leadership <> expected_leadership THEN
    RAISE EXCEPTION
      'Leadership reconciliation failed. Expected %, got %.',
      expected_leadership,
      actual_leadership;
  END IF;


  SELECT
    (
      (
        SELECT COUNT(*)
        FROM "management_assignments"
        WHERE "ended_at" IS NULL
      )
      +
      (
        SELECT COUNT(*)
        FROM "department_teams"
        WHERE
          "is_active" = true
          AND "archived_at" IS NULL
      )
    )
  INTO expected_open_leadership;

  SELECT COUNT(*)
  INTO actual_open_leadership
  FROM "org_leadership_assignments"
  WHERE "effective_until" IS NULL;

  IF actual_open_leadership <> expected_open_leadership THEN
    RAISE EXCEPTION
      'Open leadership reconciliation failed. Expected %, got %.',
      expected_open_leadership,
      actual_open_leadership;
  END IF;


  IF (
    SELECT COUNT(*)
    FROM "offices"
    WHERE "code" = 'PATAN'
  ) <> 1 THEN
    RAISE EXCEPTION
      'Patan Office reconciliation failed.';
  END IF;


  IF (
    SELECT COUNT(*)
    FROM "org_unit_types"
    WHERE "office_id" = (
      SELECT "id"
      FROM "offices"
      WHERE "code" = 'PATAN'
    )
  ) <> 7 THEN
    RAISE EXCEPTION
      'OrgUnit type seed reconciliation failed.';
  END IF;


  -- Office Head is deliberately not inferred from a legacy role.
  IF EXISTS (
    SELECT 1
    FROM "org_leadership_assignments"
    WHERE "leadership_type" = 'OFFICE_HEAD'
  ) THEN
    RAISE EXCEPTION
      'Office Head must not be guessed during legacy backfill.';
  END IF;

END
$$;

COMMIT;
