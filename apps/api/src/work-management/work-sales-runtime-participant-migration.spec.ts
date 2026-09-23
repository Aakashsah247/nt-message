import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260919000500_normalize_sales_runtime_participant_scope',
    'migration.sql',
  ),
  'utf8',
).replace(/\s+/g, ' ');

describe('Work V3 Sales runtime participant normalization', () => {
  it('normalizes Sales coordination for both Sales-dependent default Work Types', () => {
    expect(migration).toContain(
      `definition."code" IN ('NEW_INSTALLATION', 'UPDATE_SERVICES')`,
    );
    expect(migration).toContain(`stage."code" = 'SALES_COORDINATION'`);
  });

  it('makes the Sales stage runtime-scoped instead of binding it to the Main Team OrgUnit', () => {
    expect(migration).toContain(
      `"responsible_org_unit_rule" = 'RUNTIME_REQUESTED_PARTICIPANT'`,
    );
    expect(migration).toContain(`"responsible_org_unit_id" = NULL`);
  });
});
