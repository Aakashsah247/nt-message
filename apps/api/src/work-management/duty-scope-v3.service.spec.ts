import { ForbiddenException, NotFoundException } from '@nestjs/common';

import { AccountRole } from '../generated/prisma/enums';
import { DutyScopeV3Service } from './duty-scope-v3.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const managerUser = {
  accountId: 'manager-account',
  sessionId: 'session-1',
  username: 'manager',
  role: AccountRole.TEAM_MANAGER,
};

function account(id = 'employee-account') {
  return {
    id,
    role: AccountRole.EMPLOYEE,
    username: `${id}@ntc.test`,
    isEnabled: true,
    employee: {
      id: `${id}-employee`,
      empId: 'NTC-1001',
      empName: 'Employee One',
      designation: 'Technician',
      status: 'ACTIVE',
      employmentStatus: 'ACTIVE',
      archivedAt: null,
      isActivated: true,
      divisionId: 'division-1',
      departmentId: 'department-1',
    },
  };
}

function createHarness() {
  const prisma = {
    orgMembership: { findMany: jest.fn() },
    operationalTeamMember: { findMany: jest.fn() },
    operationalTeam: { findFirst: jest.fn() },
    orgLeadershipAssignment: { findMany: jest.fn() },
    operationalTeamLeadAssignment: { findFirst: jest.fn(), findMany: jest.fn() },
    orgUnitClosure: { findUnique: jest.fn(), findMany: jest.fn() },
    legacyOrgUnitMapping: { findMany: jest.fn(), findFirst: jest.fn() },
  };
  const dutyAuthorization = {
    getContext: jest.fn(),
    assertCanUseManagement: jest.fn(),
  };
  const organizationAuthorization = {
    can: jest.fn(),
    visibleOrgUnitIds: jest.fn(),
  };

  const context = {
    officeId: 'office-1',
    primaryOrgUnitId: 'org-unit-parent',
    operationalTeamLeadIds: [],
    canView: true,
    canCreate: true,
    canAssign: true,
    canManage: true,
    readOnlyOversight: false,
  };
  dutyAuthorization.getContext.mockResolvedValue(context);
  dutyAuthorization.assertCanUseManagement.mockResolvedValue(context);
  organizationAuthorization.can.mockResolvedValue(true);
  organizationAuthorization.visibleOrgUnitIds.mockResolvedValue([
    'org-unit-parent',
    'org-unit-child',
  ]);
  prisma.orgMembership.findMany.mockResolvedValue([
    {
      officeId: 'office-1',
      orgUnitId: 'org-unit-child',
      employee: { account: account() },
    },
  ]);
  prisma.operationalTeamMember.findMany.mockResolvedValue([]);

  return {
    prisma,
    dutyAuthorization,
    organizationAuthorization,
    service: new DutyScopeV3Service(
      prisma as never,
      dutyAuthorization as never,
      organizationAuthorization as never,
    ),
  };
}

