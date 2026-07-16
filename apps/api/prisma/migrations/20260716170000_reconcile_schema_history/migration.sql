-- Reconcile schema objects that exist in the current Prisma schema and live
-- database but were not fully represented by the historical migration chain.
--
-- This migration is intentionally additive and idempotent. It must never drop
-- business tables or user data while repairing migration portability.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type AS type
    JOIN pg_namespace AS namespace
      ON namespace.oid = type.typnamespace
    WHERE type.typname = 'EmergencyAlertRecipientStatus'
      AND namespace.nspname = 'public'
  ) THEN
    CREATE TYPE "EmergencyAlertRecipientStatus" AS ENUM (
      'PENDING',
      'SENT',
      'FAILED',
      'SKIPPED_NO_PHONE'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "super_admin_profiles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "account_id" UUID NOT NULL,
  "full_name" VARCHAR(150) NOT NULL,
  "email" VARCHAR(255) NOT NULL,
  "phone_number" VARCHAR(20) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "super_admin_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "super_admin_profiles_account_id_key"
ON "super_admin_profiles"("account_id");

CREATE UNIQUE INDEX IF NOT EXISTS "super_admin_profiles_email_key"
ON "super_admin_profiles"("email");

CREATE UNIQUE INDEX IF NOT EXISTS "super_admin_profiles_phone_number_key"
ON "super_admin_profiles"("phone_number");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'super_admin_profiles_account_id_fkey'
      AND conrelid = 'public.super_admin_profiles'::regclass
  ) THEN
    ALTER TABLE "super_admin_profiles"
      ADD CONSTRAINT "super_admin_profiles_account_id_fkey"
      FOREIGN KEY ("account_id")
      REFERENCES "accounts"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "emergency_alerts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sender_account_id" UUID NOT NULL,
  "message_long" TEXT NOT NULL,
  "message_short" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "emergency_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "emergency_alerts_sender_created_idx"
ON "emergency_alerts"("sender_account_id", "created_at");

CREATE INDEX IF NOT EXISTS "emergency_alerts_created_idx"
ON "emergency_alerts"("created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'emergency_alerts_sender_account_id_fkey'
      AND conrelid = 'public.emergency_alerts'::regclass
  ) THEN
    ALTER TABLE "emergency_alerts"
      ADD CONSTRAINT "emergency_alerts_sender_account_id_fkey"
      FOREIGN KEY ("sender_account_id")
      REFERENCES "accounts"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "emergency_alert_recipients" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "emergency_alert_id" UUID NOT NULL,
  "recipient_account_id" UUID NOT NULL,
  "phone_number" VARCHAR(20),
  "status" "EmergencyAlertRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "provider_name" VARCHAR(80),
  "provider_message_id" VARCHAR(120),
  "failure_reason" VARCHAR(500),
  "sent_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "emergency_alert_recipients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "emergency_alert_recipients_alert_idx"
ON "emergency_alert_recipients"("emergency_alert_id");

CREATE INDEX IF NOT EXISTS "emergency_alert_recipients_recipient_created_idx"
ON "emergency_alert_recipients"("recipient_account_id", "created_at");

CREATE INDEX IF NOT EXISTS "emergency_alert_recipients_status_created_idx"
ON "emergency_alert_recipients"("status", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'emergency_alert_recipients_emergency_alert_id_fkey'
      AND conrelid = 'public.emergency_alert_recipients'::regclass
  ) THEN
    ALTER TABLE "emergency_alert_recipients"
      ADD CONSTRAINT "emergency_alert_recipients_emergency_alert_id_fkey"
      FOREIGN KEY ("emergency_alert_id")
      REFERENCES "emergency_alerts"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'emergency_alert_recipients_recipient_account_id_fkey'
      AND conrelid = 'public.emergency_alert_recipients'::regclass
  ) THEN
    ALTER TABLE "emergency_alert_recipients"
      ADD CONSTRAINT "emergency_alert_recipients_recipient_account_id_fkey"
      FOREIGN KEY ("recipient_account_id")
      REFERENCES "accounts"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
  END IF;
END $$;

-- A narrowing type change must fail rather than silently truncate usernames.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "accounts"
    WHERE char_length("username") > 80
  ) THEN
    RAISE EXCEPTION
      'Cannot change accounts.username to VARCHAR(80): an existing value exceeds 80 characters.';
  END IF;
END $$;

ALTER TABLE "accounts"
  ALTER COLUMN "username" SET DATA TYPE VARCHAR(80);

ALTER TABLE "activity_events"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "daily_activity_summaries"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "group_invitation_links"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid();

ALTER TABLE "message_attachments"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "messaging_account_blocks"
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "messaging_notifications"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;

-- Forwarded messages may reference the same stored object. Keep one normal
-- lookup index instead of reintroducing the obsolete uniqueness constraint.
DROP INDEX IF EXISTS "message_attachments_storage_key_key";

CREATE INDEX IF NOT EXISTS "message_attachments_storage_key_idx"
ON "message_attachments"("storage_key");

CREATE INDEX IF NOT EXISTS "accounts_show_online_status_idx"
ON "accounts"("show_online_status");

-- PostgreSQL partial indexes are not represented completely by Prisma schema
-- introspection, so the business rule remains explicit in migration SQL.
CREATE UNIQUE INDEX IF NOT EXISTS
  "group_invitation_links_one_active_per_conversation_key"
ON "group_invitation_links"("conversation_id")
WHERE "revoked_at" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'messaging_account_blocks_no_self_block_chk'
      AND conrelid = 'public.messaging_account_blocks'::regclass
  ) THEN
    ALTER TABLE "messaging_account_blocks"
      ADD CONSTRAINT "messaging_account_blocks_no_self_block_chk"
      CHECK ("blocker_account_id" <> "blocked_account_id");
  END IF;
END $$;
