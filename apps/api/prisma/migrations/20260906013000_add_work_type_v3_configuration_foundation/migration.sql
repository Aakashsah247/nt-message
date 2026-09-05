-- P5-F1: additive Work Type V3 configuration foundation.
-- This migration adds versioned creator policy, controlled fields, workflow
-- stage definitions, dependency configuration and SLA/final-closure metadata.
-- WorkItem runtime behavior remains unchanged; Phase 6+ owns live execution.

CREATE TYPE "WorkTypeCreatorCategory" AS ENUM (
  'OFFICE_HEAD',
  'ORG_UNIT_HEAD',
  'TEAM_LEAD',
  'EMPLOYEE'
);

CREATE TYPE "WorkTypeCreatorScope" AS ENUM (
  'OFFICE_WIDE',
  'PRIMARY_OWNER_SUBTREE',
  'SPECIFIC_ORG_UNITS'
);

CREATE TYPE "WorkFieldType" AS ENUM (
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'DECIMAL',
  'DATE',
  'DATETIME',
  'BOOLEAN',
  'SELECT',
  'MULTI_SELECT',
  'USER',
  'ORG_UNIT',
  'REFERENCE',
  'IMAGE',
  'FILE'
);

CREATE TYPE "WorkStageResponsibleOrgUnitRule" AS ENUM (
  'PRIMARY_OWNER',
  'SPECIFIC_ORG_UNIT',
  'RUNTIME_REQUESTED_PARTICIPANT'
);

CREATE TYPE "WorkStageAssignmentMode" AS ENUM (
  'ORG_UNIT_QUEUE',
  'TEAM',
  'INDIVIDUAL',
  'ORG_UNIT_OR_TEAM',
  'ORG_UNIT_OR_USER',
  'RESPONSIBLE_ORG_UNIT_HEAD'
);

CREATE TYPE "WorkStageApprovalMode" AS ENUM (
  'NONE',
  'RESPONSIBLE_ORG_UNIT_HEAD',
  'TEAM_LEAD',
  'SPECIFIC_LEADERSHIP',
  'OFFICE_HEAD'
);

CREATE TYPE "WorkStageActivationMode" AS ENUM (
  'ALWAYS',
  'MANUAL_WHEN_REQUIRED',
  'FIELD_TRUE',
  'FIELD_EQUALS'
);

CREATE TYPE "WorkFinalClosureMode" AS ENUM (
  'AUTO_AFTER_REQUIRED_STAGES',
  'PRIMARY_OWNER_HEAD',
  'SPECIFIC_LEADERSHIP',
  'OFFICE_HEAD'
);

CREATE TYPE "WorkSlaBasis" AS ENUM (
  'CALENDAR_DURATION',
  'OFFICE_WORKING_DURATION'
);

ALTER TABLE "work_type_versions"
  ADD COLUMN "primary_owner_org_unit_id" UUID,
  ADD COLUMN "creator_categories" "WorkTypeCreatorCategory"[] NOT NULL DEFAULT ARRAY[]::"WorkTypeCreatorCategory"[],
  ADD COLUMN "creator_scope" "WorkTypeCreatorScope" NOT NULL DEFAULT 'PRIMARY_OWNER_SUBTREE',
  ADD COLUMN "final_closure_mode" "WorkFinalClosureMode" NOT NULL DEFAULT 'AUTO_AFTER_REQUIRED_STAGES',
  ADD COLUMN "final_closure_leadership_type" "OrgLeadershipType",
  ADD COLUMN "sla_basis" "WorkSlaBasis" NOT NULL DEFAULT 'CALENDAR_DURATION',
  ADD COLUMN "overall_sla_minutes" INTEGER;

ALTER TABLE "work_type_versions"
  ADD CONSTRAINT "work_type_versions_overall_sla_positive_check"
  CHECK ("overall_sla_minutes" IS NULL OR "overall_sla_minutes" > 0);

CREATE INDEX "work_type_versions_primary_owner_idx"
ON "work_type_versions"("primary_owner_org_unit_id");

