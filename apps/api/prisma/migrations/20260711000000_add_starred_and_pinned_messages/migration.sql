-- M1 stores personal starred messages and conversation-level pinned messages.
CREATE TABLE "message_stars" (
    "message_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "starred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_stars_pkey" PRIMARY KEY ("message_id", "account_id")
);

CREATE TABLE "message_pins" (
    "message_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "pinned_by_account_id" UUID NOT NULL,
    "unpinned_by_account_id" UUID,
    "pinned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unpinned_at" TIMESTAMPTZ(3),

    CONSTRAINT "message_pins_pkey" PRIMARY KEY ("message_id", "conversation_id")
);

CREATE INDEX "message_stars_account_starred_idx" ON "message_stars"("account_id", "starred_at");
CREATE INDEX "message_stars_message_idx" ON "message_stars"("message_id");

CREATE INDEX "message_pins_conversation_active_idx" ON "message_pins"("conversation_id", "unpinned_at", "pinned_at");
CREATE INDEX "message_pins_pinned_by_idx" ON "message_pins"("pinned_by_account_id", "pinned_at");
CREATE INDEX "message_pins_unpinned_by_idx" ON "message_pins"("unpinned_by_account_id", "unpinned_at");

ALTER TABLE "message_stars"
    ADD CONSTRAINT "message_stars_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_stars"
    ADD CONSTRAINT "message_stars_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_pins"
    ADD CONSTRAINT "message_pins_message_id_fkey"
    FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_pins"
    ADD CONSTRAINT "message_pins_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_pins"
    ADD CONSTRAINT "message_pins_pinned_by_account_id_fkey"
    FOREIGN KEY ("pinned_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "message_pins"
    ADD CONSTRAINT "message_pins_unpinned_by_account_id_fkey"
    FOREIGN KEY ("unpinned_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
