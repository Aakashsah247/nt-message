ALTER TABLE "message_attachments"
  ADD COLUMN "content_security_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "content_encryption_key_version" INTEGER,
  ADD COLUMN "content_encryption_iv" VARCHAR(32),
  ADD COLUMN "content_encryption_tag" VARCHAR(32),
  ADD COLUMN "content_signature_key_version" INTEGER,
  ADD COLUMN "content_signature" VARCHAR(128),
  ADD COLUMN "ciphertext_sha256" VARCHAR(64),
  ADD COLUMN "encrypted_size_bytes" INTEGER;

CREATE INDEX "message_attachments_content_security_version_idx"
  ON "message_attachments"("content_security_version");

ALTER TABLE "message_attachments"
  ADD CONSTRAINT "message_attachments_content_security_shape_chk"
  CHECK (
    ("content_security_version" = 0)
    OR
    (
      "content_security_version" = 1
      AND "content_encryption_key_version" IS NOT NULL
      AND "content_encryption_iv" IS NOT NULL
      AND "content_encryption_tag" IS NOT NULL
      AND "content_signature_key_version" IS NOT NULL
      AND "content_signature" IS NOT NULL
      AND "ciphertext_sha256" IS NOT NULL
      AND "encrypted_size_bytes" IS NOT NULL
      AND "encrypted_size_bytes" >= 0
    )
  );
