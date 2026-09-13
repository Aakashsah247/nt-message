import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = readFileSync(
  join(process.cwd(), 'prisma', 'schema.prisma'),
  'utf8',
);

const migration = readFileSync(
  join(
    process.cwd(),
    'prisma',
    'migrations',
    '20260913032500_remove_phase13_legacy_schema',
    'migration.sql',
  ),
  'utf8',
);

const generatedEnums = readFileSync(
  join(process.cwd(), 'src', 'generated', 'prisma', 'enums.ts'),
  'utf8',
);

const generatedModels = readFileSync(
  join(process.cwd(), 'src', 'generated', 'prisma', 'models.ts'),
  'utf8',
);

const generatedWorkItem = readFileSync(
  join(process.cwd(), 'src', 'generated', 'prisma', 'models', 'WorkItem.ts'),
  'utf8',
);

describe('Phase 13 checkpoint 20 destructive schema cleanup', () => {
  it('removes retired hierarchy/management/team models from Prisma', () => {
    for (const model of [
      'LegacyOrgUnitMapping',
      'Division',
      'Department',
      'ManagementPosition',
      'ManagementAssignment',
      'DepartmentTeam',
      'DepartmentTeamMember',
      'DepartmentTeamActivity',
    ]) {
      expect(schema).not.toMatch(new RegExp(`model\\s+${model}\\s+\\{`));
    }
  });

  it('removes legacy hierarchy and WM-V2 ownership fields', () => {
    for (const field of [
      'divisionId',
      'departmentId',
      'assignedTeamId',
      'responsibleManagerAccountId',
      'legacyWorkItemType',
      'legacyDepartmentTeamId',
      'requestedDepartmentId',
      'officialDivisionId',
      'officialDepartmentId',
    ]) {
      expect(schema).not.toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it('removes retired enums and enum values from the active schema', () => {
    expect(schema).not.toMatch(/enum\s+WorkItemType\s+\{/);
    expect(schema).not.toMatch(/enum\s+ManagementPositionType\s+\{/);
    expect(schema).not.toMatch(/enum\s+DepartmentWorkFunction\s+\{/);
    expect(schema).not.toMatch(/enum\s+DepartmentTeamActivityAction\s+\{/);
    expect(schema).not.toMatch(/\bSENIOR_MANAGEMENT\b|\bTEAM_MANAGER\b/);
    expect(schema).not.toMatch(/\bCROSS_DIVISION\b|\bCROSS_DEPARTMENT\b/);
  });

  it('keeps only native V3 communication scope enum values', () => {
    expect(schema).toMatch(
      /enum OfficialGroupScopeType \{\s*OFFICE\s*ORG_UNIT\s*\}/s,
    );
    expect(schema).toMatch(
      /enum AnnouncementAudienceType \{\s*OFFICIAL_GROUP\s*OFFICE\s*ORG_UNIT\s*\}/s,
    );
  });

  it('keeps the generated Prisma client synchronized with the cleaned schema', () => {
    expect(generatedEnums).not.toMatch(
      /\bSENIOR_MANAGEMENT\b|\bTEAM_MANAGER\b|\bCROSS_DIVISION\b|\bCROSS_DEPARTMENT\b/,
    );
    expect(generatedEnums).not.toMatch(
      /export const (?:WorkItemType|ManagementPositionType|DepartmentWorkFunction|DepartmentTeamActivityAction)\b/,
    );

    for (const model of [
      'LegacyOrgUnitMapping',
      'Division',
      'Department',
      'ManagementPosition',
      'ManagementAssignment',
      'DepartmentTeam',
      'DepartmentTeamMember',
      'DepartmentTeamActivity',
    ]) {
      expect(generatedModels).not.toContain(`./models/${model}.js`);
    }

    for (const field of [
      'divisionId',
      'departmentId',
      'assignedTeamId',
      'responsibleManagerAccountId',
      'type: $Enums.WorkItemType',
    ]) {
      expect(generatedWorkItem).not.toContain(field);
    }
  });

  it('uses an explicit destructive migration after reconciliation', () => {
    expect(migration).toContain('DROP TABLE IF EXISTS "divisions"');
    expect(migration).toContain('DROP TABLE IF EXISTS "departments"');
    expect(migration).toContain('DROP TABLE IF EXISTS "department_teams"');
    expect(migration).toContain('DROP TABLE IF EXISTS "management_positions"');
    expect(migration).toContain('DROP TYPE IF EXISTS "WorkItemType"');
    expect(migration).toContain(
      "CREATE TYPE \"OfficialGroupScopeType\" AS ENUM ('OFFICE', 'ORG_UNIT')",
    );
  });
});
