-- M-FINAL-1.5C: large official groups must not create one receipt row for
-- every message x recipient. Keep detailed MessageReceipt rows for private and
-- personal-group chats, while official groups advance one delivery/read cursor
-- per participant. Existing receipt rows are preserved for rollback/audit and
-- are used once here to backfill the new participant watermarks.

ALTER TABLE "conversation_participants"
  ADD COLUMN "delivered_through_message_id" UUID,
  ADD COLUMN "delivered_through_sent_at" TIMESTAMPTZ(3),
  ADD COLUMN "delivered_through_at" TIMESTAMPTZ(3),
  ADD COLUMN "read_through_message_id" UUID,
  ADD COLUMN "read_through_sent_at" TIMESTAMPTZ(3),
  ADD COLUMN "read_through_at" TIMESTAMPTZ(3);

CREATE TABLE "official_group_receipt_intervals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "joined_at" TIMESTAMPTZ(3) NOT NULL,
  "left_at" TIMESTAMPTZ(3) NOT NULL,
  "delivered_through_message_id" UUID,
  "delivered_through_sent_at" TIMESTAMPTZ(3),
  "delivered_through_at" TIMESTAMPTZ(3),
  "read_through_message_id" UUID,
  "read_through_sent_at" TIMESTAMPTZ(3),
  "read_through_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "official_group_receipt_intervals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "official_group_receipt_intervals_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "official_group_receipt_intervals_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "official_group_receipt_intervals_conversation_window_idx"
  ON "official_group_receipt_intervals" ("conversation_id", "joined_at", "left_at");

CREATE INDEX "official_group_receipt_intervals_account_idx"
  ON "official_group_receipt_intervals" ("account_id", "conversation_id", "left_at");

WITH latest_delivered AS (
  SELECT DISTINCT ON (message."conversation_id", receipt."account_id")
    message."conversation_id" AS "conversation_id",
    receipt."account_id" AS "account_id",
    message."id" AS "message_id",
    message."sent_at" AS "message_sent_at",
    receipt."delivered_at" AS "receipt_at"
  FROM "message_receipts" AS receipt
  INNER JOIN "messages" AS message
    ON message."id" = receipt."message_id"
  INNER JOIN "conversations" AS conversation
    ON conversation."id" = message."conversation_id"
  WHERE conversation."type"::text = 'GROUP'
    AND conversation."group_kind"::text = 'OFFICIAL'
    AND receipt."delivered_at" IS NOT NULL
  ORDER BY
    message."conversation_id",
    receipt."account_id",
    message."sent_at" DESC,
    message."id" DESC
)
UPDATE "conversation_participants" AS participant
SET
  "delivered_through_message_id" = latest."message_id",
  "delivered_through_sent_at" = latest."message_sent_at",
  "delivered_through_at" = latest."receipt_at"
FROM latest_delivered AS latest
WHERE participant."conversation_id" = latest."conversation_id"
  AND participant."account_id" = latest."account_id";

WITH latest_read AS (
  SELECT DISTINCT ON (message."conversation_id", receipt."account_id")
    message."conversation_id" AS "conversation_id",
    receipt."account_id" AS "account_id",
    message."id" AS "message_id",
    message."sent_at" AS "message_sent_at",
    receipt."read_at" AS "receipt_at"
  FROM "message_receipts" AS receipt
  INNER JOIN "messages" AS message
    ON message."id" = receipt."message_id"
  INNER JOIN "conversations" AS conversation
    ON conversation."id" = message."conversation_id"
  WHERE conversation."type"::text = 'GROUP'
    AND conversation."group_kind"::text = 'OFFICIAL'
    AND receipt."read_at" IS NOT NULL
  ORDER BY
    message."conversation_id",
    receipt."account_id",
    message."sent_at" DESC,
    message."id" DESC
)
UPDATE "conversation_participants" AS participant
SET
  "read_through_message_id" = latest."message_id",
  "read_through_sent_at" = latest."message_sent_at",
  "read_through_at" = latest."receipt_at"
FROM latest_read AS latest
WHERE participant."conversation_id" = latest."conversation_id"
  AND participant."account_id" = latest."account_id";

-- Preserve already-closed official-group membership windows. Future syncs append
-- one compact interval before resetting the active participant row on rejoin.
INSERT INTO "official_group_receipt_intervals" (
  "conversation_id",
  "account_id",
  "joined_at",
  "left_at",
  "delivered_through_message_id",
  "delivered_through_sent_at",
  "delivered_through_at",
  "read_through_message_id",
  "read_through_sent_at",
  "read_through_at"
)
SELECT
  participant."conversation_id",
  participant."account_id",
  participant."joined_at",
  participant."left_at",
  participant."delivered_through_message_id",
  participant."delivered_through_sent_at",
  participant."delivered_through_at",
  participant."read_through_message_id",
  participant."read_through_sent_at",
  participant."read_through_at"
FROM "conversation_participants" AS participant
INNER JOIN "conversations" AS conversation
  ON conversation."id" = participant."conversation_id"
WHERE conversation."type"::text = 'GROUP'
  AND conversation."group_kind"::text = 'OFFICIAL'
  AND participant."left_at" IS NOT NULL;

CREATE INDEX "conversation_participants_delivery_watermark_idx"
  ON "conversation_participants" (
    "conversation_id",
    "left_at",
    "delivered_through_sent_at",
    "delivered_through_message_id"
  );

CREATE INDEX "conversation_participants_read_watermark_idx"
  ON "conversation_participants" (
    "conversation_id",
    "left_at",
    "read_through_sent_at",
    "read_through_message_id"
  );
