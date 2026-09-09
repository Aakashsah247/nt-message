import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Phase 11 Duty Operational Team history migration', () => {
  const migration = readFileSync(
    join(
      process.cwd(),
      'prisma',
      'migrations',
      '20260909103000_add_duty_operational_team_history',
      'migration.sql',
    ),
    'utf8',
  ).replace(/\s+/g, ' ');

  it('adds Operational Team history to Duty series and assignments', () => {
    expect(migration).toContain(
      'ALTER TABLE "duty_schedule_series" ADD COLUMN "operational_team_id" UUID;',
    );
    expect(migration).toContain(
      'ALTER TABLE "duty_assignments" ADD COLUMN "operational_team_id" UUID;',
    );
  });

  it('backfills explicit Team context from Duty activity snapshots', () => {
    expect(migration).toContain("activity.\"details\" ->> 'operationalTeamId'");
    expect(migration).toContain(
      'UPDATE "duty_assignments" assignment SET "operational_team_id" = latest."operational_team_id"',
    );
  });

  it('keeps Operational Team references protected by foreign keys and indexes', () => {
    expect(migration).toContain(
      'FOREIGN KEY ("operational_team_id") REFERENCES "operational_teams"("id")',
    );
    expect(migration).toContain(
      'CREATE INDEX "duty_assignments_operational_team_window_idx"',
    );
  });
});
