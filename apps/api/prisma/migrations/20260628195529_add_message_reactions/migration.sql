CREATE TABLE IF NOT EXISTS "message_reactions" (
  "message_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "reaction_value" VARCHAR(20) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "message_reactions_pkey"
  PRIMARY KEY ("message_id","account_id")
);

CREATE INDEX IF NOT EXISTS
"message_reactions_message_idx"
ON "message_reactions"("message_id");

CREATE INDEX IF NOT EXISTS
"message_reactions_account_idx"
ON "message_reactions"("account_id");

ALTER TABLE "message_reactions"
ADD CONSTRAINT "message_reactions_message_id_fkey"
FOREIGN KEY ("message_id")
REFERENCES "messages"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "message_reactions"
ADD CONSTRAINT "message_reactions_account_id_fkey"
FOREIGN KEY ("account_id")
REFERENCES "accounts"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