ALTER TABLE "work_type_versions"
  ADD CONSTRAINT "work_type_versions_primary_owner_org_unit_id_fkey"
  FOREIGN KEY ("primary_owner_org_unit_id") REFERENCES "org_units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_type_creator_org_units" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_type_version_id" UUID NOT NULL,
  "org_unit_id" UUID NOT NULL,
  "include_descendants" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "work_type_creator_org_units_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_type_creator_org_units_version_unit_key"
ON "work_type_creator_org_units"("work_type_version_id", "org_unit_id");

CREATE INDEX "work_type_creator_org_units_unit_version_idx"
ON "work_type_creator_org_units"("org_unit_id", "work_type_version_id");

ALTER TABLE "work_type_creator_org_units"
  ADD CONSTRAINT "work_type_creator_org_units_work_type_version_id_fkey"
  FOREIGN KEY ("work_type_version_id") REFERENCES "work_type_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_type_creator_org_units"
  ADD CONSTRAINT "work_type_creator_org_units_org_unit_id_fkey"
  FOREIGN KEY ("org_unit_id") REFERENCES "org_units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_type_creator_accounts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_type_version_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "work_type_creator_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "work_type_creator_accounts_version_account_key"
ON "work_type_creator_accounts"("work_type_version_id", "account_id");

CREATE INDEX "work_type_creator_accounts_account_version_idx"
ON "work_type_creator_accounts"("account_id", "work_type_version_id");

ALTER TABLE "work_type_creator_accounts"
  ADD CONSTRAINT "work_type_creator_accounts_work_type_version_id_fkey"
  FOREIGN KEY ("work_type_version_id") REFERENCES "work_type_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_type_creator_accounts"
  ADD CONSTRAINT "work_type_creator_accounts_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "work_field_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_type_version_id" UUID NOT NULL,
  "stage_definition_id" UUID,
  "code" VARCHAR(80) NOT NULL,
  "label" VARCHAR(150) NOT NULL,
  "field_type" "WorkFieldType" NOT NULL,
  "is_required" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "config" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "work_field_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_field_definitions_code_format_check"
    CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  CONSTRAINT "work_field_definitions_sort_order_check"
    CHECK ("sort_order" >= 0)
);

CREATE UNIQUE INDEX "work_field_definitions_version_code_key"
ON "work_field_definitions"("work_type_version_id", "code");

CREATE INDEX "work_field_definitions_version_stage_sort_idx"
ON "work_field_definitions"("work_type_version_id", "stage_definition_id", "sort_order");

CREATE INDEX "work_field_definitions_stage_idx"
ON "work_field_definitions"("stage_definition_id");

