-- M20 retention preparation: active queue, recent history, read-only archive and deletion review.
-- Permanent deletion remains intentionally unavailable until a platform operator role is introduced.
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'RETENTION_HOLD_APPLIED';
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'RETENTION_HOLD_RELEASED';
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'DELETION_REVIEW_REQUESTED';
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'DELETION_REVIEW_CANCELLED';

ALTER TABLE "work_items"
  ADD COLUMN "cancelled_at" TIMESTAMPTZ(3),
  ADD COLUMN "archive_eligible_at" TIMESTAMPTZ(3),
  ADD COLUMN "deletion_eligible_at" TIMESTAMPTZ(3),
  ADD COLUMN "retention_hold_at" TIMESTAMPTZ(3),
  ADD COLUMN "retention_hold_reason" VARCHAR(500),
  ADD COLUMN "retention_hold_by_account_id" UUID,
  ADD COLUMN "deletion_requested_at" TIMESTAMPTZ(3),
  ADD COLUMN "deletion_request_reason" VARCHAR(500),
  ADD COLUMN "deletion_requested_by_account_id" UUID;

-- Existing terminal work receives deterministic policy dates without changing its lifecycle status.
UPDATE "work_items"
SET
  "closed_at" = CASE
    WHEN "status" = 'CLOSED' THEN COALESCE("closed_at", "updated_at")
    ELSE "closed_at"
  END,
  "cancelled_at" = CASE
    WHEN "status" = 'CANCELLED' THEN COALESCE("cancelled_at", "updated_at")
    ELSE "cancelled_at"
  END,
  "archive_eligible_at" = CASE
    WHEN "status" = 'CLOSED' THEN COALESCE("closed_at", "updated_at") + INTERVAL '1 year'
    WHEN "status" = 'CANCELLED' THEN COALESCE("cancelled_at", "updated_at") + INTERVAL '1 year'
    ELSE NULL
  END,
  "deletion_eligible_at" = CASE
    WHEN "status" = 'CLOSED' THEN COALESCE("closed_at", "updated_at") + INTERVAL '3 years'
    WHEN "status" = 'CANCELLED' THEN COALESCE("cancelled_at", "updated_at") + INTERVAL '3 years'
    ELSE NULL
  END;

ALTER TABLE "work_items"
  ADD CONSTRAINT "work_items_retention_hold_by_account_id_fkey"
    FOREIGN KEY ("retention_hold_by_account_id") REFERENCES "accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_items_deletion_requested_by_account_id_fkey"
    FOREIGN KEY ("deletion_requested_by_account_id") REFERENCES "accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "work_items_retention_hold_complete_check"
    CHECK (
      ("retention_hold_at" IS NULL AND "retention_hold_reason" IS NULL AND "retention_hold_by_account_id" IS NULL)
      OR
      ("retention_hold_at" IS NOT NULL AND "retention_hold_reason" IS NOT NULL AND "retention_hold_by_account_id" IS NOT NULL)
    ),
  ADD CONSTRAINT "work_items_deletion_request_complete_check"
    CHECK (
      ("deletion_requested_at" IS NULL AND "deletion_request_reason" IS NULL AND "deletion_requested_by_account_id" IS NULL)
      OR
      ("deletion_requested_at" IS NOT NULL AND "deletion_request_reason" IS NOT NULL AND "deletion_requested_by_account_id" IS NOT NULL)
    );

CREATE INDEX "work_items_archive_eligible_status_idx"
  ON "work_items"("archive_eligible_at", "status");
CREATE INDEX "work_items_deletion_eligible_hold_idx"
  ON "work_items"("deletion_eligible_at", "retention_hold_at");
CREATE INDEX "work_items_deletion_requested_idx"
  ON "work_items"("deletion_requested_at");
