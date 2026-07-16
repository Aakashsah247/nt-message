-- Y31: privacy-safe audit event for completed password recovery.
ALTER TYPE "ActivityEventType" ADD VALUE 'PASSWORD_RESET_COMPLETED';

-- Password recovery has its own account-scoped challenge because Super
-- Admin accounts are not tied to an employee OTP record.
CREATE TABLE "password_reset_challenges" (
  "id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "otp_hash" VARCHAR(64) NOT NULL,
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL DEFAULT 5,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "verified_at" TIMESTAMPTZ(3),
  "reset_token_hash" VARCHAR(64),
  "reset_token_expires_at" TIMESTAMPTZ(3),
  "consumed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_reset_challenges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_challenges_reset_token_hash_key"
  ON "password_reset_challenges"("reset_token_hash");

-- Only one active challenge may exist per account. A resend invalidates the
-- previous OTP and any reset token derived from it.
CREATE UNIQUE INDEX "password_reset_challenges_one_active_account_key"
  ON "password_reset_challenges"("account_id")
  WHERE "consumed_at" IS NULL;

CREATE INDEX "password_reset_challenges_account_created_idx"
  ON "password_reset_challenges"("account_id", "created_at");

CREATE INDEX "password_reset_challenges_expires_at_idx"
  ON "password_reset_challenges"("expires_at");

CREATE INDEX "password_reset_challenges_token_expires_idx"
  ON "password_reset_challenges"("reset_token_expires_at");

ALTER TABLE "password_reset_challenges"
  ADD CONSTRAINT "password_reset_challenges_account_id_fkey"
  FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
