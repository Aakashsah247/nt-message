import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('P13 Directory final OrgUnit runtime', () => {
  const service = readFileSync(join(__dirname, 'directory.service.ts'), 'utf8');
  const controller = readFileSync(
    join(__dirname, 'directory.controller.ts'),
    'utf8',
  );
  const queryDto = readFileSync(
    join(__dirname, 'dto/list-directory-query.dto.ts'),
    'utf8',
  );

  it('builds directory identity from V3 Office/OrgUnit membership and leadership only', () => {
    expect(service).toContain('OrgMembershipType.PRIMARY');
    expect(service).toContain('orgUnitBreadcrumb');
    expect(service).toContain('orgLeadershipAssignments');
    expect(service).not.toContain('operationalTeamLeadAssignments');
    expect(service).toContain("scopeType: 'OFFICE'");
    expect(service).not.toContain('managementAssignments');
    expect(service).not.toContain('ManagementPositionType');
    expect(service).not.toContain('divisionId');
    expect(service).not.toContain('departmentId');
  });

  it('uses AccountClass and active Office membership instead of fixed account-role routing', () => {
    expect(service).toContain('accountClass: true');
    expect(service).toContain('AccountClass.SUPER_ADMIN');
    expect(service).not.toContain('AccountRole.SENIOR_MANAGEMENT');
    expect(service).not.toContain('AccountRole.TEAM_MANAGER');
    expect(service).not.toContain('AccountRole.EMPLOYEE');
    expect(controller).not.toContain('@Roles(');
    expect(queryDto).not.toContain('role?: AccountRole');
  });

  it('keeps delegated Directory access aligned with organization workspace capabilities', () => {
    expect(service).toContain('ORGANIZATION_ACCESS_CAPABILITIES');
    expect(service).toContain('delegationGrantKeysForCapability');
    expect(service).toContain('ORGANIZATION_ACCESS_CAPABILITIES.flatMap');
  });
});
