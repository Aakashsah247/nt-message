CREATE OR REPLACE FUNCTION "invalidate_mls_groups_on_device_revocation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD."state" = 'ACTIVE' AND NEW."state" = 'REVOKED' THEN
    UPDATE "mls_conversation_groups" AS "group_state"
    SET "invalidated_at" = COALESCE("group_state"."invalidated_at", CURRENT_TIMESTAMP),
        "updated_at" = CURRENT_TIMESTAMP
    WHERE "group_state"."invalidated_at" IS NULL
      AND EXISTS (
        SELECT 1
        FROM "conversation_participants" AS "participant"
        WHERE "participant"."conversation_id" = "group_state"."conversation_id"
          AND "participant"."account_id" = NEW."account_id"
          AND "participant"."left_at" IS NULL
      );

    DELETE FROM "mls_control_messages" AS "control_message"
    USING "conversation_participants" AS "participant"
    WHERE "control_message"."conversation_id" = "participant"."conversation_id"
      AND "participant"."account_id" = NEW."account_id"
      AND "participant"."left_at" IS NULL
      AND "control_message"."acknowledged_at" IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "mls_devices_revoke_invalidate_conversations"
  ON "mls_devices";

CREATE TRIGGER "mls_devices_revoke_invalidate_conversations"
AFTER UPDATE OF "state"
ON "mls_devices"
FOR EACH ROW
EXECUTE FUNCTION "invalidate_mls_groups_on_device_revocation"();
