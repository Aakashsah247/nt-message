import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260909024500_add_duty_orgunit_foundation',
  'migration.sql',
);

const migration = readFileSync(migrationPath, 'utf8');

describe('Phase 11 Duty OrgUnit migration foundation', () => {
  const dutyTables = [
    'duty_shift_templates',
    'duty_schedule_series',
    'duty_assignments',
    'duty_coverage_requirements',
    'duty_exceptions',
    'duty_holidays',
  ];

  it.each(dutyTables)('adds additive V3 scope to %s', (table) => {
    expect(migration).toContain(`ALTER TABLE "${table}"`);
    expect(migration).toMatch(
      new RegExp(
        `ALTER TABLE "${table}"[\\s\\S]*?ADD COLUMN "office_id" UUID,[\\s\\S]*?ADD COLUMN "org_unit_id" UUID`,
      ),
    );
  });

  it('backfills legacy Department and Division scope through the audited mapping table', () => {
    expect(migration).toContain('FROM "legacy_org_unit_mappings" AS mapping');
    expect(migration).toContain("mapping.\"legacy_entity_type\" = 'DEPARTMENT'");
    expect(migration).toContain("mapping.\"legacy_entity_type\" = 'DIVISION'");
  });

  it('maps branch-wide records only when exactly one Office exists', () => {
    expect(migration).toContain(
      'WHERE (SELECT COUNT(*) FROM "offices") = 1',
    );
    expect(migration).toContain('dst."division_id" IS NULL');
    expect(migration).toContain('dh."division_id" IS NULL');
  });

  it.each(dutyTables)('keeps %s compatibility columns while adding guarded V3 foreign keys', (table) => {
    expect(migration).toContain(`${table}_office_id_fkey`);
    expect(migration).toContain(`${table}_org_unit_id_fkey`);
    expect(migration).toContain(`${table}_v3_scope_check`);
  });

  it('does not drop legacy Duty hierarchy columns in the additive foundation migration', () => {
    expect(migration).not.toMatch(/DROP\s+COLUMN\s+"?(division_id|department_id)"?/i);
    expect(migration).not.toMatch(/DROP\s+TABLE/i);
  });
});
