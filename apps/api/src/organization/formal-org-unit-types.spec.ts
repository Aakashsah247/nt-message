import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('formal Office hierarchy type lock', () => {
  const migration = readFileSync(
    resolve(
      process.cwd(),
      'prisma/migrations/20260915003000_finalize_formal_org_unit_types/migration.sql',
    ),
    'utf8',
  );

  it('restores Division, Department, Section and Unit as the selectable formal hierarchy', () => {
    for (const code of ['DIVISION', 'DEPARTMENT', 'SECTION', 'UNIT']) {
      expect(migration).toContain(`('${code}'`);
    }
    expect(migration).toContain("'PLACEMENT_PENDING'");
    expect(migration).toContain(
      `WHERE "code" IN ('ORGANIZATION', 'AREA', 'OTHER', 'SUB_UNIT')`,
    );
  });

  it('keeps Operational Teams outside formal OrgUnit types', () => {
    expect(migration).not.toContain("('TEAM', 'Team'");
    expect(migration).toContain('operational_teams');
  });

  it('safely reclassifies only root generic Organization units as Divisions', () => {
    expect(migration).toContain('current_type."code" = \'ORGANIZATION\'');
    expect(migration).toContain('unit."parent_org_unit_id" IS NULL');
    expect(migration).toContain('division_type."code" = \'DIVISION\'');
  });
});
