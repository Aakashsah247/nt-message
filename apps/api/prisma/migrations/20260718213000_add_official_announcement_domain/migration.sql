-- M13.1: official announcements are a dedicated governance resource, not ordinary chat messages.
ALTER TYPE "ActivityEventType" ADD VALUE 'ANNOUNCEMENT_DRAFT_CREATED';
ALTER TYPE "ActivityEventType" ADD VALUE 'ANNOUNCEMENT_PUBLISHED';
ALTER TYPE "ActivityEventType" ADD VALUE 'ANNOUNCEMENT_EDITED';
ALTER TYPE "ActivityEventType" ADD VALUE 'ANNOUNCEMENT_WITHDRAWN';
ALTER TYPE "ActivityEventType" ADD VALUE 'ANNOUNCEMENT_ACKNOWLEDGED';
ALTER TYPE "MessagingNotificationType" ADD VALUE 'ANNOUNCEMENT';

CREATE TYPE "AnnouncementAudienceType" AS ENUM ('ORGANIZATION', 'DIVISION', 'DEPARTMENT', 'OFFICIAL_GROUP');
CREATE TYPE "AnnouncementPriority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT', 'EMERGENCY');
CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'EXPIRED', 'WITHDRAWN');

CREATE TABLE "announcements" (
  "id" UUID NOT NULL,
  "created_by_account_id" UUID NOT NULL,
  "withdrawn_by_account_id" UUID,
  "audience_type" "AnnouncementAudienceType" NOT NULL,
  "division_id" UUID,
  "department_id" UUID,
  "official_conversation_id" UUID,
  "title" VARCHAR(160) NOT NULL DEFAULT '',
  "body" TEXT NOT NULL DEFAULT '',
  "priority" "AnnouncementPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
  "requires_acknowledgement" BOOLEAN NOT NULL DEFAULT false,
  "allow_attachment_download" BOOLEAN NOT NULL DEFAULT true,
  "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  "current_revision" INTEGER NOT NULL DEFAULT 1,
  "scheduled_at" TIMESTAMPTZ(3),
  "published_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3),
  "withdrawn_at" TIMESTAMPTZ(3),
  "publish_claimed_at" TIMESTAMPTZ(3),
  "next_publish_attempt_at" TIMESTAMPTZ(3),
  "publish_attempts" INTEGER NOT NULL DEFAULT 0,
  "publish_failure_reason" VARCHAR(500),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "announcement_revisions" (
  "id" UUID NOT NULL,
  "announcement_id" UUID NOT NULL,
  "editor_account_id" UUID NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "title" VARCHAR(160) NOT NULL,
  "body" TEXT NOT NULL,
  "priority" "AnnouncementPriority" NOT NULL,
  "requires_acknowledgement" BOOLEAN NOT NULL,
  "allow_attachment_download" BOOLEAN NOT NULL,
  "is_pinned" BOOLEAN NOT NULL,
  "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "announcement_revisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "announcement_recipients" (
  "announcement_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "delivered_at" TIMESTAMPTZ(3),
  "first_read_at" TIMESTAMPTZ(3),
  "read_revision" INTEGER,
  "acknowledged_revision" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "announcement_recipients_pkey" PRIMARY KEY ("announcement_id", "account_id")
);

CREATE TABLE "announcement_acknowledgements" (
  "id" UUID NOT NULL,
  "announcement_id" UUID NOT NULL,
  "account_id" UUID NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "acknowledged_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "announcement_acknowledgements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "announcement_attachments" (
  "id" UUID NOT NULL,
  "announcement_id" UUID NOT NULL,
  "storage_key" VARCHAR(500) NOT NULL,
  "original_file_name" VARCHAR(255) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "file_size_bytes" INTEGER NOT NULL,
  "content_category" VARCHAR(20) NOT NULL,
  "scan_status" VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  "added_revision" INTEGER NOT NULL,
  "removed_revision" INTEGER,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "announcement_attachments_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "messaging_notifications" ADD COLUMN "announcement_id" UUID;

CREATE UNIQUE INDEX "announcement_revisions_announcement_revision_key" ON "announcement_revisions"("announcement_id", "revision_number");
CREATE UNIQUE INDEX "announcement_acknowledgements_revision_key" ON "announcement_acknowledgements"("announcement_id", "account_id", "revision_number");
CREATE INDEX "announcements_creator_status_updated_idx" ON "announcements"("created_by_account_id", "status", "updated_at");
CREATE INDEX "announcements_publish_queue_idx" ON "announcements"("status", "scheduled_at", "next_publish_attempt_at");
CREATE INDEX "announcements_audience_scope_idx" ON "announcements"("audience_type", "division_id", "department_id");
CREATE INDEX "announcements_official_conversation_idx" ON "announcements"("official_conversation_id", "status", "published_at");
CREATE INDEX "announcements_published_idx" ON "announcements"("published_at");
CREATE INDEX "announcements_expires_idx" ON "announcements"("expires_at");
CREATE INDEX "announcement_revisions_editor_created_idx" ON "announcement_revisions"("editor_account_id", "created_at");
CREATE INDEX "announcement_recipients_account_created_idx" ON "announcement_recipients"("account_id", "created_at");
CREATE INDEX "announcement_recipients_ack_idx" ON "announcement_recipients"("announcement_id", "acknowledged_revision");
CREATE INDEX "announcement_acknowledgements_reporting_idx" ON "announcement_acknowledgements"("announcement_id", "revision_number", "acknowledged_at");
CREATE INDEX "announcement_acknowledgements_account_idx" ON "announcement_acknowledgements"("account_id", "acknowledged_at");
CREATE INDEX "announcement_attachments_revision_idx" ON "announcement_attachments"("announcement_id", "added_revision", "removed_revision");
CREATE INDEX "announcement_attachments_storage_key_idx" ON "announcement_attachments"("storage_key");
CREATE INDEX "announcement_attachments_category_idx" ON "announcement_attachments"("content_category");
CREATE INDEX "messaging_notifications_announcement_idx" ON "messaging_notifications"("announcement_id");

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_account_id_fkey" FOREIGN KEY ("created_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_withdrawn_by_account_id_fkey" FOREIGN KEY ("withdrawn_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_official_conversation_id_fkey" FOREIGN KEY ("official_conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcement_revisions" ADD CONSTRAINT "announcement_revisions_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_revisions" ADD CONSTRAINT "announcement_revisions_editor_account_id_fkey" FOREIGN KEY ("editor_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_recipients" ADD CONSTRAINT "announcement_recipients_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcement_acknowledgements" ADD CONSTRAINT "announcement_acknowledgements_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "announcement_acknowledgements" ADD CONSTRAINT "announcement_acknowledgements_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "announcement_attachments" ADD CONSTRAINT "announcement_attachments_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messaging_notifications" ADD CONSTRAINT "messaging_notifications_announcement_id_fkey" FOREIGN KEY ("announcement_id") REFERENCES "announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one audience target is allowed. This database check mirrors the API policy.
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_audience_target_check" CHECK (
  ("audience_type" = 'ORGANIZATION' AND "division_id" IS NULL AND "department_id" IS NULL AND "official_conversation_id" IS NULL) OR
  ("audience_type" = 'DIVISION' AND "division_id" IS NOT NULL AND "department_id" IS NULL AND "official_conversation_id" IS NULL) OR
  ("audience_type" = 'DEPARTMENT' AND "division_id" IS NOT NULL AND "department_id" IS NOT NULL AND "official_conversation_id" IS NULL) OR
  ("audience_type" = 'OFFICIAL_GROUP' AND "division_id" IS NULL AND "department_id" IS NULL AND "official_conversation_id" IS NOT NULL)
);
