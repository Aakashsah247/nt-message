-- CreateEnum
CREATE TYPE "AccountRole" AS ENUM ('ADMIN', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('ACCOUNT_ACTIVATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "emp_id" VARCHAR(50) NOT NULL,
    "emp_name" VARCHAR(150) NOT NULL,
    "phone_number" VARCHAR(20) NOT NULL,
    "official_email" VARCHAR(255) NOT NULL,
    "department" VARCHAR(120),
    "designation" VARCHAR(120),
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_activated" BOOLEAN NOT NULL DEFAULT false,
    "profile_photo_key" VARCHAR(500),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "employee_id" UUID,
    "username" VARCHAR(80),
    "role" "AccountRole" NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_verifications" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "otp_hash" VARCHAR(255) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_emp_id_key" ON "employees"("emp_id");

-- CreateIndex
CREATE UNIQUE INDEX "employees_official_email_key" ON "employees"("official_email");

-- CreateIndex
CREATE INDEX "employees_emp_name_idx" ON "employees"("emp_name");

-- CreateIndex
CREATE INDEX "employees_department_idx" ON "employees"("department");

-- CreateIndex
CREATE INDEX "employees_status_idx" ON "employees"("status");

-- CreateIndex
CREATE UNIQUE INDEX "employees_emp_id_phone_number_key" ON "employees"("emp_id", "phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_employee_id_key" ON "accounts"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_username_key" ON "accounts"("username");

-- CreateIndex
CREATE INDEX "accounts_role_idx" ON "accounts"("role");

-- CreateIndex
CREATE INDEX "accounts_is_enabled_idx" ON "accounts"("is_enabled");

-- CreateIndex
CREATE INDEX "otp_employee_purpose_created_idx" ON "otp_verifications"("employee_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "otp_expires_at_idx" ON "otp_verifications"("expires_at");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_verifications" ADD CONSTRAINT "otp_verifications_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
