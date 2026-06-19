/*
  Warnings:

  - The values [ADMIN] on the enum `AccountRole` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AccountRole_new" AS ENUM ('SUPER_ADMIN', 'SENIOR_MANAGEMENT', 'TEAM_MANAGER', 'EMPLOYEE');
ALTER TABLE "accounts" ALTER COLUMN "role" TYPE "AccountRole_new" USING ("role"::text::"AccountRole_new");
ALTER TYPE "AccountRole" RENAME TO "AccountRole_old";
ALTER TYPE "AccountRole_new" RENAME TO "AccountRole";
DROP TYPE "public"."AccountRole_old";
COMMIT;
