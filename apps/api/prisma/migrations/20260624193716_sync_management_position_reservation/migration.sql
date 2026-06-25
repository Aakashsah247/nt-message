/*
  Warnings:

  - A unique constraint covering the columns `[reserved_by_account_request_id]` on the table `management_positions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "management_positions" ADD COLUMN     "reserved_by_account_request_id" UUID;

-- CreateIndex
CREATE INDEX "account_requests_management_position_idx" ON "account_requests"("management_position_id");

-- CreateIndex
CREATE UNIQUE INDEX "management_positions_reserved_by_account_request_id_key" ON "management_positions"("reserved_by_account_request_id");

-- AddForeignKey
ALTER TABLE "management_positions" ADD CONSTRAINT "management_positions_reserved_by_account_request_id_fkey" FOREIGN KEY ("reserved_by_account_request_id") REFERENCES "account_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_requests" ADD CONSTRAINT "account_requests_management_position_id_fkey" FOREIGN KEY ("management_position_id") REFERENCES "management_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
