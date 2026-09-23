BEGIN;

-- Repair the known malformed NTC-008 development record, canonicalize valid
-- legacy employee phone values, and prevent malformed employee phones from
-- being stored again outside the application validation boundary.
--
-- Historical employees retain their last known phone for audit/history. Phone
-- uniqueness applies only to current ACTIVE employment because a Nepal mobile
-- number can legitimately be reassigned after an employee leaves the Office.
--
-- NT Message accepts 9XXXXXXXXX, 9779XXXXXXXXX, and +9779XXXXXXXXX at the API
-- boundary, but Employee.phone_number is stored canonically as +9779XXXXXXXXX.

DROP INDEX IF EXISTS "employees_phone_number_key";

DO $$
DECLARE
  duplicate_canonical_phone TEXT;
  invalid_employee_phones TEXT;
BEGIN
  -- A historical database could contain the same real phone in different
  -- textual forms because the old database constraint enforced only exact
  -- string uniqueness. Only current ACTIVE employment must remain unique; a
  -- resigned/retired/transferred/terminated historical record may retain the
  -- phone it held at that time.
  WITH normalized AS (
    SELECT
      "emp_id",
      "employment_status",
      CASE
        WHEN "phone_number" ~ '^9[0-9]{9}$'
          THEN '+977' || "phone_number"
        WHEN "phone_number" ~ '^9779[0-9]{9}$'
          THEN '+' || "phone_number"
        WHEN "phone_number" ~ '^\+9779[0-9]{9}$'
          THEN "phone_number"
        ELSE NULL
      END AS canonical_phone
    FROM "employees"
  )
  SELECT canonical_phone
  INTO duplicate_canonical_phone
  FROM normalized
  WHERE canonical_phone IS NOT NULL
    AND "employment_status" = 'ACTIVE'
  GROUP BY canonical_phone
  HAVING COUNT(*) > 1
  LIMIT 1;

  IF duplicate_canonical_phone IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot canonicalize employee phones: % is assigned to more than one employee with ACTIVE employment.',
      duplicate_canonical_phone;
  END IF;

  UPDATE "employees"
  SET
    "phone_number" = CASE
      WHEN "phone_number" ~ '^9[0-9]{9}$'
        THEN '+977' || "phone_number"
      WHEN "phone_number" ~ '^9779[0-9]{9}$'
        THEN '+' || "phone_number"
      ELSE "phone_number"
    END,
    "updated_at" = NOW()
  WHERE
    "phone_number" ~ '^9[0-9]{9}$'
    OR "phone_number" ~ '^9779[0-9]{9}$';

  -- NTC-008 is the malformed legacy row identified during the V3 Directory
  -- correction audit. The Super Admin attempted all three approved forms of
  -- 9817879609; store the canonical form directly so the database is repaired.
  IF EXISTS (
    SELECT 1
    FROM "employees"
    WHERE "emp_id" = 'NTC-008'
      AND "phone_number" !~ '^\+9779[0-9]{9}$'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM "employees"
      WHERE "emp_id" <> 'NTC-008'
        AND "employment_status" = 'ACTIVE'
        AND "phone_number" = '+9779817879609'
    ) THEN
      RAISE EXCEPTION
        'Cannot repair NTC-008 phone: +9779817879609 is already assigned to another employee.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "super_admin_profiles"
      WHERE "phone_number" IN (
        '+9779817879609',
        '9817879609',
        '9779817879609'
      )
    ) THEN
      RAISE EXCEPTION
        'Cannot repair NTC-008 phone: the number is already assigned to the Super Admin profile.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM "account_requests" ar
      LEFT JOIN "employees" target_employee
        ON target_employee."emp_id" = 'NTC-008'
      WHERE ar."phone_number" IN (
        '+9779817879609',
        '9817879609',
        '9779817879609'
      )
        AND ar."status" <> 'REJECTED'
        AND (
          ar."employee_id" IS NULL
          OR ar."employee_id" <> target_employee."id"
        )
    ) THEN
      RAISE EXCEPTION
        'Cannot repair NTC-008 phone: an active account request already uses this number.';
    END IF;

    UPDATE "employees"
    SET
      "phone_number" = '+9779817879609',
      "updated_at" = NOW()
    WHERE "emp_id" = 'NTC-008';
  END IF;

  SELECT STRING_AGG("emp_id" || '=' || "phone_number", ', ' ORDER BY "emp_id")
  INTO invalid_employee_phones
  FROM "employees"
  WHERE "phone_number" !~ '^\+9779[0-9]{9}$';

  IF invalid_employee_phones IS NOT NULL THEN
    RAISE EXCEPTION
      'Employee phone integrity migration found additional malformed rows that require an explicit correction: %',
      invalid_employee_phones;
  END IF;
END $$;

ALTER TABLE "employees"
ADD CONSTRAINT "employees_phone_number_nepal_e164_check"
CHECK ("phone_number" ~ '^\+9779[0-9]{9}$');

CREATE UNIQUE INDEX "employees_active_phone_number_key"
ON "employees"("phone_number")
WHERE "employment_status" = 'ACTIVE';

COMMIT;
