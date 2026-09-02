-- Enforce the locked V3 invariant that every non-root OrgUnit parent
-- belongs to the same Office as the child.
--
-- The organization service already validates this rule. This migration
-- adds a database-level guard so direct SQL/Prisma writes cannot bypass
-- the Office boundary.

-- Refuse to install the guard over already-invalid hierarchy data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "org_units" AS child
    JOIN "org_units" AS parent
      ON parent."id" = child."parent_org_unit_id"
    WHERE child."office_id" <> parent."office_id"
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce OrgUnit parent Office integrity: cross-Office parent links already exist.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "enforce_org_unit_parent_same_office"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_office_id UUID;
BEGIN
  -- For a non-root unit, compare the parent Office directly. If the
  -- parent does not exist, the existing foreign key remains responsible
  -- for reporting that violation.
  IF NEW."parent_org_unit_id" IS NOT NULL THEN
    SELECT parent."office_id"
      INTO parent_office_id
    FROM "org_units" AS parent
    WHERE parent."id" = NEW."parent_org_unit_id";

    IF FOUND AND parent_office_id <> NEW."office_id" THEN
      RAISE EXCEPTION
        'OrgUnit parent must belong to the same Office.'
        USING
          ERRCODE = '23514',
          CONSTRAINT = 'org_units_parent_same_office_check';
    END IF;
  END IF;

  -- Prevent changing a parent's Office while it still has children in
  -- the previous Office. Normal V3 hierarchy APIs never change officeId,
  -- but the database must remain safe from direct writes too.
  IF TG_OP = 'UPDATE'
     AND NEW."office_id" IS DISTINCT FROM OLD."office_id"
     AND EXISTS (
       SELECT 1
       FROM "org_units" AS child
       WHERE child."parent_org_unit_id" = NEW."id"
         AND child."office_id" <> NEW."office_id"
     ) THEN
    RAISE EXCEPTION
      'OrgUnit Office cannot change while child units belong to another Office.'
      USING
        ERRCODE = '23514',
        CONSTRAINT = 'org_units_parent_same_office_check';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "org_units_parent_same_office_trigger"
ON "org_units";

CREATE TRIGGER "org_units_parent_same_office_trigger"
BEFORE INSERT OR UPDATE OF "office_id", "parent_org_unit_id"
ON "org_units"
FOR EACH ROW
EXECUTE FUNCTION "enforce_org_unit_parent_same_office"();
