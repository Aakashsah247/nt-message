-- Phase 4 MLS E2EE: private-conversation MLS group bootstrap + device control transport.
-- The server stores only public/opaque MLS control material. Private MLS state remains client-side.

CREATE TYPE "MlsControlMessageType" AS ENUM ('WELCOME', 'HANDSHAKE');

CREATE TABLE "mls_conversation_groups" (
    "conversation_id" UUID NOT NULL,
    "group_id" VARCHAR(160) NOT NULL,
    "cipher_suite" INTEGER NOT NULL,
    "initialized_by_device_id" UUID NOT NULL,
    "initialized_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "mls_conversation_groups_pkey" PRIMARY KEY ("conversation_id")
);

CREATE TABLE "mls_control_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_device_id" UUID NOT NULL,
    "target_device_id" UUID NOT NULL,
    "type" "MlsControlMessageType" NOT NULL,
    "group_id" VARCHAR(160) NOT NULL,
    "payload" TEXT NOT NULL,
    "ratchet_tree" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMPTZ(3),
    CONSTRAINT "mls_control_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mls_conversation_groups_group_id_key"
ON "mls_conversation_groups"("group_id");

CREATE INDEX "mls_conversation_groups_initializer_idx"
ON "mls_conversation_groups"("initialized_by_device_id", "initialized_at");

CREATE INDEX "mls_control_messages_target_pending_idx"
ON "mls_control_messages"("target_device_id", "acknowledged_at", "created_at");

CREATE INDEX "mls_control_messages_conversation_created_idx"
ON "mls_control_messages"("conversation_id", "created_at");

ALTER TABLE "mls_conversation_groups"
ADD CONSTRAINT "mls_conversation_groups_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mls_conversation_groups"
ADD CONSTRAINT "mls_conversation_groups_initialized_by_device_id_fkey"
FOREIGN KEY ("initialized_by_device_id") REFERENCES "mls_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "mls_control_messages"
ADD CONSTRAINT "mls_control_messages_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mls_control_messages"
ADD CONSTRAINT "mls_control_messages_sender_device_id_fkey"
FOREIGN KEY ("sender_device_id") REFERENCES "mls_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "mls_control_messages"
ADD CONSTRAINT "mls_control_messages_target_device_id_fkey"
FOREIGN KEY ("target_device_id") REFERENCES "mls_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
