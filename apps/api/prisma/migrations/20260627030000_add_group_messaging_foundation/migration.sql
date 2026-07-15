CREATE TYPE "GroupKind" AS ENUM ('PERSONAL', 'OFFICIAL');
CREATE TYPE "ConversationParticipantRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

ALTER TABLE "conversations"
ADD COLUMN "description" VARCHAR(500),
ADD COLUMN "group_kind" "GroupKind";

ALTER TABLE "conversation_participants"
ADD COLUMN "role" "ConversationParticipantRole" NOT NULL DEFAULT 'MEMBER';

UPDATE "conversations"
SET
  "group_kind" = 'PERSONAL',
  "title" = COALESCE(NULLIF(BTRIM("title"), ''), 'Existing group')
WHERE "type" = 'GROUP';

WITH "ranked_group_members" AS (
  SELECT
    "participant"."conversation_id",
    "participant"."account_id",
    ROW_NUMBER() OVER (
      PARTITION BY "participant"."conversation_id"
      ORDER BY
        CASE
          WHEN "participant"."account_id" = "conversation"."created_by_account_id"
            THEN 0
          ELSE 1
        END,
        "participant"."joined_at" ASC,
        "participant"."account_id" ASC
    ) AS "owner_rank"
  FROM "conversation_participants" AS "participant"
  INNER JOIN "conversations" AS "conversation"
    ON "conversation"."id" = "participant"."conversation_id"
  WHERE
    "conversation"."type" = 'GROUP'
    AND "participant"."left_at" IS NULL
)
UPDATE "conversation_participants" AS "participant"
SET "role" = 'OWNER'
FROM "ranked_group_members" AS "ranked"
WHERE
  "participant"."conversation_id" = "ranked"."conversation_id"
  AND "participant"."account_id" = "ranked"."account_id"
  AND "ranked"."owner_rank" = 1;

ALTER TABLE "conversations"
ADD CONSTRAINT "conversations_group_metadata_check"
CHECK (
  ("type" = 'GROUP' AND "group_kind" IS NOT NULL AND "title" IS NOT NULL)
  OR
  ("type" <> 'GROUP' AND "group_kind" IS NULL)
);

CREATE INDEX "conversations_group_kind_idx"
ON "conversations"("group_kind", "updated_at");

CREATE INDEX "conversation_participants_conversation_role_idx"
ON "conversation_participants"("conversation_id", "role", "left_at");

CREATE UNIQUE INDEX "conversation_participants_active_owner_key"
ON "conversation_participants"("conversation_id")
WHERE "role" = 'OWNER' AND "left_at" IS NULL;
