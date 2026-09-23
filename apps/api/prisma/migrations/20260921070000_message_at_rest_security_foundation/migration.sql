-- Application-layer message confidentiality and integrity foundation.
-- Historical rows stay at version 0 for a controlled backfill phase.
ALTER TABLE "messages"
  ADD COLUMN "text_security_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "text_encryption_key_version" INTEGER,
  ADD COLUMN "text_encryption_iv" VARCHAR(32),
  ADD COLUMN "text_encryption_tag" VARCHAR(32),
  ADD COLUMN "text_signature_key_version" INTEGER,
  ADD COLUMN "text_signature" TEXT,
  ADD COLUMN "text_search_tokens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_text_security_envelope_check"
  CHECK (
    (
      "text_security_version" = 0
      AND "text_encryption_key_version" IS NULL
      AND "text_encryption_iv" IS NULL
      AND "text_encryption_tag" IS NULL
      AND "text_signature_key_version" IS NULL
      AND "text_signature" IS NULL
    )
    OR
    (
      "text_security_version" = 1
      AND "text_content" IS NOT NULL
      AND "text_encryption_key_version" IS NOT NULL
      AND "text_encryption_iv" IS NOT NULL
      AND "text_encryption_tag" IS NOT NULL
      AND "text_signature_key_version" IS NOT NULL
      AND "text_signature" IS NOT NULL
    )
  );

CREATE INDEX "messages_text_security_version_idx"
  ON "messages" ("text_security_version");
CREATE INDEX "messages_text_search_tokens_idx"
  ON "messages" USING GIN ("text_search_tokens");