describe('DutyScopeV3Service', () => {
  it('resolves active employees from primary Office/OrgUnit membership', async () => {
    const { service } = createHarness();

    const result = await service.resolveAssignableAccounts(
      managerUser,
      ['employee-account'],
      'org-unit-child',
    );

    expect(result).toEqual([
      expect.objectContaining({
        id: 'employee-account',
        officeId: 'office-1',
        orgUnitId: 'org-unit-child',
        operationalTeamIds: [],
      }),
    ]);
  });

  it('allows an Operational Team Lead to assign only a current Team member', async () => {
    const { service, prisma, dutyAuthorization, organizationAuthorization } =
      createHarness();
    dutyAuthorization.getContext.mockResolvedValue({
      officeId: 'office-1',
      primaryOrgUnitId: 'org-unit-other',
      operationalTeamLeadIds: ['team-1'],
      canView: true,
      canCreate: false,
      canAssign: true,
      canManage: true,
      readOnlyOversight: false,
    });
    dutyAuthorization.assertCanUseManagement.mockResolvedValue({
      officeId: 'office-1',
      primaryOrgUnitId: 'org-unit-other',
      operationalTeamLeadIds: ['team-1'],
      canView: true,
      canCreate: false,
      canAssign: true,
      canManage: true,
      readOnlyOversight: false,
    });
    organizationAuthorization.can.mockResolvedValue(false);
    prisma.operationalTeamMember.findMany.mockResolvedValue([
      {
        teamId: 'team-1',
        employee: { account: { id: 'employee-account' } },
      },
    ]);
    prisma.operationalTeam.findFirst.mockResolvedValue({
      id: 'team-1',
      orgUnitId: 'org-unit-child',
    });

    const result = await service.resolveAssignableAccounts(
      managerUser,
      ['employee-account'],
      undefined,
      'team-1',
    );

    expect(result[0]?.operationalTeamIds).toContain('team-1');
  });

  it('denies a selected employee outside both OrgUnit and Team scope', async () => {
    const { service, organizationAuthorization } = createHarness();
    organizationAuthorization.can.mockResolvedValue(false);

    await expect(
      service.resolveAssignableAccounts(managerUser, ['employee-account']),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects employees without an active primary Office placement', async () => {
    const { service, prisma } = createHarness();
    prisma.orgMembership.findMany.mockResolvedValue([]);

    await expect(
      service.resolveAssignableAccounts(managerUser, ['employee-account']),
    ).rejects.toBeInstanceOf(NotFoundException);
  });


  it('authorizes legacy Duty filters through their mapped V3 OrgUnit scope', async () => {
    const { service, prisma, organizationAuthorization } = createHarness();
    prisma.legacyOrgUnitMapping.findFirst.mockResolvedValue({
      orgUnitId: 'org-unit-child',
    });

    await service.assertLegacyScopeFilter(managerUser, {
      departmentId: 'department-1',
    });

    expect(organizationAuthorization.can).toHaveBeenCalledWith(
      managerUser,
      'duty.view',
      'office-1',
      'org-unit-child',
      expect.any(Date),
    );
  });

  it('rejects a legacy Duty filter mapped outside current V3 visibility', async () => {
    const { service, prisma, organizationAuthorization } = createHarness();
    prisma.legacyOrgUnitMapping.findFirst.mockResolvedValue({
      orgUnitId: 'org-unit-outside',
    });
    organizationAuthorization.can.mockResolvedValue(false);

    await expect(
      service.assertLegacyScopeFilter(managerUser, {
        divisionId: 'division-outside',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('derives nearest legacy Department and Division only as compatibility data', async () => {
    const { service, prisma } = createHarness();
    prisma.orgUnitClosure.findMany.mockResolvedValue([
      { ancestorOrgUnitId: 'org-unit-child', depth: 0 },
      { ancestorOrgUnitId: 'org-unit-department', depth: 1 },
      { ancestorOrgUnitId: 'org-unit-division', depth: 2 },
    ]);
    prisma.legacyOrgUnitMapping.findMany.mockResolvedValue([
      {
        orgUnitId: 'org-unit-division',
        legacyEntityType: 'DIVISION',
        legacyEntityId: 'division-1',
      },
      {
        orgUnitId: 'org-unit-department',
        legacyEntityType: 'DEPARTMENT',
        legacyEntityId: 'department-1',
      },
    ]);

    await expect(
      service.resolveLegacyCompatibilityScope('office-1', 'org-unit-child'),
    ).resolves.toEqual({
      divisionId: 'division-1',
      departmentId: 'department-1',
    });
  });
  it('routes Duty notifications to the assigned employee, Team Lead, and nearest OrgUnit Head', async () => {
    const { service, prisma } = createHarness();
    prisma.operationalTeamLeadAssignment.findMany.mockResolvedValue([
      { employee: { account: { id: 'team-lead' } } },
    ]);
    prisma.orgUnitClosure.findMany.mockResolvedValue([
      { ancestorOrgUnitId: 'org-unit-child', depth: 0 },
      { ancestorOrgUnitId: 'org-unit-parent', depth: 1 },
    ]);
    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        orgUnitId: 'org-unit-parent',
        employee: { account: { id: 'org-head' } },
      },
    ]);

    await expect(
      service.notificationRecipientIds({
        officeId: 'office-1',
        orgUnitId: 'org-unit-child',
        assigneeAccountId: 'employee-account',
        supervisorAccountId: 'supervisor-account',
        operationalTeamIds: ['team-1'],
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        'employee-account',
        'supervisor-account',
        'team-lead',
        'org-head',
      ]),
    );
  });

  it('falls back to the Office Head when no OrgUnit Head is active', async () => {
    const { service, prisma } = createHarness();
    prisma.orgUnitClosure.findMany.mockResolvedValue([
      { ancestorOrgUnitId: 'org-unit-child', depth: 0 },
    ]);
    prisma.orgLeadershipAssignment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { employee: { account: { id: 'office-head' } } },
      ]);

    await expect(
      service.notificationRecipientIds({
        officeId: 'office-1',
        orgUnitId: 'org-unit-child',
        assigneeAccountId: 'employee-account',
        supervisorAccountId: 'supervisor-account',
      }),
    ).resolves.toEqual(
      expect.arrayContaining([
        'employee-account',
        'supervisor-account',
        'office-head',
      ]),
    );
  });

  it('keeps Team Leads away from assignments explicitly owned by another Operational Team', async () => {
    const { service, dutyAuthorization, organizationAuthorization } = createHarness();
    dutyAuthorization.getContext.mockResolvedValue({
      officeId: 'office-1',
      primaryOrgUnitId: 'org-unit-parent',
      operationalTeamLeadIds: ['team-1'],
      canView: true,
      canCreate: false,
      canAssign: true,
      canManage: true,
      readOnlyOversight: false,
    });
    organizationAuthorization.visibleOrgUnitIds.mockResolvedValue([]);

    const where = await service.visibleAssignmentWhere(managerUser);

    expect(where).toEqual(
      expect.objectContaining({
        OR: expect.arrayContaining([
          expect.objectContaining({
            OR: expect.arrayContaining([
              { operationalTeamId: { in: ['team-1'] } },
            ]),
          }),
        ]),
      }),
    );
  });

});
