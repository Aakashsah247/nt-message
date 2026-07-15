CREATE TABLE "group_invitation_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "token" VARCHAR(96) NOT NULL,
    "created_by_account_id" UUID NOT NULL,
    "revoked_by_account_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "group_invitation_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_invitation_links_token_key" ON "group_invitation_links"("token");
CREATE UNIQUE INDEX "group_invitation_links_one_active_per_conversation_key" ON "group_invitation_links"("conversation_id") WHERE "revoked_at" IS NULL;
CREATE INDEX "group_invitation_links_conversation_active_idx" ON "group_invitation_links"("conversation_id", "revoked_at", "created_at");
CREATE INDEX "group_invitation_links_created_by_idx" ON "group_invitation_links"("created_by_account_id", "created_at");
CREATE INDEX "group_invitation_links_revoked_by_idx" ON "group_invitation_links"("revoked_by_account_id", "revoked_at");

ALTER TABLE "group_invitation_links"
ADD CONSTRAINT "group_invitation_links_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_invitation_links"
ADD CONSTRAINT "group_invitation_links_created_by_account_id_fkey"
FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "group_invitation_links"
ADD CONSTRAINT "group_invitation_links_revoked_by_account_id_fkey"
FOREIGN KEY ("revoked_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
