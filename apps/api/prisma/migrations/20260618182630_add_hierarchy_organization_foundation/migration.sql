-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccountRole" ADD VALUE 'SUPER_ADMIN';
ALTER TYPE "AccountRole" ADD VALUE 'SENIOR_MANAGEMENT';
ALTER TYPE "AccountRole" ADD VALUE 'TEAM_MANAGER';

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "department_id" UUID,
ADD COLUMN     "division_id" UUID;

-- CreateTable
CREATE TABLE "divisions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "divisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "division_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "divisions_code_key" ON "divisions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "divisions_name_key" ON "divisions"("name");

-- CreateIndex
CREATE INDEX "divisions_is_active_idx" ON "divisions"("is_active");

-- CreateIndex
CREATE INDEX "departments_division_id_idx" ON "departments"("division_id");

-- CreateIndex
CREATE INDEX "departments_is_active_idx" ON "departments"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "departments_division_id_code_key" ON "departments"("division_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_division_id_name_key" ON "departments"("division_id", "name");

-- CreateIndex
CREATE INDEX "employees_division_id_idx" ON "employees"("division_id");

-- CreateIndex
CREATE INDEX "employees_department_id_idx" ON "employees"("department_id");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "divisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
