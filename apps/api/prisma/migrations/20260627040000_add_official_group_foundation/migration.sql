CREATE TYPE "OfficialGroupScopeType" AS ENUM (
  'ORGANIZATION',
  'DIVISION',
  'DEPARTMENT'
);

CREATE TYPE "OfficialGroupAuditAction" AS ENUM (
  'CREATED',
  'DETAILS_UPDATED',
  'MEMBERSHIP_SYNCED',
  'RECONCILED'
);

ALTER TABLE "conversations"
  ADD COLUMN "official_scope_type" "OfficialGroupScopeType",
  ADD COLUMN "official_division_id" UUID,
  ADD COLUMN "official_department_id" UUID;

CREATE TABLE "official_group_audit_logs" (
  "id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "actor_account_id" UUID,
  "action" "OfficialGroupAuditAction" NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "official_group_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversations_official_scope_idx"
  ON "conversations"(
    "official_scope_type",
    "official_division_id",
    "official_department_id"
  );

CREATE INDEX "official_group_audit_logs_conversation_created_idx"
  ON "official_group_audit_logs"("conversation_id", "created_at");

CREATE INDEX "official_group_audit_logs_actor_created_idx"
  ON "official_group_audit_logs"("actor_account_id", "created_at");

CREATE INDEX "official_group_audit_logs_action_created_idx"
  ON "official_group_audit_logs"("action", "created_at");

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_official_scope_check"
  CHECK (
    (
      "group_kind" IS DISTINCT FROM 'OFFICIAL'
      AND "official_scope_type" IS NULL
      AND "official_division_id" IS NULL
      AND "official_department_id" IS NULL
    )
    OR
    (
      "group_kind" = 'OFFICIAL'
      AND (
        (
          "official_scope_type" = 'ORGANIZATION'
          AND "official_division_id" IS NULL
          AND "official_department_id" IS NULL
        )
        OR
        (
          "official_scope_type" = 'DIVISION'
          AND "official_division_id" IS NOT NULL
          AND "official_department_id" IS NULL
        )
        OR
        (
          "official_scope_type" = 'DEPARTMENT'
          AND "official_division_id" IS NOT NULL
          AND "official_department_id" IS NOT NULL
        )
      )
    )
  );

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_official_division_id_fkey"
  FOREIGN KEY ("official_division_id")
  REFERENCES "divisions"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "conversations"
  ADD CONSTRAINT "conversations_official_department_id_fkey"
  FOREIGN KEY ("official_department_id")
  REFERENCES "departments"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "official_group_audit_logs"
  ADD CONSTRAINT "official_group_audit_logs_conversation_id_fkey"
  FOREIGN KEY ("conversation_id")
  REFERENCES "conversations"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "official_group_audit_logs"
  ADD CONSTRAINT "official_group_audit_logs_actor_account_id_fkey"
  FOREIGN KEY ("actor_account_id")
  REFERENCES "accounts"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
