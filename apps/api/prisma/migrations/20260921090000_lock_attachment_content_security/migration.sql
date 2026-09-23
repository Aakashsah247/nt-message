DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "message_attachments"
    WHERE "purged_at" IS NULL
      AND "content_security_version" <> 1
  ) THEN
    RAISE EXCEPTION 'Attachment security lock cannot be applied while active legacy attachment content remains. Run pnpm message:security:backfill-attachments first.';
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "enforce_message_attachment_content_security"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW."content_security_version" <> 1 THEN
    RAISE EXCEPTION 'New message attachments must use protected content security version 1.';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD."content_security_version" = 1
     AND NEW."content_security_version" <> 1 THEN
    RAISE EXCEPTION 'Protected message attachment content cannot be downgraded.';
  END IF;

  IF NEW."purged_at" IS NULL AND NEW."content_security_version" <> 1 THEN
    RAISE EXCEPTION 'Active message attachments must use protected content security version 1.';
  END IF;

  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS "message_attachments_content_security_lock_trg"
  ON "message_attachments";
CREATE TRIGGER "message_attachments_content_security_lock_trg"
BEFORE INSERT OR UPDATE ON "message_attachments"
FOR EACH ROW
EXECUTE FUNCTION "enforce_message_attachment_content_security"();
