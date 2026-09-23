-- Retire the experimental MLS/OpenMLS runtime before introducing the final
-- application-layer message encryption design.
-- Historical migration files remain in the repository so Prisma migration
-- history stays valid. This migration removes the active MLS schema objects.
--
-- Safety: refuse to drop encrypted MLS envelopes if any were actually stored.
-- Such rows cannot be converted back to plaintext by PostgreSQL alone.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "messages"
    WHERE "encryption_mode" = 'MLS_E2EE'::"MessageEncryptionMode"
  ) THEN
    RAISE EXCEPTION
      'Cannot retire MLS runtime while MLS_E2EE messages exist. Preserve/export those messages before cleanup.';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS "mls_devices_revoke_invalidate_conversations" ON "mls_devices";
DROP FUNCTION IF EXISTS "invalidate_mls_groups_on_device_revocation"();

DROP TRIGGER IF EXISTS "conversation_participants_mls_membership_invalidate"
  ON "conversation_participants";
DROP FUNCTION IF EXISTS "invalidate_mls_group_on_active_membership_change"();

DROP TABLE IF EXISTS "mls_control_messages";
DROP TABLE IF EXISTS "mls_conversation_groups";
DROP TABLE IF EXISTS "mls_key_packages";
DROP TABLE IF EXISTS "mls_devices";

DROP TYPE IF EXISTS "MlsControlMessageType";
DROP TYPE IF EXISTS "MlsDeviceState";

ALTER TABLE "messages"
  DROP CONSTRAINT IF EXISTS "messages_mls_envelope_check";

DROP INDEX IF EXISTS "messages_encryption_mode_idx";

ALTER TABLE "messages"
  DROP COLUMN IF EXISTS "mls_epoch",
  DROP COLUMN IF EXISTS "mls_group_id",
  DROP COLUMN IF EXISTS "encrypted_content",
  DROP COLUMN IF EXISTS "encryption_mode";

DROP TYPE IF EXISTS "MessageEncryptionMode";
