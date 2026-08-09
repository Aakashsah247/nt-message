-- M20 Phase 2: complete the work-ticket lifecycle without changing existing records.
-- This migration is additive and preserves the previously applied M20 foundation.

ALTER TYPE "MessagingNotificationType" ADD VALUE IF NOT EXISTS 'WORK_ITEM';

ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'HELP_REQUESTED';
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'HELP_ACCEPTED';
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'HELP_DECLINED';
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'DETAILS_UPDATED';
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'PRIORITY_CHANGED';
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'DUE_DATE_CHANGED';

CREATE TYPE "WorkCompletionResult" AS ENUM (
  'FULLY_RESOLVED',
  'TEMPORARY_SOLUTION',
  'UNABLE_TO_RESOLVE'
);

CREATE TYPE "WorkCompletionReviewStatus" AS ENUM (
  'PENDING_REVIEW',
  'INFORMATION_REQUESTED',
  'ACCEPTED',
  'REJECTED'
);

CREATE TYPE "WorkHelpReason" AS ENUM (
  'NEED_ANOTHER_EMPLOYEE',
  'TECHNICAL_GUIDANCE',
  'TOOLS_OR_MATERIALS',
  'SAFETY_CONCERN',
  'OTHER'
);

CREATE TYPE "WorkHelpRequestStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED'
);

ALTER TABLE "work_items"
  ADD COLUMN "due_soon_notified_at" TIMESTAMPTZ(3),
  ADD COLUMN "overdue_notified_at" TIMESTAMPTZ(3);

CREATE TABLE "work_completion_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_item_id" UUID NOT NULL,
  "submitted_by_account_id" UUID NOT NULL,
  "result" "WorkCompletionResult" NOT NULL,
  "summary" TEXT NOT NULL,
  "more_work_required" BOOLEAN NOT NULL DEFAULT false,
  "review_status" "WorkCompletionReviewStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "manager_note" VARCHAR(1500),
  "reviewed_by_account_id" UUID,
  "reviewed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "work_completion_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "work_help_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "work_item_id" UUID NOT NULL,
  "requested_by_account_id" UUID NOT NULL,
  "requested_helper_account_id" UUID,
  "reason" "WorkHelpReason" NOT NULL,
  "note" VARCHAR(1000),
  "status" "WorkHelpRequestStatus" NOT NULL DEFAULT 'PENDING',
  "previous_status" "WorkItemStatus" NOT NULL,
  "responded_by_account_id" UUID,
  "response_note" VARCHAR(1000),
  "responded_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "work_help_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "work_completion_reports_item_created_idx"
ON "work_completion_reports"("work_item_id", "created_at");

CREATE INDEX "work_completion_reports_submitter_created_idx"
ON "work_completion_reports"("submitted_by_account_id", "created_at");

CREATE INDEX "work_completion_reports_review_status_created_idx"
ON "work_completion_reports"("review_status", "created_at");

CREATE INDEX "work_help_requests_item_status_created_idx"
ON "work_help_requests"("work_item_id", "status", "created_at");

CREATE INDEX "work_help_requests_requester_created_idx"
ON "work_help_requests"("requested_by_account_id", "created_at");

CREATE INDEX "work_help_requests_helper_status_created_idx"
ON "work_help_requests"("requested_helper_account_id", "status", "created_at");

-- Only one unresolved request may target the same helper for one ticket.
CREATE UNIQUE INDEX "work_help_requests_one_pending_helper_key"
ON "work_help_requests"("work_item_id", "requested_helper_account_id")
WHERE "status" = 'PENDING' AND "requested_helper_account_id" IS NOT NULL;

-- A primary employee can have only one unresolved manager-routed request per ticket.
CREATE UNIQUE INDEX "work_help_requests_one_pending_manager_request_key"
ON "work_help_requests"("work_item_id", "requested_by_account_id")
WHERE "status" = 'PENDING' AND "requested_helper_account_id" IS NULL;

ALTER TABLE "work_completion_reports"
  ADD CONSTRAINT "work_completion_reports_work_item_id_fkey"
  FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_completion_reports"
  ADD CONSTRAINT "work_completion_reports_submitted_by_account_id_fkey"
  FOREIGN KEY ("submitted_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_completion_reports"
  ADD CONSTRAINT "work_completion_reports_reviewed_by_account_id_fkey"
  FOREIGN KEY ("reviewed_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_help_requests"
  ADD CONSTRAINT "work_help_requests_work_item_id_fkey"
  FOREIGN KEY ("work_item_id") REFERENCES "work_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "work_help_requests"
  ADD CONSTRAINT "work_help_requests_requested_by_account_id_fkey"
  FOREIGN KEY ("requested_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_help_requests"
  ADD CONSTRAINT "work_help_requests_requested_helper_account_id_fkey"
  FOREIGN KEY ("requested_helper_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "work_help_requests"
  ADD CONSTRAINT "work_help_requests_responded_by_account_id_fkey"
  FOREIGN KEY ("responded_by_account_id") REFERENCES "accounts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
