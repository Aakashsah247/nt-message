-- Team assignment keeps a durable work-to-team reference while the existing
-- account assignments preserve the individual responsibility snapshot.
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'TEAM_ASSIGNED';
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'SALES_MEMBER_ASSIGNED';
ALTER TYPE "DepartmentTeamActivityAction" ADD VALUE IF NOT EXISTS 'TEAM_ARCHIVED';

ALTER TABLE "department_teams"
  ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "archived_at" TIMESTAMPTZ(3),
  ADD COLUMN "archived_by_account_id" UUID;

ALTER TABLE "work_items"
  ADD COLUMN "assigned_team_id" UUID,
  ADD COLUMN "sales_member_account_id" UUID;

ALTER TABLE "department_teams"
  ADD CONSTRAINT "department_teams_archived_by_account_id_fkey"
  FOREIGN KEY ("archived_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_items"
  ADD CONSTRAINT "work_items_assigned_team_id_fkey"
  FOREIGN KEY ("assigned_team_id") REFERENCES "department_teams"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_items"
  ADD CONSTRAINT "work_items_sales_member_account_id_fkey"
  FOREIGN KEY ("sales_member_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX IF EXISTS "department_teams_department_name_idx";
CREATE INDEX "department_teams_department_active_name_idx"
  ON "department_teams"("department_id", "is_active", "name");
CREATE INDEX "department_teams_archived_at_idx"
  ON "department_teams"("archived_at");
CREATE INDEX "work_items_team_status_due_idx"
  ON "work_items"("assigned_team_id", "status", "due_at");
CREATE INDEX "work_items_sales_member_status_due_idx"
  ON "work_items"("sales_member_account_id", "status", "due_at");
