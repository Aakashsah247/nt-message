-- Phase 2: after the application backfill has converted all stored plaintext
-- message bodies/captions, prevent plaintext downgrade at the database boundary.
--
-- The migration intentionally refuses to apply while any non-null version-0
-- message text remains. Run `pnpm message:security:backfill` first.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "messages"
    WHERE "text_content" IS NOT NULL
      AND COALESCE("text_security_version", 0) <> 1
  ) THEN
    RAISE EXCEPTION
      'Message security lock cannot be applied while plaintext/version-0 message text remains. Run pnpm message:security:backfill first.';
  END IF;
END
$$;

-- A trigram index over encrypted base64url ciphertext is not useful and leaks
-- no searchable plaintext. Search now uses the keyed blind-token GIN index.
DROP INDEX IF EXISTS "messages_text_content_trgm_idx";

ALTER TABLE "messages"
  DROP CONSTRAINT IF EXISTS "messages_text_security_shape_check";

ALTER TABLE "messages"
  ADD CONSTRAINT "messages_text_security_shape_check"
  CHECK (
    (
      "text_content" IS NULL
      AND "text_security_version" IN (0, 1)
    )
    OR
    (
      "text_content" IS NOT NULL
      AND "text_security_version" = 1
      AND "text_encryption_key_version" IS NOT NULL
      AND "text_encryption_key_version" > 0
      AND "text_encryption_iv" IS NOT NULL
      AND length("text_encryption_iv") > 0
      AND "text_encryption_tag" IS NOT NULL
      AND length("text_encryption_tag") > 0
      AND "text_signature_key_version" IS NOT NULL
      AND "text_signature_key_version" > 0
      AND "text_signature" IS NOT NULL
      AND length("text_signature") > 0
    )
  );
