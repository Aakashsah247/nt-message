-- TS-A: Operational Team foundation.
-- Teams are operational field-work groupings attached to a formal OrgUnit.
-- They are intentionally not OrgUnits and do not participate in OrgUnitClosure.
-- Legacy DepartmentTeam / TEAM OrgUnit history remains untouched for compatibility.

CREATE TABLE "operational_teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_unit_id" UUID NOT NULL,
    "legacy_department_team_id" UUID,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "name_key" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMPTZ(3),
    "created_by_account_id" UUID,
    "updated_by_account_id" UUID,
    "archived_by_account_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "operational_teams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "operational_team_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "team_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "assignment_source" "OrgAssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(3),
    "assigned_by_account_id" UUID,
    "ended_by_account_id" UUID,
    "assignment_reason" VARCHAR(500),
    "end_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "operational_team_members_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operational_team_members_valid_period_check"
      CHECK ("ends_at" IS NULL OR "ends_at" > "starts_at")
);

CREATE TABLE "operational_team_lead_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "team_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "assignment_source" "OrgAssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "is_acting" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMPTZ(3),
    "assigned_by_account_id" UUID,
    "ended_by_account_id" UUID,
    "assignment_reason" VARCHAR(500),
    "end_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "operational_team_lead_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "operational_team_leads_valid_period_check"
      CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from")
);

CREATE UNIQUE INDEX "operational_teams_legacy_department_team_key"
ON "operational_teams"("legacy_department_team_id");

CREATE UNIQUE INDEX "operational_teams_org_unit_code_key"
ON "operational_teams"("org_unit_id", "code");

CREATE UNIQUE INDEX "operational_teams_org_unit_name_key"
ON "operational_teams"("org_unit_id", "name_key");

CREATE INDEX "operational_teams_org_unit_active_sort_idx"
ON "operational_teams"("org_unit_id", "is_active", "sort_order");

CREATE INDEX "operational_teams_archived_at_idx"
ON "operational_teams"("archived_at");

CREATE INDEX "operational_teams_created_by_created_idx"
ON "operational_teams"("created_by_account_id", "created_at");

CREATE INDEX "operational_teams_updated_by_updated_idx"
ON "operational_teams"("updated_by_account_id", "updated_at");

CREATE INDEX "operational_teams_archived_by_archived_idx"
ON "operational_teams"("archived_by_account_id", "archived_at");

CREATE UNIQUE INDEX "operational_team_members_one_active_membership_key"
ON "operational_team_members"("team_id", "employee_id")
WHERE "ends_at" IS NULL;

CREATE INDEX "operational_team_members_team_ends_idx"
ON "operational_team_members"("team_id", "ends_at");

CREATE INDEX "operational_team_members_employee_ends_idx"
ON "operational_team_members"("employee_id", "ends_at");

CREATE INDEX "operational_team_members_assigned_by_created_idx"
ON "operational_team_members"("assigned_by_account_id", "created_at");

CREATE INDEX "operational_team_members_ended_by_ended_idx"
ON "operational_team_members"("ended_by_account_id", "ends_at");

CREATE INDEX "operational_team_members_period_idx"
ON "operational_team_members"("starts_at", "ends_at");

CREATE UNIQUE INDEX "operational_team_leads_one_active_employee_key"
ON "operational_team_lead_assignments"("team_id", "employee_id")
WHERE "effective_until" IS NULL;

CREATE INDEX "operational_team_leads_team_effective_idx"
ON "operational_team_lead_assignments"("team_id", "effective_until", "is_acting");

CREATE INDEX "operational_team_leads_employee_effective_idx"
ON "operational_team_lead_assignments"("employee_id", "effective_until");

CREATE INDEX "operational_team_leads_assigned_by_created_idx"
ON "operational_team_lead_assignments"("assigned_by_account_id", "created_at");

CREATE INDEX "operational_team_leads_ended_by_ended_idx"
ON "operational_team_lead_assignments"("ended_by_account_id", "effective_until");

CREATE INDEX "operational_team_leads_period_idx"
ON "operational_team_lead_assignments"("effective_from", "effective_until");

ALTER TABLE "operational_teams"
ADD CONSTRAINT "operational_teams_org_unit_id_fkey"
FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_teams"
ADD CONSTRAINT "operational_teams_legacy_department_team_id_fkey"
FOREIGN KEY ("legacy_department_team_id") REFERENCES "department_teams"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_teams"
ADD CONSTRAINT "operational_teams_created_by_account_id_fkey"
FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_teams"
ADD CONSTRAINT "operational_teams_updated_by_account_id_fkey"
FOREIGN KEY ("updated_by_account_id") REFERENCES "accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_teams"
ADD CONSTRAINT "operational_teams_archived_by_account_id_fkey"
FOREIGN KEY ("archived_by_account_id") REFERENCES "accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_team_members"
ADD CONSTRAINT "operational_team_members_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "operational_teams"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_team_members"
ADD CONSTRAINT "operational_team_members_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_team_members"
ADD CONSTRAINT "operational_team_members_assigned_by_account_id_fkey"
FOREIGN KEY ("assigned_by_account_id") REFERENCES "accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_team_members"
ADD CONSTRAINT "operational_team_members_ended_by_account_id_fkey"
FOREIGN KEY ("ended_by_account_id") REFERENCES "accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_team_lead_assignments"
ADD CONSTRAINT "operational_team_lead_assignments_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "operational_teams"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_team_lead_assignments"
ADD CONSTRAINT "operational_team_lead_assignments_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_team_lead_assignments"
ADD CONSTRAINT "operational_team_lead_assignments_assigned_by_account_id_fkey"
FOREIGN KEY ("assigned_by_account_id") REFERENCES "accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "operational_team_lead_assignments"
ADD CONSTRAINT "operational_team_lead_assignments_ended_by_account_id_fkey"
FOREIGN KEY ("ended_by_account_id") REFERENCES "accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
