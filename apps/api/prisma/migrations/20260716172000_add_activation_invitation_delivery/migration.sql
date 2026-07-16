ALTER TYPE "AccountRequestActionType" ADD VALUE 'ACTIVATION_EMAIL_QUEUED';
ALTER TYPE "AccountRequestActionType" ADD VALUE 'ACTIVATION_EMAIL_SENT';
ALTER TYPE "AccountRequestActionType" ADD VALUE 'ACTIVATION_EMAIL_FAILED';
ALTER TYPE "AccountRequestActionType" ADD VALUE 'ACTIVATION_EMAIL_RESENT';

CREATE TYPE "ActivationEmailDeliveryStatus" AS ENUM (
  'NOT_SENT',
  'PENDING',
  'SENT',
  'FAILED'
);

ALTER TABLE "account_requests"
  ADD COLUMN "activation_email_status" "ActivationEmailDeliveryStatus" NOT NULL DEFAULT 'NOT_SENT',
  ADD COLUMN "activation_email_last_attempt_at" TIMESTAMPTZ(3),
  ADD COLUMN "activation_email_sent_at" TIMESTAMPTZ(3),
  ADD COLUMN "activation_email_failure_category" VARCHAR(80);

CREATE TABLE "activation_invitations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_request_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "created_by_account_id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "invalidated_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "activation_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "activation_invitations_token_hash_key" ON "activation_invitations"("token_hash");
CREATE INDEX "account_requests_activation_email_status_idx" ON "account_requests"("activation_email_status", "updated_at");
CREATE UNIQUE INDEX "activation_invitations_one_active_request_key" ON "activation_invitations"("account_request_id") WHERE "consumed_at" IS NULL AND "invalidated_at" IS NULL;
CREATE INDEX "activation_invitations_employee_active_idx" ON "activation_invitations"("employee_id", "invalidated_at", "consumed_at", "created_at");
CREATE INDEX "activation_invitations_expires_at_idx" ON "activation_invitations"("expires_at");
CREATE INDEX "activation_invitations_created_by_idx" ON "activation_invitations"("created_by_account_id", "created_at");

ALTER TABLE "activation_invitations"
  ADD CONSTRAINT "activation_invitations_account_request_id_fkey"
  FOREIGN KEY ("account_request_id") REFERENCES "account_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activation_invitations"
  ADD CONSTRAINT "activation_invitations_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activation_invitations"
  ADD CONSTRAINT "activation_invitations_created_by_account_id_fkey"
  FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
