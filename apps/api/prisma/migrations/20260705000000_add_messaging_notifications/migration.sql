-- Y26: store user-visible messaging notifications for unread badges and notification panel.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MessagingNotificationType') THEN
    CREATE TYPE "MessagingNotificationType" AS ENUM (
      'MESSAGE',
      'REPLY',
      'REACTION',
      'FILE',
      'IMAGE',
      'VIDEO',
      'AUDIO',
      'VOICE_NOTE',
      'GROUP_EVENT',
      'MENTION'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "messaging_notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "recipient_account_id" UUID NOT NULL,
  "actor_account_id" UUID,
  "conversation_id" UUID,
  "message_id" UUID,
  "type" "MessagingNotificationType" NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" VARCHAR(500) NOT NULL,
  "is_read" BOOLEAN NOT NULL DEFAULT false,
  "read_at" TIMESTAMPTZ(3),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "messaging_notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "messaging_notifications_recipient_read_created_idx"
ON "messaging_notifications"("recipient_account_id", "is_read", "created_at");

CREATE INDEX IF NOT EXISTS "messaging_notifications_recipient_created_idx"
ON "messaging_notifications"("recipient_account_id", "created_at");

CREATE INDEX IF NOT EXISTS "messaging_notifications_conversation_created_idx"
ON "messaging_notifications"("conversation_id", "created_at");

CREATE INDEX IF NOT EXISTS "messaging_notifications_message_idx"
ON "messaging_notifications"("message_id");

CREATE INDEX IF NOT EXISTS "messaging_notifications_type_created_idx"
ON "messaging_notifications"("type", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messaging_notifications_recipient_account_id_fkey'
  ) THEN
    ALTER TABLE "messaging_notifications"
    ADD CONSTRAINT "messaging_notifications_recipient_account_id_fkey"
    FOREIGN KEY ("recipient_account_id") REFERENCES "accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messaging_notifications_actor_account_id_fkey'
  ) THEN
    ALTER TABLE "messaging_notifications"
    ADD CONSTRAINT "messaging_notifications_actor_account_id_fkey"
    FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messaging_notifications_conversation_id_fkey'
  ) THEN
    ALTER TABLE "messaging_notifications"
    ADD CONSTRAINT "messaging_notifications_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'messaging_notifications_message_id_fkey'
  ) THEN
    ALTER TABLE "messaging_notifications"
    ADD CONSTRAINT "messaging_notifications_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
