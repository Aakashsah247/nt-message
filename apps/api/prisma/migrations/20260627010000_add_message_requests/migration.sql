-- CreateEnum
CREATE TYPE "MessageRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "MessageRequestReason" AS ENUM ('PROTECTED_RECIPIENT', 'CROSS_DEPARTMENT', 'CROSS_DIVISION');

-- CreateTable
CREATE TABLE "message_requests" (
    "id" UUID NOT NULL,
    "participant_key" VARCHAR(73) NOT NULL,
    "requester_account_id" UUID NOT NULL,
    "recipient_account_id" UUID NOT NULL,
    "blocked_by_account_id" UUID,
    "conversation_id" UUID,
    "status" "MessageRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reason" "MessageRequestReason" NOT NULL,
    "request_count" INTEGER NOT NULL DEFAULT 1,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "message_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "message_requests_participant_key_key" ON "message_requests"("participant_key");

-- CreateIndex
CREATE UNIQUE INDEX "message_requests_conversation_id_key" ON "message_requests"("conversation_id");

-- CreateIndex
CREATE INDEX "message_requests_requester_status_idx" ON "message_requests"("requester_account_id", "status", "requested_at");

-- CreateIndex
CREATE INDEX "message_requests_recipient_status_idx" ON "message_requests"("recipient_account_id", "status", "requested_at");

-- CreateIndex
CREATE INDEX "message_requests_blocked_by_idx" ON "message_requests"("blocked_by_account_id");

-- AddForeignKey
ALTER TABLE "message_requests" ADD CONSTRAINT "message_requests_requester_account_id_fkey" FOREIGN KEY ("requester_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_requests" ADD CONSTRAINT "message_requests_recipient_account_id_fkey" FOREIGN KEY ("recipient_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_requests" ADD CONSTRAINT "message_requests_blocked_by_account_id_fkey" FOREIGN KEY ("blocked_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_requests" ADD CONSTRAINT "message_requests_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A request must always connect two different accounts.
ALTER TABLE "message_requests"
ADD CONSTRAINT "message_requests_distinct_accounts_check"
CHECK ("requester_account_id" <> "recipient_account_id");

-- Repeated requests are counted from one and cannot become negative.
ALTER TABLE "message_requests"
ADD CONSTRAINT "message_requests_count_check"
CHECK ("request_count" >= 1);

-- Request response time cannot precede the most recent request time.
ALTER TABLE "message_requests"
ADD CONSTRAINT "message_requests_dates_check"
CHECK (
  "responded_at" IS NULL
  OR "responded_at" >= "requested_at"
);

-- Request lifecycle fields must agree with the current status.
ALTER TABLE "message_requests"
ADD CONSTRAINT "message_requests_status_fields_check"
CHECK (
  (
    "status" = 'PENDING'
    AND "responded_at" IS NULL
    AND "blocked_by_account_id" IS NULL
    AND "conversation_id" IS NULL
  )
  OR
  (
    "status" = 'ACCEPTED'
    AND "responded_at" IS NOT NULL
    AND "blocked_by_account_id" IS NULL
    AND "conversation_id" IS NOT NULL
  )
  OR
  (
    "status" = 'DECLINED'
    AND "responded_at" IS NOT NULL
    AND "blocked_by_account_id" IS NULL
    AND "conversation_id" IS NULL
  )
  OR
  (
    "status" = 'BLOCKED'
    AND "responded_at" IS NOT NULL
    AND "blocked_by_account_id" = "recipient_account_id"
    AND "conversation_id" IS NULL
  )
);
