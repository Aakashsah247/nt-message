-- Finalize the formal Office hierarchy as:
-- Office -> Division -> Department -> Section -> Unit.
-- Operational Teams remain separate in the operational_teams model.
-- Existing data is preserved: generic legacy/reset types are deactivated, not deleted.

-- Ensure the four formal types exist and are active for every Office.
INSERT INTO "org_unit_types" (
  "id", "office_id", "code", "name", "name_key", "is_team", "is_active",
  "sort_order", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  office."id",
  type_seed.code,
  type_seed.name,
  type_seed.name_key,
  false,
  true,
  type_seed.sort_order,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "offices" office
CROSS JOIN (
  VALUES
    ('DIVISION', 'Division', 'division', 10),
    ('DEPARTMENT', 'Department', 'department', 20),
    ('SECTION', 'Section', 'section', 30),
    ('UNIT', 'Unit', 'unit', 40)
) AS type_seed(code, name, name_key, sort_order)
ON CONFLICT ("office_id", "code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "name_key" = EXCLUDED."name_key",
  "is_team" = false,
  "is_active" = true,
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = CURRENT_TIMESTAMP;

-- Placement Pending needs an OrgUnitType for referential integrity, but that type
-- is internal and must never appear as a selectable hierarchy type.
INSERT INTO "org_unit_types" (
  "id", "office_id", "code", "name", "name_key", "is_team", "is_active",
  "sort_order", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(),
  office."id",
  'PLACEMENT_PENDING',
  'Placement Pending',
  'placement-pending-internal',
  false,
  false,
  9999,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "offices" office
ON CONFLICT ("office_id", "code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "name_key" = EXCLUDED."name_key",
  "is_team" = false,
  "is_active" = false,
  "sort_order" = EXCLUDED."sort_order",
  "updated_at" = CURRENT_TIMESTAMP;

-- Move the temporary Placement Pending OrgUnit away from the old generic OTHER
-- type before the generic types are retired from new hierarchy creation.
UPDATE "org_units" unit
SET
  "org_unit_type_id" = placement_type."id",
  "updated_at" = CURRENT_TIMESTAMP
FROM "org_unit_types" placement_type
WHERE unit."office_id" = placement_type."office_id"
  AND placement_type."code" = 'PLACEMENT_PENDING'
  AND unit."code" = 'UNASSIGNED'
  AND unit."name_key" = 'placement pending';

-- Phase 15 temporarily represented top-level Divisions as generic Organization
-- units. Convert only root-level generic Organization rows; nested rows are left
-- untouched rather than guessed.
UPDATE "org_units" unit
SET
  "org_unit_type_id" = division_type."id",
  "updated_at" = CURRENT_TIMESTAMP
FROM "org_unit_types" current_type, "org_unit_types" division_type
WHERE unit."org_unit_type_id" = current_type."id"
  AND current_type."office_id" = unit."office_id"
  AND current_type."code" = 'ORGANIZATION'
  AND unit."parent_org_unit_id" IS NULL
  AND division_type."office_id" = unit."office_id"
  AND division_type."code" = 'DIVISION';

-- Generic/reset-era types remain in history when referenced, but they are no
-- longer offered for new formal hierarchy creation.
UPDATE "org_unit_types"
SET
  "is_active" = false,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "code" IN ('ORGANIZATION', 'AREA', 'OTHER', 'SUB_UNIT')
  AND "is_active" = true;
