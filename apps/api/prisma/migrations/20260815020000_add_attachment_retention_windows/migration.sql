-- Phase 2A: add logical attachment retention windows without deleting any file.
-- Existing message attachments inherit the finalized NT Message defaults:
-- private chat 90 days, personal group 30 days, official group 30 days.
-- Existing published announcement attachments use 90 days from the later of
-- publication time or attachment creation time. Draft announcement attachments
-- remain unexpired until the announcement is published.

ALTER TABLE "message_attachments"
  ADD COLUMN "expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "expired_at" TIMESTAMPTZ(3);

UPDATE "message_attachments" AS ma
SET "expires_at" =
  ma."created_at" +
  CASE
    WHEN c."type"::text = 'PRIVATE' THEN INTERVAL '90 days'
    WHEN c."type"::text = 'GROUP' AND c."group_kind"::text = 'OFFICIAL' THEN INTERVAL '30 days'
    ELSE INTERVAL '30 days'
  END
FROM "messages" AS m
INNER JOIN "conversations" AS c
  ON c."id" = m."conversation_id"
WHERE m."id" = ma."message_id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "message_attachments"
    WHERE "expires_at" IS NULL
  ) THEN
    RAISE EXCEPTION 'Could not assign retention expiry to every message attachment.';
  END IF;
END
$$;

ALTER TABLE "message_attachments"
  ALTER COLUMN "expires_at" SET NOT NULL;

CREATE INDEX "message_attachments_expiry_idx"
  ON "message_attachments" ("expires_at", "expired_at");

ALTER TABLE "announcement_attachments"
  ADD COLUMN "expires_at" TIMESTAMPTZ(3),
  ADD COLUMN "expired_at" TIMESTAMPTZ(3);

UPDATE "announcement_attachments" AS aa
SET "expires_at" =
  GREATEST(a."published_at", aa."created_at") + INTERVAL '90 days'
FROM "announcements" AS a
WHERE a."id" = aa."announcement_id"
  AND a."published_at" IS NOT NULL;

CREATE INDEX "announcement_attachments_expiry_idx"
  ON "announcement_attachments" ("expires_at", "expired_at");
