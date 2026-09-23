import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Work Type Information Phase A migration', () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260921031500_work_type_information_phase_a',
      'migration.sql',
    ),
    'utf8',
  );

  it('normalizes only missing collection metadata instead of overwriting published edits', () => {
    expect(sql).toContain(
      "NOT (COALESCE(f.\"config\", '{}'::jsonb) ? 'collectionMode')",
    );
    expect(sql).toContain("'CREATION_AND_COMPLETION'");
    expect(sql).toContain("'COMPLETION_ONLY'");
    expect(sql).toContain("'CREATION_ONLY'");
    expect(sql).toContain('f."code" NOT IN (');
    expect(sql).toContain("'COMPLETION_RESULT'");
    expect(sql).toContain("'COMPLETION_SUMMARY'");
    expect(sql).toContain("'MORE_WORK_REQUIRED'");
  });

  it('repairs hidden completion Information only in editable drafts', () => {
    expect(sql).toContain('v."status" = \'DRAFT\'');
    expect(sql).toContain("'RX_LEVEL_DBM'");
    expect(sql).toContain("'CUSTOMER_ID'");
    expect(sql).toContain('d."code" <> \'NETWORK_MAINTENANCE\'');
  });

  it('restores old report reference defaults without replacing an explicit reference', () => {
    expect(sql).toContain(
      "configured.\"config\" ->> 'reportReference' = 'true'",
    );
    expect(sql).toContain("'NEW_INSTALLATION', 'UPDATE_SERVICES'");
    expect(sql).toContain('f."code" = \'TOKEN_NUMBER\'');
    expect(sql).toContain('f."code" = \'SERVICE_NUMBER\'');
  });
});
