-- M19: personal clear/delete actions are auditable without recording message content.
ALTER TYPE "ActivityEventType" ADD VALUE 'CHAT_CLEARED';
ALTER TYPE "ActivityEventType" ADD VALUE 'CHAT_DELETED';

-- These fields belong to the participant, not the canonical conversation.
-- Clearing or deleting a chat must never remove another participant's history.
ALTER TABLE "conversation_participants"
  ADD COLUMN "history_cleared_at" TIMESTAMPTZ(3),
  ADD COLUMN "deleted_from_list_at" TIMESTAMPTZ(3);

CREATE INDEX "conversation_participants_account_deleted_idx"
  ON "conversation_participants"("account_id", "left_at", "deleted_from_list_at");

CREATE INDEX "conversation_participants_history_cleared_idx"
  ON "conversation_participants"("conversation_id", "history_cleared_at");
