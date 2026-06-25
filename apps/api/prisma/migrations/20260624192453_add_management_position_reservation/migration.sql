/*
  Warnings:

  - A unique constraint covering the columns `[reserved_by_account_request_id]` on the table `management_positions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "account_requests" ADD COLUMN     "management_position_id" UUID;

-- AlterTable
