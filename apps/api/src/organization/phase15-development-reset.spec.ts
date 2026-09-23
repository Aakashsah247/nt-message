import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Phase 15 development-data reset safety lock', () => {
  const resetScript = readFileSync(
    resolve(process.cwd(), 'scripts/phase15_reset_development_data.js'),
    'utf8',
  );
  const verifier = readFileSync(
    resolve(process.cwd(), 'scripts/verify_phase15_clean_v3_foundation.js'),
    'utf8',
  );

  it('preserves identity tables and refuses production/non-local execution', () => {
    expect(resetScript).toContain("'accounts'");
    expect(resetScript).toContain("'employees'");
    expect(resetScript).toContain("'super_admin_profiles'");
    expect(resetScript).toContain('process.env.NODE_ENV');
    expect(resetScript).toContain('NODE_ENV=production');
    expect(resetScript).toContain('Refusing non-local database host');
    expect(resetScript).toContain('RESET_DUMMY_V3_DATA');
    expect(resetScript).toContain("process.argv.includes('--execute')");
  });

  it('seeds the finalized formal hierarchy types and keeps Work teams separate', () => {
    expect(resetScript).toContain("['DIVISION', 'Division'");
    expect(resetScript).toContain("['DEPARTMENT', 'Department'");
    expect(resetScript).toContain("['SECTION', 'Section'");
    expect(resetScript).toContain("['UNIT', 'Unit'");
    expect(resetScript).not.toContain("['TEAM', 'Team'");
    expect(resetScript).not.toContain("['ORGANIZATION', 'Organization'");
    expect(resetScript).not.toContain("['AREA', 'Area'");
    expect(resetScript).toContain("'PLACEMENT_PENDING'");
    expect(resetScript).toContain('false, false, $6');
    expect(resetScript).toContain('UPDATE employees SET department = NULL');
    expect(verifier).toContain(
      "code IN ('DIVISION','DEPARTMENT','SECTION','UNIT')",
    );
    expect(resetScript).toContain('non_formal_active_type_rows');
    expect(verifier).toContain('formal_type_office_gaps');
    expect(verifier).toContain('placement_pending_type_office_gaps');
  });

  it('leaves a valid V3 placement while the new hierarchy is rebuilt', () => {
    expect(resetScript).toContain("'UNASSIGNED'");
    expect(resetScript).toContain("'Placement Pending'");
    expect(resetScript).toContain("'PRIMARY'");
    expect(resetScript).toContain("'SYSTEM'");
    expect(verifier).toContain('active_membership_gaps');
  });

  it('restores the mandatory default Work Type catalog after reset', () => {
    expect(resetScript).toContain('Restoring mandatory default Work Types');
    expect(resetScript).toContain('db:ensure-default-work-types');
    expect(resetScript).toContain('work_type_definitions');
    expect(resetScript).toContain('work_type_drafts');
    expect(resetScript).toContain('work_type_fields');
    expect(resetScript).toContain('work_type_stages');
    expect(verifier).toContain('work_type_definitions');
    expect(verifier).toContain('work_type_drafts');
    expect(verifier).toContain('work_type_fields');
    expect(verifier).toContain('work_type_stages');
  });

  it('backs up the database before destructive execution', () => {
    expect(resetScript).toContain("ensurePostgresTool('pg_dump')");
    expect(resetScript).toContain("ensurePostgresTool('pg_restore')");
    expect(resetScript).toContain('nt_message_phase15_pre_dev_reset_');
    expect(resetScript).toContain('Backup verified:');
  });
});
