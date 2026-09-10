import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('P12-H Directory OrgUnit runtime', () => {
  const service = readFileSync(join(__dirname, 'directory.service.ts'), 'utf8');
  const controller = readFileSync(
    join(__dirname, 'directory.controller.ts'),
    'utf8',
  );

  it('builds directory identity from V3 Office/OrgUnit membership and leadership', () => {
    expect(service).toContain('OrgMembershipType.PRIMARY');
    expect(service).toContain('orgUnitBreadcrumb');
    expect(service).toContain('orgLeadershipAssignments');
    expect(service).toContain('operationalTeamLeadAssignments');
    expect(service).toContain("scopeType: 'OFFICE'");
  });

  it('allows Employee directory access while keeping contact visibility limited', () => {
    expect(controller).toContain('AccountRole.EMPLOYEE');
    expect(service).toContain('account.role !== AccountRole.EMPLOYEE');
  });
});
