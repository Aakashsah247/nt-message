import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  process.cwd(),
  'prisma',
  'migrations',
  '20260910163000_add_communication_orgunit_foundation',
  'migration.sql',
);

const migration = readFileSync(migrationPath, 'utf8');
const schema = readFileSync(
  join(process.cwd(), 'prisma', 'schema.prisma'),
  'utf8',
);

describe('Phase 12 P12-A communication OrgUnit migration foundation', () => {
  it('keeps Prisma communication models additive and V3-ready', () => {
    expect(schema).toMatch(
      /enum OfficialGroupScopeType \{[\s\S]*?OFFICE[\s\S]*?ORG_UNIT[\s\S]*?\}/,
    );
    expect(schema).toMatch(
      /enum OfficialGroupMembershipMode \{[\s\S]*?DIRECT_MEMBERS[\s\S]*?ENTIRE_SUBTREE[\s\S]*?\}/,
    );
    expect(schema).toMatch(
      /enum AnnouncementAudienceType \{[\s\S]*?OFFICE[\s\S]*?ORG_UNIT[\s\S]*?\}/,
    );
    expect(schema).toContain('officialOfficeId');
    expect(schema).toContain('officialOrgUnitId');
    expect(schema).toContain('officialMembershipMode');
    expect(schema).toContain('includeDescendants');
    expect(schema).not.toContain('officialDivisionId');
    expect(schema).not.toContain('officialDepartmentId');
  });

  it('adds additive V3 Official Group scope and membership mode', () => {
    expect(migration).toContain(
      'ALTER TYPE "OfficialGroupScopeType" ADD VALUE IF NOT EXISTS \'OFFICE\'',
    );
    expect(migration).toContain(
      'ALTER TYPE "OfficialGroupScopeType" ADD VALUE IF NOT EXISTS \'ORG_UNIT\'',
    );
    expect(migration).toContain(
      'CREATE TYPE "OfficialGroupMembershipMode" AS ENUM',
    );
    expect(migration).toContain("'DIRECT_MEMBERS'");
    expect(migration).toContain("'ENTIRE_SUBTREE'");
    expect(migration).toMatch(
      /ALTER TABLE "conversations"[\s\S]*?ADD COLUMN "official_office_id" UUID,[\s\S]*?ADD COLUMN "official_org_unit_id" UUID,[\s\S]*?ADD COLUMN "official_membership_mode" "OfficialGroupMembershipMode"/,
    );
  });

  it('adds additive V3 Announcement scope without removing legacy targets', () => {
    expect(migration).toContain(
      'ALTER TYPE "AnnouncementAudienceType" ADD VALUE IF NOT EXISTS \'OFFICE\'',
    );
    expect(migration).toContain(
      'ALTER TYPE "AnnouncementAudienceType" ADD VALUE IF NOT EXISTS \'ORG_UNIT\'',
    );
    expect(migration).toMatch(
      /ALTER TABLE "announcements"[\s\S]*?ADD COLUMN "office_id" UUID,[\s\S]*?ADD COLUMN "org_unit_id" UUID,[\s\S]*?ADD COLUMN "include_descendants" BOOLEAN NOT NULL DEFAULT false/,
    );
  });

  it('backfills Division and Department communication scope through audited OrgUnit mappings', () => {
    expect(migration).toContain('FROM "legacy_org_unit_mappings" AS mapping');
    expect(migration).toContain('mapping."legacy_entity_type" = \'DIVISION\'');
    expect(migration).toContain(
      'mapping."legacy_entity_type" = \'DEPARTMENT\'',
    );
    expect(migration).toContain(
      '"official_membership_mode" = \'ENTIRE_SUBTREE\'',
    );
    expect(migration).toContain('"include_descendants" = true');
  });

  it('maps branch-wide legacy communication records only when exactly one Office exists', () => {
    expect(migration).toContain('WHERE (SELECT COUNT(*) FROM "offices") = 1');
    expect(migration).toContain(
      'conversation."official_scope_type" = \'ORGANIZATION\'',
    );
    expect(migration).toContain(
      'announcement."audience_type" = \'ORGANIZATION\'',
    );
  });

  it('inherits Office and OrgUnit scope for official-group announcements', () => {
    expect(migration).toContain(
      'announcement."official_conversation_id" = conversation."id"',
    );
    expect(migration).toContain(
      '"office_id" = conversation."official_office_id"',
    );
    expect(migration).toContain(
      '"org_unit_id" = conversation."official_org_unit_id"',
    );
  });

  it('adds V3 foreign keys, indexes and compatibility-safe target constraints', () => {
    expect(migration).toContain('conversations_official_office_id_fkey');
    expect(migration).toContain('conversations_official_org_unit_id_fkey');
    expect(migration).toContain('announcements_office_id_fkey');
    expect(migration).toContain('announcements_org_unit_id_fkey');
    expect(migration).toContain('conversations_official_v3_scope_idx');
    expect(migration).toContain('announcements_v3_audience_scope_idx');
    expect(migration).toContain('conversations_official_scope_check');
    expect(migration).toContain('announcements_audience_target_check');
    expect(migration).toContain('announcements_v3_scope_check');
  });

  it('does not destructively remove legacy communication data in P12-A', () => {
    expect(migration).not.toMatch(
      /DROP\s+COLUMN\s+"?(official_division_id|official_department_id|division_id|department_id)"?/i,
    );
    expect(migration).not.toMatch(/DROP\s+TABLE/i);
  });
});
