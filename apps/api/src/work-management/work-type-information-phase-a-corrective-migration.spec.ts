import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Work Type Information Phase A corrective migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260921060000_work_type_information_phase_a_corrective',
      'migration.sql',
    ),
    'utf8',
  );

  it('creates a next draft only for permanent Work Types that have published state but no draft', () => {
    expect(sql).toContain('v."status" = \'PUBLISHED\'');
    expect(sql).toContain('draft."status" = \'DRAFT\'');
    expect(sql).toContain('MAX(all_versions."version") + 1');
    expect(sql).toContain('WHERE NOT EXISTS');
    expect(sql).toContain('published history remains immutable');
  });

  it('clones current ownership and business Information without platform completion controls', () => {
    expect(sql).toContain('INSERT INTO "work_type_creator_org_units"');
    expect(sql).toContain('INSERT INTO "work_type_creator_accounts"');
    expect(sql).toContain('INSERT INTO "work_field_definitions"');
    expect(sql).toContain("'COMPLETION_RESULT'");
    expect(sql).toContain("'COMPLETION_SUMMARY'");
    expect(sql).toContain("'MORE_WORK_REQUIRED'");
    expect(sql).toContain('field."code" NOT IN');
  });

  it('repairs operational completion fields only in drafts with the finalized required rules', () => {
    expect(sql).toContain('version_record."status" = \'DRAFT\'');
    expect(sql).toContain("'RX_LEVEL_DBM'");
    expect(sql).toContain("'CUSTOMER_ID'");
    expect(sql).toContain('definition."code" <> \'NETWORK_MAINTENANCE\'');
    expect(sql).toContain('"collectionMode":"COMPLETION_ONLY"');
  });

  it('never updates a PUBLISHED or RETIRED Work Type version in place', () => {
    expect(sql).not.toMatch(/UPDATE\s+"work_type_versions"/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+"work_type_versions"/i);
    expect(sql).not.toMatch(/UPDATE\s+"work_field_definitions"/i);
  });
});
