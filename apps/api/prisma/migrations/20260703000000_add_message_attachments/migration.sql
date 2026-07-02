-- Y23: secure message attachment metadata.
CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "message_id" UUID NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "original_file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "content_type" "MessageContentType" NOT NULL,
    "scan_status" VARCHAR(40) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_attachments_storage_key_key" ON "message_attachments"("storage_key");
CREATE INDEX "message_attachments_message_idx" ON "message_attachments"("message_id");
CREATE INDEX "message_attachments_content_type_idx" ON "message_attachments"("content_type");

ALTER TABLE "message_attachments"
ADD CONSTRAINT "message_attachments_message_id_fkey"
FOREIGN KEY ("message_id") REFERENCES "messages"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
