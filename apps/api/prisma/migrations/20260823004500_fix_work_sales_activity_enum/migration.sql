-- WM-V2-FINAL hotfix: keep PostgreSQL WorkActivityAction in sync with Prisma.
-- WM-V2-4A added these values to schema.prisma, but the original migration
-- did not alter the already-existing PostgreSQL enum.
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'SALES_DOCUMENTS_SENT';
ALTER TYPE "WorkActivityAction" ADD VALUE IF NOT EXISTS 'SALES_WORK_COMPLETED';

