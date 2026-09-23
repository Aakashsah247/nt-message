-- Phase 3: preserve cryptographically protected evidence when a message row is
-- hard-deleted (including cascade deletion). Normal "delete for everyone"
-- remains a soft delete on messages; this tombstone is a final database-level
-- safety net for whole-row deletion.

CREATE TABLE "message_security_tombstones" (
  "message_id" UUID NOT NULL,
  "conversation_id" UUID NOT NULL,
  "sender_account_id" UUID NOT NULL,
  "client_message_id" VARCHAR(100) NOT NULL,
  "content_type" "MessageContentType" NOT NULL,
  "text_content" TEXT,
  "text_security_version" INTEGER NOT NULL,
  "text_encryption_key_version" INTEGER,
  "text_encryption_iv" VARCHAR(32),
  "text_encryption_tag" VARCHAR(32),
  "text_signature_key_version" INTEGER,
  "text_signature" TEXT,
  "text_search_tokens" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sent_at" TIMESTAMPTZ(3) NOT NULL,
  "edited_at" TIMESTAMPTZ(3),
  "message_deleted_at" TIMESTAMPTZ(3),
  "message_deleted_by_account_id" UUID,
  "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "message_security_tombstones_pkey" PRIMARY KEY ("message_id")
);

CREATE INDEX "message_security_tombstones_conversation_idx"
  ON "message_security_tombstones" ("conversation_id", "sent_at");
CREATE INDEX "message_security_tombstones_sender_idx"
  ON "message_security_tombstones" ("sender_account_id", "sent_at");
CREATE INDEX "message_security_tombstones_recorded_idx"
  ON "message_security_tombstones" ("recorded_at");

CREATE OR REPLACE FUNCTION "nt_message_capture_message_security_tombstone"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "message_security_tombstones" (
    "message_id",
    "conversation_id",
    "sender_account_id",
    "client_message_id",
    "content_type",
    "text_content",
    "text_security_version",
    "text_encryption_key_version",
    "text_encryption_iv",
    "text_encryption_tag",
    "text_signature_key_version",
    "text_signature",
    "text_search_tokens",
    "sent_at",
    "edited_at",
    "message_deleted_at",
    "message_deleted_by_account_id"
  ) VALUES (
    OLD."id",
    OLD."conversation_id",
    OLD."sender_account_id",
    OLD."client_message_id",
    OLD."content_type",
    OLD."text_content",
    OLD."text_security_version",
    OLD."text_encryption_key_version",
    OLD."text_encryption_iv",
    OLD."text_encryption_tag",
    OLD."text_signature_key_version",
    OLD."text_signature",
    OLD."text_search_tokens",
    OLD."sent_at",
    OLD."edited_at",
    OLD."deleted_at",
    OLD."deleted_by_account_id"
  )
  ON CONFLICT ("message_id") DO NOTHING;

  RETURN OLD;
END
$$;

CREATE TRIGGER "messages_capture_security_tombstone_before_delete"
BEFORE DELETE ON "messages"
FOR EACH ROW
EXECUTE FUNCTION "nt_message_capture_message_security_tombstone"();

-- Tombstones are append-only. They are intentionally not connected back to
-- messages/conversations with foreign keys, so evidence survives cascades.
CREATE OR REPLACE FUNCTION "nt_message_reject_tombstone_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Message security tombstones are append-only and cannot be modified or deleted.';
END
$$;

CREATE TRIGGER "message_security_tombstones_immutable"
BEFORE UPDATE OR DELETE ON "message_security_tombstones"
FOR EACH ROW
EXECUTE FUNCTION "nt_message_reject_tombstone_mutation"();
