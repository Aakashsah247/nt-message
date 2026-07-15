-- M6B: hierarchy-safe personal blocking.
-- Blocks affect personal/private messaging only. Official hierarchy communication remains unaffected.

CREATE TABLE IF NOT EXISTS "messaging_account_blocks" (
  "blocker_account_id" UUID NOT NULL,
  "blocked_account_id" UUID NOT NULL,
  "reason" VARCHAR(240),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "messaging_account_blocks_pkey"
    PRIMARY KEY ("blocker_account_id", "blocked_account_id"),

  CONSTRAINT "messaging_account_blocks_blocker_account_id_fkey"
    FOREIGN KEY ("blocker_account_id")
    REFERENCES "accounts"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT "messaging_account_blocks_blocked_account_id_fkey"
    FOREIGN KEY ("blocked_account_id")
    REFERENCES "accounts"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE,

  CONSTRAINT "messaging_account_blocks_no_self_block_chk"
    CHECK ("blocker_account_id" <> "blocked_account_id")
);

CREATE INDEX IF NOT EXISTS "messaging_account_blocks_blocked_created_idx"
ON "messaging_account_blocks"("blocked_account_id", "created_at");

CREATE INDEX IF NOT EXISTS "messaging_account_blocks_blocker_created_idx"
ON "messaging_account_blocks"("blocker_account_id", "created_at");
