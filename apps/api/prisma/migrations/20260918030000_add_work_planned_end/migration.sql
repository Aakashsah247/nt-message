-- Part 2 scheduling correction: keep SLA due time platform-owned while adding
-- a separate editable planned finishing time for every Work Type.
ALTER TABLE "work_items"
  ADD COLUMN "planned_end_at" TIMESTAMPTZ(3);

CREATE INDEX "work_items_planned_end_at_idx"
  ON "work_items"("planned_end_at");
