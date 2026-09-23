import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function migration(name: string): string {
  return readFileSync(
    join(process.cwd(), 'prisma', 'migrations', name, 'migration.sql'),
    'utf8',
  );
}

describe('classic Work cutover migration safety', () => {
  const restore = migration(
    '20260919040000_restore_classic_work_management_v3',
  );
  const templates = migration('20260919043000_canonical_work_type_templates');
  const removeRuntime = migration(
    '20260919044000_remove_v3_work_runtime_discriminator',
  );

  it('uses only the Phase-13/V3 Work schema and never resurrects deleted WM-V2 columns', () => {
    for (const retired of [
      '"type"',
      '"division_id"',
      '"department_id"',
      '"assigned_team_id"',
      '"responsible_manager_account_id"',
    ]) {
      expect(restore).not.toContain(retired);
    }
    expect(restore).toContain('"work_type_version_id" IS NOT NULL');
    expect(restore).toContain('"primary_owner_org_unit_id" IS NOT NULL');
    expect(restore).toContain('"assigned_operational_team_id"');
  });

  it('retires V3 WorkItem constraints before converting native runtime rows', () => {
    const dropContext = restore.indexOf(
      'DROP CONSTRAINT IF EXISTS "work_items_v3_context_complete_check"',
    );
    const conversionCte = restore.indexOf('WITH execution_state AS (');
    const statusUpdate = restore.indexOf('UPDATE "work_items" item\nSET');

    expect(dropContext).toBeGreaterThanOrEqual(0);
    expect(conversionCte).toBeGreaterThan(dropContext);
    expect(statusUpdate).toBeGreaterThanOrEqual(0);
  });

  it('preserves existing classic Work statuses and assignments', () => {
    expect(restore).not.toContain('DELETE FROM "work_assignments"');
    expect(restore).toContain(
      `WHERE item."status" = 'V3_RUNTIME'::"WorkItemStatus"`,
    );
    expect(restore).not.toContain(`OR item."runtime_status" IS NOT NULL`);
  });

  it('projects V3 intake, Sales, execution assignments and completion submissions into classic records', () => {
    expect(restore).toContain(`definition."code" = 'REGISTERED_AT'`);
    expect(restore).toContain(`stage."code" = 'SALES_COORDINATION'`);
    expect(restore).toContain(`stage."code" = 'EXECUTION'`);
    expect(restore).toContain('INSERT INTO "work_completion_reports"');
    expect(restore).toContain('submission."values_snapshot"');
  });

  it('keeps Office/Work Type/OrgUnit identity complete without runtime-status coupling', () => {
    expect(restore).toContain(
      'CONSTRAINT "work_items_org_context_complete_check"',
    );
    expect(restore).toContain('"office_id" IS NOT NULL');
    expect(restore).toContain('"work_type_version_id" IS NOT NULL');
    expect(restore).toContain('"primary_owner_org_unit_id" IS NOT NULL');
  });

  it('recovers canonical Main Team only from EXECUTION PRIMARY team responsibility', () => {
    expect(restore).toContain(`stage."code" = 'EXECUTION'`);
    expect(restore).toContain(`assignment."assignment_role" = 'PRIMARY'`);
    expect(restore).toContain('WITH expected_team AS (');
    expect(restore).toContain('SELECT DISTINCT ON (stage."work_item_id")');
  });

  it('maps V3 completion review states to the classic lifecycle without treating generic WAITING as help', () => {
    expect(restore).toContain(
      `source.execution_status IN ('SUBMITTED'::"WorkStageStatus", 'COMPLETED'::"WorkStageStatus")`,
    );
    expect(restore).toContain(
      `THEN 'COMPLETED_PENDING_REVIEW'::"WorkItemStatus"`,
    );
    expect(restore).toContain(
      `source.execution_status = 'RETURNED'::"WorkStageStatus"`,
    );
    expect(restore).toContain(`THEN 'REOPENED'::"WorkItemStatus"`);
    expect(restore).not.toContain(`WHEN 'WAITING' THEN 'HELP_REQUESTED'`);
  });

  it('backfills an eligible formal hierarchy reviewer without mixing reviewer and performer roles', () => {
    expect(restore).toContain('WITH reviewer_candidates AS (');
    expect(restore).toContain(`'OFFICE_HEAD'::"OrgLeadershipType"`);
    expect(restore).toContain(`'ORG_UNIT_HEAD'::"OrgLeadershipType"`);
    expect(restore).toContain('FROM "operational_team_members" member');
    expect(restore).toContain('FROM "work_assignments" assignment');
  });

  it('persists one of the three canonical fixed Work Type templates', () => {
    expect(templates).toContain("'ADMINISTRATIVE'");
    expect(templates).toContain("'TEAM_SALES'");
    expect(templates).toContain("'STANDARD'");
  });

  it('retires the obsolete collaboration trigger before replacing WorkItemStatus', () => {
    const dropTrigger = removeRuntime.indexOf(
      'DROP TRIGGER IF EXISTS "work_collaboration_requests_integrity_trigger"',
    );
    const dropFunction = removeRuntime.indexOf(
      'DROP FUNCTION IF EXISTS "enforce_work_collaboration_request_integrity"()',
    );
    const renameEnum = removeRuntime.indexOf(
      'ALTER TYPE "WorkItemStatus" RENAME TO "WorkItemStatus_retired_v3"',
    );

    expect(dropTrigger).toBeGreaterThanOrEqual(0);
    expect(dropFunction).toBeGreaterThan(dropTrigger);
    expect(renameEnum).toBeGreaterThan(dropFunction);
  });

  it('migrates every real WorkItemStatus column and never references a fake WorkEvent previous_status', () => {
    expect(removeRuntime).toContain('UPDATE "work_help_requests"');
    expect(removeRuntime).toContain(
      'ALTER TABLE "work_help_requests"\n  ALTER COLUMN "previous_status" TYPE "WorkItemStatus"',
    );
    expect(removeRuntime).not.toContain(
      'UPDATE "work_events"\nSET "previous_status"',
    );
    expect(removeRuntime).not.toContain(
      'ALTER TABLE "work_events"\n  ALTER COLUMN "previous_status"',
    );
  });

  it('preserves historical V3 Work tables while removing only the active discriminator', () => {
    expect(removeRuntime).toContain(
      'ALTER TABLE "work_items" DROP COLUMN IF EXISTS "runtime_status"',
    );
    expect(removeRuntime).not.toMatch(
      /DROP TABLE\s+"work_(stages|events|collaboration_requests)"/,
    );
  });
});
