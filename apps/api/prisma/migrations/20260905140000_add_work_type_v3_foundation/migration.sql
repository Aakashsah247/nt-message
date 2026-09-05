-- P5-B: additive Work Type V3 data foundation.
-- Existing WorkItem.type runtime behavior is intentionally unchanged here.

CREATE TYPE "WorkTypeVersionStatus" AS ENUM (
  'DRAFT',
  'PUBLISHED',
  'RETIRED'
);

CREATE TABLE "work_type_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "office_id" UUID NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "legacy_work_item_type" "WorkItemType",
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by_account_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "work_type_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_type_definitions_code_format_check"
    CHECK ("code" ~ '^[A-Z][A-Z0-9_]{1,79}$')
);

CREATE TABLE "work_type_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_type_definition_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "WorkTypeVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "name" VARCHAR(150) NOT NULL,
  "description" VARCHAR(1000),
  "change_reason" VARCHAR(500),
  "created_by_account_id" UUID NOT NULL,
  "published_by_account_id" UUID,
  "retired_by_account_id" UUID,
  "published_at" TIMESTAMPTZ(3),
  "retired_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "work_type_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_type_versions_version_positive_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "work_type_definitions_office_code_key"
ON "work_type_definitions"("office_id", "code");

CREATE UNIQUE INDEX "work_type_definitions_office_legacy_type_key"
ON "work_type_definitions"("office_id", "legacy_work_item_type");

CREATE INDEX "work_type_definitions_office_active_sort_idx"
ON "work_type_definitions"("office_id", "is_active", "sort_order");

CREATE INDEX "work_type_definitions_created_by_idx"
ON "work_type_definitions"("created_by_account_id");

CREATE UNIQUE INDEX "work_type_versions_definition_version_key"
ON "work_type_versions"("work_type_definition_id", "version");

CREATE INDEX "work_type_versions_definition_status_version_idx"
ON "work_type_versions"("work_type_definition_id", "status", "version");

CREATE INDEX "work_type_versions_status_created_idx"
ON "work_type_versions"("status", "created_at");

CREATE INDEX "work_type_versions_created_by_idx"
ON "work_type_versions"("created_by_account_id");

CREATE INDEX "work_type_versions_published_by_idx"
ON "work_type_versions"("published_by_account_id");

CREATE INDEX "work_type_versions_retired_by_idx"
ON "work_type_versions"("retired_by_account_id");

ALTER TABLE "work_type_definitions"
  ADD CONSTRAINT "work_type_definitions_office_id_fkey"
  FOREIGN KEY ("office_id") REFERENCES "offices"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_type_definitions"
  ADD CONSTRAINT "work_type_definitions_created_by_account_id_fkey"
  FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_type_versions"
  ADD CONSTRAINT "work_type_versions_work_type_definition_id_fkey"
  FOREIGN KEY ("work_type_definition_id") REFERENCES "work_type_definitions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_type_versions"
  ADD CONSTRAINT "work_type_versions_created_by_account_id_fkey"
  FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_type_versions"
  ADD CONSTRAINT "work_type_versions_published_by_account_id_fkey"
  FOREIGN KEY ("published_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_type_versions"
  ADD CONSTRAINT "work_type_versions_retired_by_account_id_fkey"
  FOREIGN KEY ("retired_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
