-- CreateEnum
CREATE TYPE "DepartmentTeamActivityAction" AS ENUM (
  'TEAM_CREATED',
  'TEAM_RENAMED',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'ADMIN_CHANGED',
  'TEAM_DELETED'
);

-- CreateTable
CREATE TABLE "department_teams" (
  "id" UUID NOT NULL,
  "department_id" UUID NOT NULL,
  "name" VARCHAR(120) NOT NULL,
  "name_key" VARCHAR(120) NOT NULL,
  "team_admin_employee_id" UUID NOT NULL,
  "created_by_account_id" UUID NOT NULL,
  "updated_by_account_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "department_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_team_members" (
  "id" UUID NOT NULL,
  "team_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "added_by_account_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "department_team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "department_team_activities" (
  "id" UUID NOT NULL,
  "team_id" UUID,
  "department_id" UUID NOT NULL,
  "actor_account_id" UUID NOT NULL,
  "action" "DepartmentTeamActivityAction" NOT NULL,
  "team_name" VARCHAR(120) NOT NULL,
  "details" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "department_team_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "department_teams_department_name_key"
  ON "department_teams"("department_id", "name_key");
CREATE INDEX "department_teams_department_name_idx"
  ON "department_teams"("department_id", "name");
CREATE INDEX "department_teams_admin_employee_idx"
  ON "department_teams"("team_admin_employee_id");
CREATE UNIQUE INDEX "department_team_members_team_employee_key"
  ON "department_team_members"("team_id", "employee_id");
CREATE INDEX "department_team_members_employee_idx"
  ON "department_team_members"("employee_id");
CREATE INDEX "department_team_activities_team_created_idx"
  ON "department_team_activities"("team_id", "created_at");
CREATE INDEX "department_team_activities_department_created_idx"
  ON "department_team_activities"("department_id", "created_at");
CREATE INDEX "department_team_activities_actor_created_idx"
  ON "department_team_activities"("actor_account_id", "created_at");

-- AddForeignKey
ALTER TABLE "department_teams"
  ADD CONSTRAINT "department_teams_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_teams"
  ADD CONSTRAINT "department_teams_team_admin_employee_id_fkey"
  FOREIGN KEY ("team_admin_employee_id") REFERENCES "employees"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_teams"
  ADD CONSTRAINT "department_teams_created_by_account_id_fkey"
  FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_teams"
  ADD CONSTRAINT "department_teams_updated_by_account_id_fkey"
  FOREIGN KEY ("updated_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_team_members"
  ADD CONSTRAINT "department_team_members_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "department_teams"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "department_team_members"
  ADD CONSTRAINT "department_team_members_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_team_members"
  ADD CONSTRAINT "department_team_members_added_by_account_id_fkey"
  FOREIGN KEY ("added_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_team_activities"
  ADD CONSTRAINT "department_team_activities_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "department_teams"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "department_team_activities"
  ADD CONSTRAINT "department_team_activities_department_id_fkey"
  FOREIGN KEY ("department_id") REFERENCES "departments"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "department_team_activities"
  ADD CONSTRAINT "department_team_activities_actor_account_id_fkey"
  FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
