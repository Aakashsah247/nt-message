import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260918222500_allow_cross_org_support_stage_assignments',
  'migration.sql',
);

const migration = readFileSync(migrationPath, 'utf8');
const normalized = migration.replace(/\s+/g, ' ').trim();

describe('Work V3 cross-organization Support Member assignment integrity', () => {
  it('applies stage assignment-mode target rules only to PRIMARY assignments', () => {
    expect(normalized).toContain(
      `IF NEW."assignment_role" = 'PRIMARY' THEN IF assignment_mode = 'ORG_UNIT_QUEUE'`,
    );
    expect(normalized).toContain(
      `ELSIF NEW."assignment_role" = 'SUPPORTING' AND NEW."target_type" <> 'ACCOUNT' THEN`,
    );
  });

  it('allows a Supporting account outside the responsible OrgUnit while keeping it inside an active Work participant organization', () => {
    expect(normalized).toContain(
      `IF NEW."assignment_role" = 'SUPPORTING' THEN`,
    );
    expect(normalized).toContain(`membership."office_id" = work_office_id`);
    expect(normalized).toContain(
      `FROM "work_org_unit_participants" participant`,
    );
    expect(normalized).toContain(`participant."work_item_id" = work_item_id`);
    expect(normalized).toContain(`participant."ended_at" IS NULL`);
  });

  it('keeps PRIMARY account assignments inside the responsible OrgUnit scope', () => {
    expect(normalized).toContain(
      `membership."org_unit_id" = responsible_org_unit_id OR EXISTS`,
    );
    expect(normalized).toContain(
      `closure."ancestor_org_unit_id" = responsible_org_unit_id`,
    );
  });

  it('validates canonical Operational Team targets introduced by the Team separation cutover', () => {
    expect(normalized).toContain(
      `NEW."target_type" = 'TEAM' AND NEW."target_operational_team_id" IS NOT NULL`,
    );
    expect(normalized).toContain(`FROM "operational_teams" team`);
    expect(normalized).toMatch(
      /IF target_team_org_unit_id\s*<>\s*responsible_org_unit_id/,
    );
    expect(normalized).toMatch(
      /closure\."descendant_org_unit_id"\s*=\s*target_team_org_unit_id/,
    );
  });
});
