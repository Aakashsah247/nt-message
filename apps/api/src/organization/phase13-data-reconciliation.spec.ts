import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260913021500_reconcile_phase13_legacy_data',
    'migration.sql',
  ),
  'utf8',
);

describe('Phase 13 checkpoint 18 legacy-data reconciliation', () => {
  it('is additive/non-destructive and keeps rollback data until checkpoint 20', () => {
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(migration).not.toMatch(/\bTRUNCATE\b/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it('reconciles employee and account-request V3 placement', () => {
    expect(migration).toContain('INSERT INTO "org_memberships"');
    expect(migration).toContain("'PRIMARY'::\"OrgMembershipType\"");
    expect(migration).toContain('UPDATE "account_requests" request');
    expect(migration).toContain('"intended_org_unit_id" = mapping."org_unit_id"');
  });

  it('reconciles every active Duty scope to Office and OrgUnit', () => {
    for (const table of [
      'duty_shift_templates',
      'duty_schedule_series',
      'duty_assignments',
      'duty_coverage_requirements',
      'duty_exceptions',
      'duty_holidays',
    ]) {
      expect(migration).toContain(`UPDATE "${table}"`);
    }
    expect(migration).toContain('"operational_team_id" = COALESCE');
  });

  it('converts historical communication scopes to native V3 values', () => {
    expect(migration).toContain(
      '"official_scope_type" = \'ORG_UNIT\'::"OfficialGroupScopeType"',
    );
    expect(migration).toContain(
      '"official_scope_type" = \'OFFICE\'::"OfficialGroupScopeType"',
    );
    expect(migration).toContain(
      '"audience_type" = \'ORG_UNIT\'::"AnnouncementAudienceType"',
    );
    expect(migration).toContain(
      '"audience_type" = \'OFFICE\'::"AnnouncementAudienceType"',
    );
    expect(migration).toContain('"official_division_id" = NULL');
    expect(migration).toContain('"official_department_id" = NULL');
  });

  it('fails closed if any core V3 reconciliation gap remains', () => {
    expect(migration).toContain(
      'employee without V3 primary membership history',
    );
    expect(migration).toContain(
      'Work row without complete V3 runtime context',
    );
    expect(migration).toContain(
      'active account request without V3 scope',
    );
    expect(migration).toContain(
      'Duty data still contains unreconciled V3 scope',
    );
    expect(migration).toContain(
      'legacy Official Group scope value remains',
    );
    expect(migration).toContain(
      'legacy Announcement audience value remains',
    );
  });
});
