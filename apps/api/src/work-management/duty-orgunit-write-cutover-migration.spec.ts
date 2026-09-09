import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260909090000_relax_legacy_duty_scope_requirements',
  'migration.sql',
);

const migration = readFileSync(migrationPath, 'utf8');
const normalizedMigration = migration.replace(/\s+/g, ' ').trim();

describe('Phase 11 Duty V3 write-scope migration', () => {
  it.each([
    ['duty_schedule_series', 'division_id'],
    ['duty_assignments', 'division_id'],
    ['duty_coverage_requirements', 'department_id'],
    ['duty_exceptions', 'division_id'],
  ])('makes %s.%s compatibility-only instead of a required write target', (table, column) => {
    expect(normalizedMigration).toContain(
      `ALTER TABLE "${table}" ALTER COLUMN "${column}" DROP NOT NULL;`,
    );
  });

  it('does not remove legacy Duty compatibility columns or tables', () => {
    expect(migration).not.toMatch(/DROP\s+COLUMN/i);
    expect(migration).not.toMatch(/DROP\s+TABLE/i);
  });
});
