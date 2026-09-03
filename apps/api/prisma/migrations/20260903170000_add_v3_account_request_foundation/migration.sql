-- Phase 4B1: additive V3 account-request foundation.
-- Legacy Division/Department fields remain during compatibility migration.

CREATE TYPE "AccountRequestLifecycleState" AS ENUM (
  'REQUESTED',
  'UNDER_REVIEW',
  'RETURNED_FOR_CORRECTION',
  'REJECTED',
  'APPROVED',
  'PROVISIONED',
  'ACTIVE'
);

ALTER TYPE "AccountRequestActionType" ADD VALUE IF NOT EXISTS 'REVIEW_STARTED';
ALTER TYPE "AccountRequestActionType" ADD VALUE IF NOT EXISTS 'RETURNED_FOR_CORRECTION';
ALTER TYPE "AccountRequestActionType" ADD VALUE IF NOT EXISTS 'PROVISIONED';

ALTER TABLE "account_requests"
  ADD COLUMN "lifecycle_state" "AccountRequestLifecycleState",
  ADD COLUMN "office_id" UUID,
  ADD COLUMN "intended_org_unit_id" UUID;

-- Preserve the exact legacy status column while projecting historical rows into
-- the new Phase 4 lifecycle. Later Phase 4 writes switch to the lifecycle state.
UPDATE "account_requests"
SET "lifecycle_state" = CASE "status"::text
  WHEN 'DRAFT' THEN 'REQUESTED'::"AccountRequestLifecycleState"
  WHEN 'PENDING_APPROVAL' THEN 'REQUESTED'::"AccountRequestLifecycleState"
  WHEN 'APPROVED' THEN 'APPROVED'::"AccountRequestLifecycleState"
  WHEN 'REJECTED' THEN 'REJECTED'::"AccountRequestLifecycleState"
  WHEN 'ACTIVATION_PENDING' THEN 'PROVISIONED'::"AccountRequestLifecycleState"
  WHEN 'ACTIVATED' THEN 'ACTIVE'::"AccountRequestLifecycleState"
END;

ALTER TABLE "account_requests"
  ALTER COLUMN "lifecycle_state" SET DEFAULT 'REQUESTED',
  ALTER COLUMN "lifecycle_state" SET NOT NULL;

-- Backfill the intended V3 scope from the reconciliation map. Department wins
-- when present; Division is the fallback for legacy division-level requests.
UPDATE "account_requests" AS request
SET
  "office_id" = mapping."office_id",
  "intended_org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" AS mapping
WHERE request."department_id" = mapping."legacy_entity_id"
  AND mapping."legacy_entity_type" = 'DEPARTMENT';

UPDATE "account_requests" AS request
SET
  "office_id" = mapping."office_id",
  "intended_org_unit_id" = mapping."org_unit_id"
FROM "legacy_org_unit_mappings" AS mapping
WHERE request."office_id" IS NULL
  AND request."division_id" = mapping."legacy_entity_id"
  AND mapping."legacy_entity_type" = 'DIVISION';

ALTER TABLE "account_requests"
  ADD CONSTRAINT "account_requests_office_id_fkey"
    FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "account_requests_intended_org_unit_id_fkey"
    FOREIGN KEY ("intended_org_unit_id") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "account_requests_lifecycle_created_idx"
  ON "account_requests"("lifecycle_state", "created_at");

CREATE INDEX "account_requests_office_lifecycle_created_idx"
  ON "account_requests"("office_id", "lifecycle_state", "created_at");

CREATE INDEX "account_requests_intended_unit_lifecycle_idx"
  ON "account_requests"("intended_org_unit_id", "lifecycle_state");

-- DB-level same-Office protection for all V3-scoped rows. The fields stay
-- nullable only while legacy rows/consumers are being reconciled in Phase 4.
CREATE OR REPLACE FUNCTION enforce_account_request_intended_org_same_office()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_office_id UUID;
BEGIN
  IF NEW."office_id" IS NULL OR NEW."intended_org_unit_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT unit."office_id"
  INTO target_office_id
  FROM "org_units" AS unit
  WHERE unit."id" = NEW."intended_org_unit_id";

  IF target_office_id IS NULL THEN
    RAISE EXCEPTION 'Account request intended OrgUnit does not exist.';
  END IF;

  IF target_office_id <> NEW."office_id" THEN
    RAISE EXCEPTION 'Account request intended OrgUnit must belong to the same Office.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "account_requests_intended_org_same_office_trigger"
BEFORE INSERT OR UPDATE OF "office_id", "intended_org_unit_id"
ON "account_requests"
FOR EACH ROW
EXECUTE FUNCTION enforce_account_request_intended_org_same_office();
