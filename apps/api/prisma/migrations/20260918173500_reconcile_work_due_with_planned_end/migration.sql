-- Scheduling parity with the finalized Work Management model:
-- due_at is the single planned finishing/deadline timestamp.
-- Preserve any value entered through the temporary planned_end_at field by
-- copying it into due_at before the runtime stops using planned_end_at.
UPDATE "work_items"
SET "due_at" = "planned_end_at"
WHERE "planned_end_at" IS NOT NULL
  AND "due_at" IS DISTINCT FROM "planned_end_at";

COMMENT ON COLUMN "work_items"."planned_end_at" IS
  'Legacy compatibility only. Runtime scheduling uses due_at as the canonical planned finish/deadline.';
