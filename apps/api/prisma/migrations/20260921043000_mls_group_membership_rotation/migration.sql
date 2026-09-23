ALTER TABLE "mls_conversation_groups"
  ADD COLUMN "generation" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "invalidated_at" TIMESTAMPTZ(3);

CREATE OR REPLACE FUNCTION "invalidate_mls_group_on_active_membership_change"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_conversation_id UUID;
  active_membership_changed BOOLEAN := FALSE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    target_conversation_id := NEW."conversation_id";
    active_membership_changed := NEW."left_at" IS NULL;
  ELSIF TG_OP = 'DELETE' THEN
    target_conversation_id := OLD."conversation_id";
    active_membership_changed := OLD."left_at" IS NULL;
  ELSE
    target_conversation_id := NEW."conversation_id";
    active_membership_changed :=
      (OLD."left_at" IS NULL) IS DISTINCT FROM (NEW."left_at" IS NULL);
  END IF;

  IF active_membership_changed THEN
    UPDATE "mls_conversation_groups"
    SET "invalidated_at" = COALESCE("invalidated_at", CURRENT_TIMESTAMP),
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "conversation_id" = target_conversation_id
      AND EXISTS (
        SELECT 1
        FROM "conversations"
        WHERE "conversations"."id" = target_conversation_id
          AND "conversations"."type" = 'GROUP'
      );
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "conversation_participants_mls_membership_invalidate"
  ON "conversation_participants";

CREATE TRIGGER "conversation_participants_mls_membership_invalidate"
AFTER INSERT OR DELETE OR UPDATE OF "left_at"
ON "conversation_participants"
FOR EACH ROW
EXECUTE FUNCTION "invalidate_mls_group_on_active_membership_change"();
