-- P4-C: protected identity corrections are distinct from organization changes.
-- Each changed protected field receives an immutable before/after audit row.
CREATE TYPE "IdentityCorrectionField" AS ENUM (
  'OFFICIAL_NAME',
  'EMPLOYEE_ID',
  'OFFICIAL_EMAIL',
  'PHONE_NUMBER'
);

CREATE TABLE "identity_correction_audits" (
  "id" UUID NOT NULL,
  "operation_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "actor_account_id" UUID NOT NULL,
  "field" "IdentityCorrectionField" NOT NULL,
  "old_value" VARCHAR(255) NOT NULL,
  "new_value" VARCHAR(255) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "ip_address" VARCHAR(45),
  "user_agent" VARCHAR(500),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "identity_correction_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "identity_correction_audits_employee_created_idx"
ON "identity_correction_audits"("employee_id", "created_at");

CREATE INDEX "identity_correction_audits_actor_created_idx"
ON "identity_correction_audits"("actor_account_id", "created_at");

CREATE UNIQUE INDEX "identity_correction_audits_operation_field_key"
ON "identity_correction_audits"("operation_id", "field");

CREATE INDEX "identity_correction_audits_field_created_idx"
ON "identity_correction_audits"("field", "created_at");

ALTER TABLE "identity_correction_audits"
ADD CONSTRAINT "identity_correction_audits_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "identity_correction_audits"
ADD CONSTRAINT "identity_correction_audits_actor_account_id_fkey"
FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
