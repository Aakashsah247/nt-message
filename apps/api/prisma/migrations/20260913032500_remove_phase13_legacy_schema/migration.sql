-- Phase 13 / Checkpoint 20: destructive legacy schema cleanup.
-- Checkpoint 18 already reconciled all data required by the V3 runtime.
-- This migration deliberately removes only retired compatibility structures.

BEGIN;

-- Normalize the two legacy AccountRole hierarchy values before rebuilding the enum.
UPDATE "accounts"
SET "role" = 'EMPLOYEE'::"AccountRole"
WHERE "role" IN ('SENIOR_MANAGEMENT'::"AccountRole", 'TEAM_MANAGER'::"AccountRole");

UPDATE "account_requests"
SET "requested_role" = 'EMPLOYEE'::"AccountRole"
WHERE "requested_role" IN ('SENIOR_MANAGEMENT'::"AccountRole", 'TEAM_MANAGER'::"AccountRole");

-- Normalize retired message-request reasons.
UPDATE "message_requests"
SET "reason" = 'OUTSIDE_ORG_SCOPE'::"MessageRequestReason"
WHERE "reason" IN ('CROSS_DEPARTMENT'::"MessageRequestReason", 'CROSS_DIVISION'::"MessageRequestReason");

-- Drop retired foreign-key columns/bridges before dropping the legacy tables.
ALTER TABLE "employees"
  DROP COLUMN IF EXISTS "division_id",
  DROP COLUMN IF EXISTS "department_id";

ALTER TABLE "operational_teams"
  DROP COLUMN IF EXISTS "legacy_department_team_id";

ALTER TABLE "account_requests"
  DROP COLUMN IF EXISTS "division_id",
  DROP COLUMN IF EXISTS "department_id",
  DROP COLUMN IF EXISTS "management_position_id";

ALTER TABLE "conversations"
  DROP COLUMN IF EXISTS "official_division_id",
  DROP COLUMN IF EXISTS "official_department_id";

ALTER TABLE "announcements"
  DROP COLUMN IF EXISTS "division_id",
  DROP COLUMN IF EXISTS "department_id";

ALTER TABLE "work_type_definitions"
  DROP COLUMN IF EXISTS "legacy_work_item_type";

ALTER TABLE "work_items"
  DROP COLUMN IF EXISTS "type",
  DROP COLUMN IF EXISTS "division_id",
  DROP COLUMN IF EXISTS "department_id",
  DROP COLUMN IF EXISTS "assigned_team_id",
  DROP COLUMN IF EXISTS "responsible_manager_account_id";

ALTER TABLE "work_help_requests"
  DROP COLUMN IF EXISTS "requested_department_id";

ALTER TABLE "duty_shift_templates"
  DROP COLUMN IF EXISTS "division_id",
  DROP COLUMN IF EXISTS "department_id";

ALTER TABLE "duty_schedule_series"
  DROP COLUMN IF EXISTS "division_id",
  DROP COLUMN IF EXISTS "department_id";

ALTER TABLE "duty_assignments"
  DROP COLUMN IF EXISTS "division_id",
  DROP COLUMN IF EXISTS "department_id";

ALTER TABLE "duty_coverage_requirements"
  DROP COLUMN IF EXISTS "department_id";

ALTER TABLE "duty_exceptions"
  DROP COLUMN IF EXISTS "division_id",
  DROP COLUMN IF EXISTS "department_id";

ALTER TABLE "duty_holidays"
  DROP COLUMN IF EXISTS "division_id",
  DROP COLUMN IF EXISTS "department_id";

-- Legacy mapping/history tables are no longer required after reconciliation.
DROP TABLE IF EXISTS "legacy_org_unit_mappings";
DROP TABLE IF EXISTS "management_assignments";
DROP TABLE IF EXISTS "management_positions";
DROP TABLE IF EXISTS "department_team_activities";
DROP TABLE IF EXISTS "department_team_members";
DROP TABLE IF EXISTS "department_teams";
DROP TABLE IF EXISTS "departments";
DROP TABLE IF EXISTS "divisions";

-- Rebuild AccountRole without hierarchy-authority values.
ALTER TYPE "AccountRole" RENAME TO "AccountRole_phase13_legacy";
CREATE TYPE "AccountRole" AS ENUM ('SUPER_ADMIN', 'EMPLOYEE');

ALTER TABLE "accounts"
  ALTER COLUMN "role" TYPE "AccountRole"
  USING ("role"::text::"AccountRole");

ALTER TABLE "account_requests"
  ALTER COLUMN "requested_role" TYPE "AccountRole"
  USING ("requested_role"::text::"AccountRole");

DROP TYPE "AccountRole_phase13_legacy";

-- Rebuild MessageRequestReason without fixed hierarchy scope values.
ALTER TYPE "MessageRequestReason" RENAME TO "MessageRequestReason_phase13_legacy";
CREATE TYPE "MessageRequestReason" AS ENUM ('PROTECTED_RECIPIENT', 'OUTSIDE_ORG_SCOPE');

ALTER TABLE "message_requests"
  ALTER COLUMN "reason" TYPE "MessageRequestReason"
  USING ("reason"::text::"MessageRequestReason");

DROP TYPE "MessageRequestReason_phase13_legacy";

-- Checkpoint 18 converted all historical official-group scopes to OFFICE/ORG_UNIT.
ALTER TYPE "OfficialGroupScopeType" RENAME TO "OfficialGroupScopeType_phase13_legacy";
CREATE TYPE "OfficialGroupScopeType" AS ENUM ('OFFICE', 'ORG_UNIT');

ALTER TABLE "conversations"
  ALTER COLUMN "official_scope_type" TYPE "OfficialGroupScopeType"
  USING ("official_scope_type"::text::"OfficialGroupScopeType");

DROP TYPE "OfficialGroupScopeType_phase13_legacy";

-- Checkpoint 18 converted historical announcement audiences to V3 values.
ALTER TYPE "AnnouncementAudienceType" RENAME TO "AnnouncementAudienceType_phase13_legacy";
CREATE TYPE "AnnouncementAudienceType" AS ENUM ('OFFICIAL_GROUP', 'OFFICE', 'ORG_UNIT');

ALTER TABLE "announcements"
  ALTER COLUMN "audience_type" TYPE "AnnouncementAudienceType"
  USING ("audience_type"::text::"AnnouncementAudienceType");

DROP TYPE "AnnouncementAudienceType_phase13_legacy";

-- Enums used only by the dropped legacy models/columns.
DROP TYPE IF EXISTS "ManagementPositionType";
DROP TYPE IF EXISTS "DepartmentWorkFunction";
DROP TYPE IF EXISTS "DepartmentTeamActivityAction";
DROP TYPE IF EXISTS "WorkItemType";

COMMIT;
