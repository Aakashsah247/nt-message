-- CreateEnum
CREATE TYPE "ConversationType" AS ENUM ('PRIVATE', 'GROUP', 'ANNOUNCEMENT');

-- CreateEnum
CREATE TYPE "MessageContentType" AS ENUM ('TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'FILE', 'LOCATION', 'SYSTEM');

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "type" "ConversationType" NOT NULL DEFAULT 'PRIVATE',
    "title" VARCHAR(150),
    "private_participant_key" VARCHAR(73),
    "created_by_account_id" UUID NOT NULL,
    "last_message_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_participants" (
    "conversation_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ(3),
    "is_muted" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("conversation_id", "account_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_account_id" UUID NOT NULL,
    "client_message_id" VARCHAR(100) NOT NULL,
    "content_type" "MessageContentType" NOT NULL DEFAULT 'TEXT',
    "text_content" TEXT,
    "payload" JSONB,
    "reply_to_message_id" UUID,
    "sent_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(3),
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by_account_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_receipts" (
    "message_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "delivered_at" TIMESTAMPTZ(3),
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "message_receipts_pkey" PRIMARY KEY ("message_id", "account_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_private_participant_key_key" ON "conversations"("private_participant_key");

-- CreateIndex
CREATE INDEX "conversations_type_last_message_idx" ON "conversations"("type", "last_message_at");

-- CreateIndex
CREATE INDEX "conversations_created_by_idx" ON "conversations"("created_by_account_id");

-- CreateIndex
CREATE INDEX "conversations_last_message_idx" ON "conversations"("last_message_at");

-- CreateIndex
CREATE INDEX "conversation_participants_account_active_idx" ON "conversation_participants"("account_id", "left_at", "is_archived");

-- CreateIndex
CREATE INDEX "conversation_participants_conversation_active_idx" ON "conversation_participants"("conversation_id", "left_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_sender_client_message_key" ON "messages"("sender_account_id", "client_message_id");

-- CreateIndex
CREATE INDEX "messages_conversation_sent_idx" ON "messages"("conversation_id", "sent_at", "id");

-- CreateIndex
CREATE INDEX "messages_sender_sent_idx" ON "messages"("sender_account_id", "sent_at");

-- CreateIndex
CREATE INDEX "messages_reply_to_idx" ON "messages"("reply_to_message_id");

-- CreateIndex
CREATE INDEX "messages_deleted_at_idx" ON "messages"("deleted_at");

-- CreateIndex
CREATE INDEX "message_receipts_account_read_idx" ON "message_receipts"("account_id", "read_at", "message_id");

-- CreateIndex
CREATE INDEX "message_receipts_account_delivered_idx" ON "message_receipts"("account_id", "delivered_at", "message_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_account_id_fkey" FOREIGN KEY ("sender_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_deleted_by_account_id_fkey" FOREIGN KEY ("deleted_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_receipts" ADD CONSTRAINT "message_receipts_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A private conversation must have one normalized pair key.
-- Non-private conversations must not use the private pair key.
ALTER TABLE "conversations"
ADD CONSTRAINT "conversations_private_key_check"
CHECK (
  (
    "type" = 'PRIVATE'
    AND "private_participant_key" IS NOT NULL
  )
  OR
  (
    "type" <> 'PRIVATE'
    AND "private_participant_key" IS NULL
  )
);

-- Participants cannot leave before joining.
ALTER TABLE "conversation_participants"
ADD CONSTRAINT "conversation_participants_dates_check"
CHECK (
  "left_at" IS NULL
  OR "left_at" >= "joined_at"
);

-- Text messages require non-empty text content.
ALTER TABLE "messages"
ADD CONSTRAINT "messages_text_content_check"
CHECK (
  "content_type" <> 'TEXT'
  OR (
    "text_content" IS NOT NULL
    AND btrim("text_content") <> ''
  )
);

-- Message lifecycle timestamps cannot precede the send time.
ALTER TABLE "messages"
ADD CONSTRAINT "messages_lifecycle_dates_check"
CHECK (
  ("edited_at" IS NULL OR "edited_at" >= "sent_at")
  AND ("deleted_at" IS NULL OR "deleted_at" >= "sent_at")
);

-- A soft-deleted message records both the timestamp and actor.
ALTER TABLE "messages"
ADD CONSTRAINT "messages_deletion_actor_check"
CHECK (
  (
    "deleted_at" IS NULL
    AND "deleted_by_account_id" IS NULL
  )
  OR
  (
    "deleted_at" IS NOT NULL
    AND "deleted_by_account_id" IS NOT NULL
  )
);

-- Read receipts imply delivery and cannot precede delivery.
ALTER TABLE "message_receipts"
ADD CONSTRAINT "message_receipts_dates_check"
CHECK (
  "read_at" IS NULL
  OR (
    "delivered_at" IS NOT NULL
    AND "read_at" >= "delivered_at"
  )
);
