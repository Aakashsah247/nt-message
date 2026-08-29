-- WM-V2-4B1: keep Sales notes/files attached to the work record instead of
-- creating a separate messaging conversation or storing file bytes in PostgreSQL.
CREATE TABLE "work_sales_messages" (
    "id" UUID NOT NULL,
    "work_item_id" UUID NOT NULL,
    "sender_account_id" UUID NOT NULL,
    "text" VARCHAR(1500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_sales_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_sales_attachments" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "original_file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "scan_status" VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "work_sales_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "work_sales_messages_item_created_idx"
ON "work_sales_messages"("work_item_id", "created_at");
CREATE INDEX "work_sales_messages_sender_created_idx"
ON "work_sales_messages"("sender_account_id", "created_at");
CREATE INDEX "work_sales_attachments_message_idx"
ON "work_sales_attachments"("message_id");
CREATE INDEX "work_sales_attachments_storage_key_idx"
ON "work_sales_attachments"("storage_key");

ALTER TABLE "work_sales_messages"
ADD CONSTRAINT "work_sales_messages_work_item_id_fkey"
FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_sales_messages"
ADD CONSTRAINT "work_sales_messages_sender_account_id_fkey"
FOREIGN KEY ("sender_account_id") REFERENCES "accounts"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_sales_attachments"
ADD CONSTRAINT "work_sales_attachments_message_id_fkey"
FOREIGN KEY ("message_id") REFERENCES "work_sales_messages"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
