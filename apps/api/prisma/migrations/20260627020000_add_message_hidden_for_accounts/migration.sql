CREATE TABLE "message_hidden_for_accounts" (
    "message_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "hidden_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_hidden_for_accounts_pkey" PRIMARY KEY ("message_id", "account_id")
);

CREATE INDEX "message_hidden_for_accounts_account_hidden_idx"
ON "message_hidden_for_accounts"("account_id", "hidden_at");

ALTER TABLE "message_hidden_for_accounts"
ADD CONSTRAINT "message_hidden_for_accounts_message_id_fkey"
FOREIGN KEY ("message_id") REFERENCES "messages"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_hidden_for_accounts"
ADD CONSTRAINT "message_hidden_for_accounts_account_id_fkey"
FOREIGN KEY ("account_id") REFERENCES "accounts"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
