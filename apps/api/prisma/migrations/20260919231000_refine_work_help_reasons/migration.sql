-- Refine the classic Need Help workflow without rewriting historical requests.
-- SAFETY_CONCERN remains in the enum only so historical rows stay readable; new writes are rejected in service validation.

ALTER TYPE "WorkHelpReason" ADD VALUE IF NOT EXISTS 'FAP_MAINTENANCE';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'WorkHelpMaterialType') THEN
    CREATE TYPE "WorkHelpMaterialType" AS ENUM ('STB', 'CPE', 'DROP_FIBER');
  END IF;
END $$;

ALTER TABLE "work_help_requests"
  ADD COLUMN IF NOT EXISTS "material_type" "WorkHelpMaterialType";
