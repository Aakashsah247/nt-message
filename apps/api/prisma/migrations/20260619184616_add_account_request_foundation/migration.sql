-- CreateEnum
CREATE TYPE "AccountRequestStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ACTIVATION_PENDING', 'ACTIVATED');

-- CreateEnum
CREATE TYPE "AccountRequestActionType" AS ENUM ('CREATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RESUBMITTED', 'ACTIVATION_STARTED', 'ACTIVATED');

-- CreateTable
CREATE TABLE "account_requests" (
    "id" UUID NOT NULL,
    "emp_id" VARCHAR(50) NOT NULL,
    "emp_name" VARCHAR(150) NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "official_email" VARCHAR(255) NOT NULL,
    "designation" VARCHAR(120),
    "requested_role" "AccountRole" NOT NULL,
    "division_id" UUID,
    "department_id" UUID,
    "employee_id" UUID,
    "requested_by_account_id" UUID NOT NULL,
    "reviewed_by_account_id" UUID,
    "previous_request_id" UUID,
    "revision_number" INTEGER NOT NULL DEFAULT 1,
    "status" "AccountRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "rejection_reason" VARCHAR(500),
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "account_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_request_actions" (
    "id" UUID NOT NULL,
    "account_request_id" UUID NOT NULL,
    "actor_account_id" UUID NOT NULL,
    "action" "AccountRequestActionType" NOT NULL,
    "reason" VARCHAR(500),
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_request_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "account_requests_status_created_idx" ON "account_requests"("status", "created_at");

-- CreateIndex
CREATE INDEX "account_requests_requester_status_idx" ON "account_requests"("requested_by_account_id", "status");

-- CreateIndex
CREATE INDEX "account_requests_reviewer_idx" ON "account_requests"("reviewed_by_account_id");

-- CreateIndex
CREATE INDEX "account_requests_requested_role_idx" ON "account_requests"("requested_role");

-- CreateIndex
CREATE INDEX "account_requests_emp_id_idx" ON "account_requests"("emp_id");

-- CreateIndex
CREATE INDEX "account_requests_official_email_idx" ON "account_requests"("official_email");

-- CreateIndex
CREATE INDEX "account_requests_org_scope_idx" ON "account_requests"("division_id", "department_id");

-- CreateIndex
CREATE INDEX "account_requests_employee_idx" ON "account_requests"("employee_id");

-- CreateIndex
CREATE INDEX "account_requests_previous_request_idx" ON "account_requests"("previous_request_id");

-- CreateIndex
CREATE INDEX "account_request_actions_request_created_idx" ON "account_request_actions"("account_request_id", "created_at");

-- CreateIndex
CREATE INDEX "account_request_actions_actor_created_idx" ON "account_request_actions"("actor_account_id", "created_at");

-- CreateIndex
CREATE INDEX "account_request_actions_action_idx" ON "account_request_actions"("action");

-- AddForeignKey
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_requested_by_account_id_fkey" FOREIGN KEY ("requested_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_reviewed_by_account_id_fkey" FOREIGN KEY ("reviewed_by_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_previous_request_id_fkey" FOREIGN KEY ("previous_request_id") REFERENCES "account_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_request_actions" ADD CONSTRAINT "account_request_actions_account_request_id_fkey" FOREIGN KEY ("account_request_id") REFERENCES "account_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_request_actions" ADD CONSTRAINT "account_request_actions_actor_account_id_fkey" FOREIGN KEY ("actor_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
