-- CreateEnum
CREATE TYPE "OrgAssignmentSource" AS ENUM ('MANUAL', 'ACCOUNT_PROVISIONING', 'TRANSFER', 'TEMPORARY_ASSIGNMENT', 'LEGACY_MIGRATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "OrgMembershipType" AS ENUM ('PRIMARY', 'SECONDARY', 'TEMPORARY');

-- CreateEnum
CREATE TYPE "OrgLeadershipType" AS ENUM ('OFFICE_HEAD', 'ORG_UNIT_HEAD', 'TEAM_LEAD', 'DEPUTY');

-- CreateTable
CREATE TABLE "offices" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "name_key" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "offices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_unit_types" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_key" VARCHAR(100) NOT NULL,
    "is_team" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "org_unit_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_units" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "org_unit_type_id" UUID NOT NULL,
    "parent_org_unit_id" UUID,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "name_key" VARCHAR(150) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "org_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_unit_closure" (
    "ancestor_org_unit_id" UUID NOT NULL,
    "descendant_org_unit_id" UUID NOT NULL,
    "depth" INTEGER NOT NULL,

    CONSTRAINT "org_unit_closure_pkey" PRIMARY KEY ("ancestor_org_unit_id","descendant_org_unit_id")
);

-- CreateTable
CREATE TABLE "org_memberships" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "org_unit_id" UUID,
    "membership_type" "OrgMembershipType" NOT NULL,
    "assignment_source" "OrgAssignmentSource" NOT NULL DEFAULT 'MANUAL',
    "starts_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ(3),
    "assigned_by_account_id" UUID,
    "ended_by_account_id" UUID,
    "assignment_reason" VARCHAR(500),
    "end_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "org_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_leadership_assignments" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "org_unit_id" UUID,
    "leadership_type" "OrgLeadershipType" NOT NULL,
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

    CONSTRAINT "org_leadership_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offices_code_key" ON "offices"("code");

-- CreateIndex
CREATE UNIQUE INDEX "offices_name_key_key" ON "offices"("name_key");

-- CreateIndex
CREATE INDEX "offices_active_sort_idx" ON "offices"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "org_unit_types_office_active_sort_idx" ON "org_unit_types"("office_id", "is_active", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "org_unit_types_office_code_key" ON "org_unit_types"("office_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "org_unit_types_office_name_key" ON "org_unit_types"("office_id", "name_key");

-- CreateIndex
CREATE INDEX "org_units_parent_active_sort_idx" ON "org_units"("office_id", "parent_org_unit_id", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "org_units_type_active_idx" ON "org_units"("org_unit_type_id", "is_active");

-- CreateIndex
CREATE INDEX "org_units_name_key_idx" ON "org_units"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "org_units_office_code_key" ON "org_units"("office_id", "code");

-- CreateIndex
CREATE INDEX "org_unit_closure_descendant_ancestor_idx" ON "org_unit_closure"("descendant_org_unit_id", "ancestor_org_unit_id");

-- CreateIndex
CREATE INDEX "org_unit_closure_ancestor_depth_idx" ON "org_unit_closure"("ancestor_org_unit_id", "depth");

-- CreateIndex
CREATE INDEX "org_memberships_employee_type_ends_idx" ON "org_memberships"("employee_id", "membership_type", "ends_at");

-- CreateIndex
CREATE INDEX "org_memberships_office_unit_ends_idx" ON "org_memberships"("office_id", "org_unit_id", "ends_at");

-- CreateIndex
CREATE INDEX "org_memberships_assigned_by_idx" ON "org_memberships"("assigned_by_account_id");

-- CreateIndex
CREATE INDEX "org_memberships_ended_by_idx" ON "org_memberships"("ended_by_account_id");

-- CreateIndex
CREATE INDEX "org_memberships_starts_at_idx" ON "org_memberships"("starts_at");

-- CreateIndex
CREATE INDEX "org_leadership_employee_effective_idx" ON "org_leadership_assignments"("employee_id", "effective_until");

-- CreateIndex
CREATE INDEX "org_leadership_scope_type_effective_idx" ON "org_leadership_assignments"("office_id", "org_unit_id", "leadership_type", "effective_until");

-- CreateIndex
CREATE INDEX "org_leadership_office_type_acting_idx" ON "org_leadership_assignments"("office_id", "leadership_type", "is_acting", "effective_until");

-- CreateIndex
CREATE INDEX "org_leadership_assigned_by_idx" ON "org_leadership_assignments"("assigned_by_account_id");

-- CreateIndex
CREATE INDEX "org_leadership_ended_by_idx" ON "org_leadership_assignments"("ended_by_account_id");

-- CreateIndex
CREATE INDEX "org_leadership_effective_period_idx" ON "org_leadership_assignments"("effective_from", "effective_until");

-- AddForeignKey
ALTER TABLE "org_unit_types" ADD CONSTRAINT "org_unit_types_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_org_unit_type_id_fkey" FOREIGN KEY ("org_unit_type_id") REFERENCES "org_unit_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_parent_org_unit_id_fkey" FOREIGN KEY ("parent_org_unit_id") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit_closure" ADD CONSTRAINT "org_unit_closure_ancestor_org_unit_id_fkey" FOREIGN KEY ("ancestor_org_unit_id") REFERENCES "org_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_unit_closure" ADD CONSTRAINT "org_unit_closure_descendant_org_unit_id_fkey" FOREIGN KEY ("descendant_org_unit_id") REFERENCES "org_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_assigned_by_account_id_fkey" FOREIGN KEY ("assigned_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_memberships" ADD CONSTRAINT "org_memberships_ended_by_account_id_fkey" FOREIGN KEY ("ended_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_leadership_assignments" ADD CONSTRAINT "org_leadership_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_leadership_assignments" ADD CONSTRAINT "org_leadership_assignments_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_leadership_assignments" ADD CONSTRAINT "org_leadership_assignments_org_unit_id_fkey" FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_leadership_assignments" ADD CONSTRAINT "org_leadership_assignments_assigned_by_account_id_fkey" FOREIGN KEY ("assigned_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_leadership_assignments" ADD CONSTRAINT "org_leadership_assignments_ended_by_account_id_fkey" FOREIGN KEY ("ended_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- NT MESSAGE HIERARCHY INTEGRITY CONSTRAINTS
--
-- These constraints protect structural rules that belong at database
-- level. Cross-table hierarchy rules such as same-office ownership and
-- cycle prevention are enforced transactionally by the organization
-- service.

-- Ordering values must remain valid.
ALTER TABLE "offices"
  ADD CONSTRAINT "offices_sort_order_nonnegative_check"
  CHECK ("sort_order" >= 0);

ALTER TABLE "org_unit_types"
  ADD CONSTRAINT "org_unit_types_sort_order_nonnegative_check"
  CHECK ("sort_order" >= 0);

ALTER TABLE "org_units"
  ADD CONSTRAINT "org_units_sort_order_nonnegative_check"
  CHECK ("sort_order" >= 0);

-- An organizational unit can never directly parent itself.
ALTER TABLE "org_units"
  ADD CONSTRAINT "org_units_parent_not_self_check"
  CHECK (
    "parent_org_unit_id" IS NULL
    OR "parent_org_unit_id" <> "id"
  );

-- Closure-table depth rules.
ALTER TABLE "org_unit_closure"
  ADD CONSTRAINT "org_unit_closure_depth_nonnegative_check"
  CHECK ("depth" >= 0);

ALTER TABLE "org_unit_closure"
  ADD CONSTRAINT "org_unit_closure_self_depth_check"
  CHECK (
    (
      "ancestor_org_unit_id" = "descendant_org_unit_id"
      AND "depth" = 0
    )
    OR
    (
      "ancestor_org_unit_id" <> "descendant_org_unit_id"
      AND "depth" > 0
    )
  );

-- Membership history must have a valid time range.
ALTER TABLE "org_memberships"
  ADD CONSTRAINT "org_memberships_period_check"
  CHECK (
    "ends_at" IS NULL
    OR "ends_at" > "starts_at"
  );

-- Normal organizational actions must have a real actor.
-- Only controlled migration/system operations may omit the actor.
ALTER TABLE "org_memberships"
  ADD CONSTRAINT "org_memberships_assignment_actor_check"
  CHECK (
    "assigned_by_account_id" IS NOT NULL
    OR "assignment_source" IN ('LEGACY_MIGRATION', 'SYSTEM')
  );

-- V1 allows only one open primary office placement per employee.
CREATE UNIQUE INDEX
  "org_memberships_one_open_primary_per_employee_idx"
ON "org_memberships" ("employee_id")
WHERE
  "membership_type" = 'PRIMARY'
  AND "ends_at" IS NULL;

-- Prevent duplicate names among root units while allowing the same
-- name in another office.
CREATE UNIQUE INDEX
  "org_units_root_name_key_unique_idx"
ON "org_units" ("office_id", "name_key")
WHERE "parent_org_unit_id" IS NULL;

-- Prevent duplicate sibling names while allowing identical names in
-- separate branches of the same office.
CREATE UNIQUE INDEX
  "org_units_sibling_name_key_unique_idx"
ON "org_units" ("office_id", "parent_org_unit_id", "name_key")
WHERE "parent_org_unit_id" IS NOT NULL;

-- Leadership history must have a valid time range.
ALTER TABLE "org_leadership_assignments"
  ADD CONSTRAINT "org_leadership_period_check"
  CHECK (
    "effective_until" IS NULL
    OR "effective_until" > "effective_from"
  );

-- Acting authority must always have an expiry.
ALTER TABLE "org_leadership_assignments"
  ADD CONSTRAINT "org_leadership_acting_expiry_check"
  CHECK (
    NOT "is_acting"
    OR "effective_until" IS NOT NULL
  );

-- Acting status applies only to leadership positions that can be acted.
ALTER TABLE "org_leadership_assignments"
  ADD CONSTRAINT "org_leadership_acting_type_check"
  CHECK (
    NOT "is_acting"
    OR "leadership_type" IN (
      'OFFICE_HEAD',
      'ORG_UNIT_HEAD',
      'TEAM_LEAD'
    )
  );

-- Office Head belongs to the Office scope rather than an OrgUnit.
ALTER TABLE "org_leadership_assignments"
  ADD CONSTRAINT "org_leadership_office_head_scope_check"
  CHECK (
    "leadership_type" <> 'OFFICE_HEAD'
    OR "org_unit_id" IS NULL
  );

-- Unit Head and Team Lead must have an organizational unit.
ALTER TABLE "org_leadership_assignments"
  ADD CONSTRAINT "org_leadership_unit_scope_check"
  CHECK (
    "leadership_type" NOT IN ('ORG_UNIT_HEAD', 'TEAM_LEAD')
    OR "org_unit_id" IS NOT NULL
  );

-- Normal leadership actions require an authenticated actor.
ALTER TABLE "org_leadership_assignments"
  ADD CONSTRAINT "org_leadership_assignment_actor_check"
  CHECK (
    "assigned_by_account_id" IS NOT NULL
    OR "assignment_source" IN ('LEGACY_MIGRATION', 'SYSTEM')
  );

-- At most one permanent active Office Head.
CREATE UNIQUE INDEX
  "org_leadership_one_permanent_office_head_idx"
ON "org_leadership_assignments" ("office_id")
WHERE
  "leadership_type" = 'OFFICE_HEAD'
  AND "is_acting" = false
  AND "effective_until" IS NULL;

-- At most one permanent active Org Unit Head or Team Lead of each
-- leadership type for a unit.
CREATE UNIQUE INDEX
  "org_leadership_one_permanent_unit_leader_idx"
ON "org_leadership_assignments" (
  "org_unit_id",
  "leadership_type"
)
WHERE
  "leadership_type" IN ('ORG_UNIT_HEAD', 'TEAM_LEAD')
  AND "is_acting" = false
  AND "effective_until" IS NULL;
