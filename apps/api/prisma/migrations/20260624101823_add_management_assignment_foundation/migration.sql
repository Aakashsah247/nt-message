-- CreateEnum
CREATE TYPE "ManagementPositionType" AS ENUM ('SENIOR_MANAGEMENT', 'TEAM_MANAGER');

-- CreateTable
CREATE TABLE "management_positions" (
    "id" UUID NOT NULL,
    "position_type" "ManagementPositionType" NOT NULL,
    "division_id" UUID NOT NULL,
    "department_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "management_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "management_assignments" (
    "id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "assigned_by_account_id" UUID NOT NULL,
    "ended_by_account_id" UUID,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "assignment_reason" VARCHAR(500),
    "end_reason" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "management_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "management_positions_type_idx" ON "management_positions"("position_type");

-- CreateIndex
CREATE INDEX "management_positions_division_idx" ON "management_positions"("division_id");

-- CreateIndex
CREATE INDEX "management_positions_department_idx" ON "management_positions"("department_id");

-- CreateIndex
CREATE INDEX "management_positions_is_active_idx" ON "management_positions"("is_active");

-- CreateIndex
CREATE INDEX "management_assignments_position_ended_idx" ON "management_assignments"("position_id", "ended_at");

-- CreateIndex
CREATE INDEX "management_assignments_employee_ended_idx" ON "management_assignments"("employee_id", "ended_at");

-- CreateIndex
CREATE INDEX "management_assignments_assigned_by_idx" ON "management_assignments"("assigned_by_account_id");

-- CreateIndex
CREATE INDEX "management_assignments_ended_by_idx" ON "management_assignments"("ended_by_account_id");

-- CreateIndex
CREATE INDEX "management_assignments_started_at_idx" ON "management_assignments"("started_at");

-- AddForeignKey
ALTER TABLE "management_positions" ADD CONSTRAINT "management_positions_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management_positions" ADD CONSTRAINT "management_positions_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management_assignments" ADD CONSTRAINT "management_assignments_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "management_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management_assignments" ADD CONSTRAINT "management_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management_assignments" ADD CONSTRAINT "management_assignments_assigned_by_account_id_fkey" FOREIGN KEY ("assigned_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "management_assignments" ADD CONSTRAINT "management_assignments_ended_by_account_id_fkey" FOREIGN KEY ("ended_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Senior Management positions belong to divisions.
-- Team Manager positions belong to departments.
ALTER TABLE "management_positions"
ADD CONSTRAINT "management_positions_scope_check"
CHECK (
  (
    "position_type" = 'SENIOR_MANAGEMENT'
    AND "department_id" IS NULL
  )
  OR
  (
    "position_type" = 'TEAM_MANAGER'
    AND "department_id" IS NOT NULL
  )
);

-- Only one active Senior Management position may exist per division.
CREATE UNIQUE INDEX
"management_positions_active_senior_division_key"
ON "management_positions" ("division_id")
WHERE
  "position_type" = 'SENIOR_MANAGEMENT'
  AND "is_active" = true;

-- Only one active Team Manager position may exist per department.
CREATE UNIQUE INDEX
"management_positions_active_team_department_key"
ON "management_positions" ("department_id")
WHERE
  "position_type" = 'TEAM_MANAGER'
  AND "is_active" = true;

-- A management position can have only one current holder.
CREATE UNIQUE INDEX
"management_assignments_active_position_key"
ON "management_assignments" ("position_id")
WHERE "ended_at" IS NULL;

-- An employee can hold only one current management position.
CREATE UNIQUE INDEX
"management_assignments_active_employee_key"
ON "management_assignments" ("employee_id")
WHERE "ended_at" IS NULL;

-- Assignment end time cannot be before its start time.
ALTER TABLE "management_assignments"
ADD CONSTRAINT "management_assignments_date_check"
CHECK (
  "ended_at" IS NULL
  OR "ended_at" >= "started_at"
);
