-- Phase E2EE-1: opaque MLS message envelope.
-- Existing history remains LEGACY_PLAINTEXT until a later client-side migration.

CREATE TYPE "MessageEncryptionMode" AS ENUM ('LEGACY_PLAINTEXT', 'MLS_E2EE');

ALTER TABLE "messages"
  ADD COLUMN "encryption_mode" "MessageEncryptionMode" NOT NULL DEFAULT 'LEGACY_PLAINTEXT',
  ADD COLUMN "encrypted_content" TEXT,
  ADD COLUMN "mls_group_id" VARCHAR(160),
  ADD COLUMN "mls_epoch" INTEGER;

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_mls_envelope_check"
  CHECK (
    ("encryption_mode" = 'LEGACY_PLAINTEXT')
    OR
    (
      "encryption_mode" = 'MLS_E2EE'
      AND "text_content" IS NULL
      AND "encrypted_content" IS NOT NULL
      AND length("encrypted_content") >= 16
      AND "mls_group_id" IS NOT NULL
      AND length("mls_group_id") > 0
      AND "mls_epoch" IS NOT NULL
      AND "mls_epoch" >= 0
    )
  );

CREATE INDEX "messages_encryption_mode_idx"
  ON "messages" ("encryption_mode", "sent_at");
