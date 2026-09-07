ALTER TABLE "work_stages"
  ADD COLUMN "due_soon_notified_at" TIMESTAMPTZ(3),
  ADD COLUMN "overdue_notified_at" TIMESTAMPTZ(3);

CREATE INDEX "work_stages_deadline_notice_idx"
  ON "work_stages"("status", "due_at", "due_soon_notified_at", "overdue_notified_at");
