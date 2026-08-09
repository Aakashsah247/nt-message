-- Department functions are stored explicitly so work assignment never relies on
-- employee designations or runtime text matching. Existing departments are
-- classified once during migration; unrecognized departments remain GENERAL.
CREATE TYPE "DepartmentWorkFunction" AS ENUM (
  'GENERAL',
  'FIELD_OPERATIONS',
  'SALES',
  'SUPPORT'
);

ALTER TABLE "departments"
  ADD COLUMN "work_function" "DepartmentWorkFunction" NOT NULL DEFAULT 'GENERAL';

UPDATE "departments"
SET "work_function" = 'SALES'
WHERE lower("code" || ' ' || "name") ~ '(^|[^a-z])(sales?|commercial)([^a-z]|$)';

UPDATE "departments"
SET "work_function" = 'SUPPORT'
WHERE "work_function" = 'GENERAL'
  AND lower("code" || ' ' || "name") ~ '(^|[^a-z])(support|help[ -]?desk)([^a-z]|$)';

UPDATE "departments"
SET "work_function" = 'FIELD_OPERATIONS'
WHERE "work_function" = 'GENERAL'
  AND lower("code" || ' ' || "name") ~ '(^|[^a-z])(field|installation|maintenance)([^a-z]|$)';

CREATE INDEX "departments_division_function_active_idx"
  ON "departments"("division_id", "work_function", "is_active");

-- registered_at is the customer/business registration time entered by the
-- creator. created_at remains the immutable system audit time. Existing rows
-- use created_at as the safest legacy approximation and are not rewritten later.
ALTER TABLE "work_items"
  ADD COLUMN "registered_at" TIMESTAMPTZ(3);

UPDATE "work_items"
SET "registered_at" = "created_at"
WHERE "registered_at" IS NULL;

ALTER TABLE "work_items"
  ALTER COLUMN "registered_at" SET NOT NULL;

CREATE INDEX "work_items_registered_at_idx"
  ON "work_items"("registered_at");
