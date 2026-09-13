import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function read(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), 'utf8');
}

function section(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);

  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Architecture-lock source section not found: ${start}`);
  }

  return source.slice(startIndex, endIndex);
}

const conversations = read('src/conversations/conversations.service.ts');
const directory = read('src/directory/directory.service.ts');
const directoryQueryDto = read('src/directory/dto/list-directory-query.dto.ts');
const schema = read('prisma/schema.prisma');
const analyticsPanel = read(
  '../web/src/components/MessagingAnalyticsPanel.tsx',
);
const directoryPanel = read('../web/src/components/EmployeeDirectory.tsx');
const messagingTypes = read('../web/src/types/messaging.ts');
const directoryService = read('../web/src/services/directory.service.ts');

describe('P12-M communication V3 architecture lock', () => {
  it('authorizes employee messaging from active V3 Office membership, not legacy hierarchy state', () => {
    const membershipSection = section(
      conversations,
      'private getCurrentPrimaryMessagingMembership(',
      'private async getMessagingViewer(',
    );

    expect(membershipSection).toContain('employee.orgMemberships.find');
    expect(membershipSection).toContain('membership.office.isActive');
    expect(membershipSection).toContain('membership.endsAt');
    expect(membershipSection).not.toContain('employee.division');
    expect(membershipSection).not.toContain('employee.departmentUnit');
    expect(conversations).not.toContain('viewer.divisionId');
    expect(conversations).not.toContain('viewer.departmentId');
  });

  it('keeps personal blocking independent of legacy management-role rank', () => {
    const blockSection = section(
      conversations,
      'private async assertCanBlockAccount(',
      'private async findPersonalBlockRelation(',
    );

    expect(blockSection).toContain('targetIsOfficeHead');
    expect(blockSection).not.toContain('SENIOR_MANAGEMENT');
    expect(blockSection).not.toContain('TEAM_MANAGER');
    expect(blockSection).not.toContain('getLegacyMessagingRoleRank');
  });

  it('scopes communication analytics through Office/OrgUnit authorization only', () => {
    const authorizationSection = section(
      conversations,
      'private async getMessagingAnalyticsAuthorizationScope(',
      'private emptyCountItems(',
    );
    const analyticsSection = section(
      conversations,
      'async getMessagingAnalytics(',
      'async listMessagingNotifications(',
    );

    expect(authorizationSection).toContain('CAPABILITIES.REPORTS_VIEW');
    expect(authorizationSection).toContain('visibleOrgUnitIds');
    expect(authorizationSection).toContain('OrgMembershipType.PRIMARY');
    expect(authorizationSection).not.toContain('divisionId');
    expect(authorizationSection).not.toContain('departmentId');

    expect(analyticsSection).toContain('usersByOrgUnit');
    expect(analyticsSection).not.toContain('usersByDivision');
    expect(analyticsSection).not.toContain('usersByDepartment');
    expect(analyticsSection).not.toContain('departmentUnit');
  });

  it('uses Office/OrgUnit fields for active Directory search and scope presentation', () => {
    const searchSection = section(
      directory,
      'const search = query.search?.trim();',
      'const page = query.page;',
    );

    expect(searchSection).toContain('orgMemberships');
    expect(searchSection).toContain('OrgMembershipType.PRIMARY');
    expect(directory).toContain('membership.endsAt');
    expect(directory).toContain('assignment.effectiveUntil');
    expect(searchSection).toContain('office:');
    expect(searchSection).toContain('orgUnit:');
    expect(searchSection).not.toContain('division:');
    expect(searchSection).not.toContain('departmentUnit:');

    expect(directoryQueryDto).not.toContain('divisionId?: string');
    expect(directoryQueryDto).not.toContain('departmentId?: string');
    expect(directoryService).not.toContain('query.divisionId');
    expect(directoryService).not.toContain('query.departmentId');
    expect(directoryPanel).toContain('list.scope.office');
    expect(directoryPanel).toContain('list.scope.orgUnit');
    expect(directoryPanel).not.toContain('list.scope.division');
    expect(directoryPanel).not.toContain('list.scope.department');
  });

  it('keeps the active analytics UI on OrgUnit contracts', () => {
    expect(messagingTypes).toContain('usersByOrgUnit');
    expect(messagingTypes).not.toContain('usersByDivision');
    expect(messagingTypes).not.toContain('usersByDepartment');
    expect(analyticsPanel).toContain('analytics.usersByOrgUnit');
    expect(analyticsPanel).toContain('organization.orgUnits');
    expect(analyticsPanel).not.toContain('organization.divisions');
    expect(analyticsPanel).not.toContain('organization.departments');
  });

  it('locks the post-Phase-13 communication schema to native V3 scope values', () => {
    expect(schema).toMatch(
      /enum OfficialGroupScopeType \{\s*OFFICE\s*ORG_UNIT\s*\}/s,
    );
    expect(schema).toMatch(
      /enum AnnouncementAudienceType \{\s*OFFICIAL_GROUP\s*OFFICE\s*ORG_UNIT\s*\}/s,
    );
    expect(schema).toMatch(
      /enum MessageRequestReason \{\s*PROTECTED_RECIPIENT\s*OUTSIDE_ORG_SCOPE\s*\}/s,
    );
    expect(schema).not.toMatch(
      /enum OfficialGroupScopeType \{[^}]*\b(?:ORGANIZATION|DIVISION|DEPARTMENT)\b[^}]*\}/,
    );
    expect(schema).not.toMatch(
      /enum AnnouncementAudienceType \{[^}]*\b(?:ORGANIZATION|DIVISION|DEPARTMENT)\b[^}]*\}/,
    );
    expect(schema).not.toMatch(
      /enum MessageRequestReason \{[^}]*\b(?:CROSS_DIVISION|CROSS_DEPARTMENT)\b[^}]*\}/,
    );
  });
});
