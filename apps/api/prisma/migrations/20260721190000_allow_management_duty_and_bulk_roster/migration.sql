-- Management duties can belong to a division without being attached to one department.
ALTER TABLE "duty_schedule_series"
ALTER COLUMN "department_id" DROP NOT NULL;

ALTER TABLE "duty_assignments"
ALTER COLUMN "department_id" DROP NOT NULL;

ALTER TABLE "duty_exceptions"
ALTER COLUMN "department_id" DROP NOT NULL;
