-- Conversation favorites are per-participant personal organization state.
ALTER TABLE "conversation_participants"
ADD COLUMN "is_favorite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "favorited_at" TIMESTAMPTZ(3);

CREATE INDEX "conversation_participants_account_favorite_idx"
ON "conversation_participants"("account_id", "left_at", "is_favorite", "favorited_at");
