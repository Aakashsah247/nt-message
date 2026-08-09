-- Linked work keeps higher-level responsibilities separate from delegated operational tasks.
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'DELEGATED';

ALTER TABLE "work_items"
ADD COLUMN "parent_work_item_id" UUID;

-- Division-level responsibilities assigned to Senior Management do not belong to one department.
ALTER TABLE "work_items"
ALTER COLUMN "department_id" DROP NOT NULL;

ALTER TABLE "work_items"
ADD CONSTRAINT "work_items_parent_work_item_id_fkey"
FOREIGN KEY ("parent_work_item_id") REFERENCES "work_items"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "work_items_parent_status_due_idx"
ON "work_items"("parent_work_item_id", "status", "due_at");
