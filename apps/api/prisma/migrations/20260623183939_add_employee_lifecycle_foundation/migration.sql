-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'RESIGNED', 'RETIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "EmployeeLifecycleActionType" AS ENUM ('SUSPENDED', 'REACTIVATED', 'RESIGNED', 'RETIRED', 'TERMINATED', 'ARCHIVED', 'UNARCHIVED', 'TRANSFERRED', 'PROMOTED', 'DEMOTED', 'REHIRED');

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "archived_at" TIMESTAMPTZ(3),
ADD COLUMN     "employment_end_reason" VARCHAR(500),
ADD COLUMN     "employment_ended_at" TIMESTAMPTZ(3),
ADD COLUMN     "employment_status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "employee_lifecycle_actions" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "actor_account_id" UUID NOT NULL,
    "action" "EmployeeLifecycleActionType" NOT NULL,
    "previous_employee_status" "EmployeeStatus",
    "new_employee_status" "EmployeeStatus",
    "previous_employment_status" "EmploymentStatus",
    "new_employment_status" "EmploymentStatus",
    "reason" VARCHAR(500),
    "effective_at" TIMESTAMPTZ(3),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_lifecycle_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_lifecycle_actions_employee_created_idx" ON "employee_lifecycle_actions"("employee_id", "created_at");

-- CreateIndex
CREATE INDEX "employee_lifecycle_actions_actor_created_idx" ON "employee_lifecycle_actions"("actor_account_id", "created_at");

-- CreateIndex
CREATE INDEX "employee_lifecycle_actions_action_idx" ON "employee_lifecycle_actions"("action");

-- CreateIndex
CREATE INDEX "employees_employment_status_idx" ON "employees"("employment_status");

-- CreateIndex
CREATE INDEX "employees_archived_at_idx" ON "employees"("archived_at");

-- AddForeignKey
ALTER TABLE "employee_lifecycle_actions" ADD CONSTRAINT "employee_lifecycle_actions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_lifecycle_actions" ADD CONSTRAINT "employee_lifecycle_actions_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