ALTER TABLE "work_field_definitions"
  ADD CONSTRAINT "work_field_definitions_work_type_version_id_fkey"
  FOREIGN KEY ("work_type_version_id") REFERENCES "work_type_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "work_stage_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_type_version_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "description" VARCHAR(1000),
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_required" BOOLEAN NOT NULL DEFAULT true,
  "responsible_org_unit_rule" "WorkStageResponsibleOrgUnitRule" NOT NULL,
  "responsible_org_unit_id" UUID,
  "assignment_mode" "WorkStageAssignmentMode" NOT NULL,
  "approval_mode" "WorkStageApprovalMode" NOT NULL DEFAULT 'NONE',
  "approval_leadership_type" "OrgLeadershipType",
  "activation_mode" "WorkStageActivationMode" NOT NULL DEFAULT 'ALWAYS',
  "activation_field_definition_id" UUID,
  "activation_expected_value" JSONB,
  "sla_minutes" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "work_stage_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_stage_definitions_code_format_check"
    CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  CONSTRAINT "work_stage_definitions_sort_order_check"
    CHECK ("sort_order" >= 0),
  CONSTRAINT "work_stage_definitions_sla_positive_check"
    CHECK ("sla_minutes" IS NULL OR "sla_minutes" > 0),
  CONSTRAINT "work_stage_definitions_responsibility_check"
    CHECK (
      ("responsible_org_unit_rule" = 'SPECIFIC_ORG_UNIT' AND "responsible_org_unit_id" IS NOT NULL)
      OR
      ("responsible_org_unit_rule" <> 'SPECIFIC_ORG_UNIT' AND "responsible_org_unit_id" IS NULL)
    ),
  CONSTRAINT "work_stage_definitions_approval_check"
    CHECK (
      ("approval_mode" = 'SPECIFIC_LEADERSHIP' AND "approval_leadership_type" IS NOT NULL)
      OR
      ("approval_mode" <> 'SPECIFIC_LEADERSHIP' AND "approval_leadership_type" IS NULL)
    ),
  CONSTRAINT "work_stage_definitions_activation_check"
    CHECK (
      ("activation_mode" IN ('ALWAYS', 'MANUAL_WHEN_REQUIRED')
        AND "activation_field_definition_id" IS NULL
        AND "activation_expected_value" IS NULL)
      OR
      ("activation_mode" = 'FIELD_TRUE'
        AND "activation_field_definition_id" IS NOT NULL
        AND "activation_expected_value" IS NULL)
      OR
      ("activation_mode" = 'FIELD_EQUALS'
        AND "activation_field_definition_id" IS NOT NULL
        AND "activation_expected_value" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "work_stage_definitions_version_code_key"
ON "work_stage_definitions"("work_type_version_id", "code");

CREATE INDEX "work_stage_definitions_version_sort_idx"
ON "work_stage_definitions"("work_type_version_id", "sort_order");

CREATE INDEX "work_stage_definitions_responsible_unit_idx"
ON "work_stage_definitions"("responsible_org_unit_id");

CREATE INDEX "work_stage_definitions_activation_field_idx"
ON "work_stage_definitions"("activation_field_definition_id");

ALTER TABLE "work_stage_definitions"
  ADD CONSTRAINT "work_stage_definitions_work_type_version_id_fkey"
  FOREIGN KEY ("work_type_version_id") REFERENCES "work_type_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_stage_definitions"
  ADD CONSTRAINT "work_stage_definitions_responsible_org_unit_id_fkey"
  FOREIGN KEY ("responsible_org_unit_id") REFERENCES "org_units"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_stage_definitions"
  ADD CONSTRAINT "work_stage_definitions_activation_field_definition_id_fkey"
  FOREIGN KEY ("activation_field_definition_id") REFERENCES "work_field_definitions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_field_definitions"
  ADD CONSTRAINT "work_field_definitions_stage_definition_id_fkey"
  FOREIGN KEY ("stage_definition_id") REFERENCES "work_stage_definitions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "work_stage_dependencies" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_type_version_id" UUID NOT NULL,
  "stage_definition_id" UUID NOT NULL,
  "prerequisite_stage_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "work_stage_dependencies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_stage_dependencies_no_self_check"
    CHECK ("stage_definition_id" <> "prerequisite_stage_id")
);

CREATE UNIQUE INDEX "work_stage_dependencies_stage_prerequisite_key"
ON "work_stage_dependencies"("stage_definition_id", "prerequisite_stage_id");

CREATE INDEX "work_stage_dependencies_version_idx"
ON "work_stage_dependencies"("work_type_version_id");

CREATE INDEX "work_stage_dependencies_prerequisite_idx"
ON "work_stage_dependencies"("prerequisite_stage_id");

ALTER TABLE "work_stage_dependencies"
  ADD CONSTRAINT "work_stage_dependencies_work_type_version_id_fkey"
  FOREIGN KEY ("work_type_version_id") REFERENCES "work_type_versions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_stage_dependencies"
  ADD CONSTRAINT "work_stage_dependencies_stage_definition_id_fkey"
  FOREIGN KEY ("stage_definition_id") REFERENCES "work_stage_definitions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_stage_dependencies"
  ADD CONSTRAINT "work_stage_dependencies_prerequisite_stage_id_fkey"
  FOREIGN KEY ("prerequisite_stage_id") REFERENCES "work_stage_definitions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
