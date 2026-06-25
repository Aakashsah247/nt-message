/*
  Warnings:

  - A unique constraint covering the columns `[phone_number]` on the table `employees` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "employees_emp_id_phone_number_key";

-- CreateIndex
CREATE INDEX "account_requests_phone_number_idx" ON "account_requests"("phone_number");

-- CreateIndex
CREATE UNIQUE INDEX "employees_phone_number_key" ON "employees"("phone_number");
