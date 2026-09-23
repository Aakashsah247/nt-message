import { ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  AccountClass,
  AccountRequestOrganizationRole,
  AccountRole,
  OrgLeadershipType,
} from '../generated/prisma/client';
import { AccountRequestAuthorityService } from './account-request-authority.service';

const user: AuthenticatedUser = {
  accountId: 'account-1',
  sessionId: 'session-1',
  username: 'employee.com',
  accountClass: AccountClass.OFFICE_USER,
  role: AccountRole.EMPLOYEE,
};

function buildService() {
  const prisma = {
    account: { findUnique: jest.fn() },
    orgMembership: { findFirst: jest.fn() },
    orgLeadershipAssignment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    orgUnit: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    orgUnitClosure: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    accountRequest: { findFirst: jest.fn() },
  };

  const authorization = {
    visibleOrgUnitIds: jest.fn().mockResolvedValue([]),
  };

  return {
    prisma,
    authorization,
    service: new AccountRequestAuthorityService(
      prisma as never,
      authorization as never,
    ),
  };
}

function allowActiveOfficeUser(
  prisma: ReturnType<typeof buildService>['prisma'],
  accountClass: AccountClass = AccountClass.OFFICE_USER,
) {
  prisma.account.findUnique.mockResolvedValue({
    id: 'account-1',
    accountClass,
    isEnabled: true,
    employee: {
      id: 'employee-1',
      status: 'ACTIVE',
      employmentStatus: 'ACTIVE',
      archivedAt: null,
    },
  });

  prisma.orgMembership.findFirst.mockResolvedValue({
    id: 'membership-1',
    officeId: 'office-1',
    orgUnitId: 'department-x',
    office: {
      id: 'office-1',
      code: 'PATAN',
      name: 'Patan Telecom Office',
      isActive: true,
    },
    orgUnit: {
      id: 'department-x',
      code: 'DEPT-X',
      name: 'Department X',
      isActive: true,
      parentOrgUnitId: 'division-tech',
      orgUnitType: {
        code: 'DEPARTMENT',
        name: 'Department',
        isTeam: false,
      },
    },
  });
}

function departmentTarget() {
  return {
    id: 'department-x',
    officeId: 'office-1',
    code: 'DEPT-X',
    name: 'Department X',
    isActive: true,
    parentOrgUnitId: 'division-tech',
    orgUnitType: {
      code: 'DEPARTMENT',
      name: 'Department',
      isActive: true,
      isTeam: false,
    },
  };
}

describe('AccountRequestAuthorityService V3 head authority', () => {
  it('does not allow a normal employee to request user accounts', async () => {
    const { service, prisma } = buildService();
    allowActiveOfficeUser(prisma);
    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([]);

    await expect(service.getCreatorContext(user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows the Office Head to request employees and Heads across formal Office units', async () => {
    const { service, prisma } = buildService();
    allowActiveOfficeUser(prisma);
    prisma.orgLeadershipAssignment.findMany
      .mockResolvedValueOnce([
        { leadershipType: OrgLeadershipType.OFFICE_HEAD, orgUnitId: null },
      ])
      .mockResolvedValueOnce([]);
    prisma.orgUnit.findMany.mockResolvedValue([
      {
        id: 'division-tech',
        code: 'TECH',
        name: 'Technical Division',
        parentOrgUnitId: null,
        sortOrder: 1,
        orgUnitType: { code: 'DIVISION', name: 'Division' },
      },
      {
        id: 'department-x',
        code: 'DEPT-X',
        name: 'Department X',
        parentOrgUnitId: 'division-tech',
        sortOrder: 2,
        orgUnitType: { code: 'DEPARTMENT', name: 'Department' },
      },
    ]);

    const context = await service.getCreatorContext(user);

    expect(context.authority.kind).toBe('OFFICE_HEAD');
    expect(context.requestableOrgUnits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'division-tech',
          headTitle: 'Division Head',
          canRequestHead: true,
        }),
        expect.objectContaining({
          id: 'department-x',
          headTitle: 'Department Head',
          canRequestHead: true,
        }),
      ]),
    );
  });

  it('allows an Org Unit Head to request accounts only in their own branch and Heads only below their own unit', async () => {
    const { service, prisma } = buildService();
    allowActiveOfficeUser(prisma);
    prisma.orgLeadershipAssignment.findMany
      .mockResolvedValueOnce([
        {
          leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
          orgUnitId: 'department-x',
        },
      ])
      .mockResolvedValueOnce([]);
    prisma.orgUnitClosure.findMany.mockResolvedValue([
      { descendantOrgUnitId: 'department-x' },
      { descendantOrgUnitId: 'section-x1' },
    ]);
    prisma.orgUnitClosure.findFirst.mockImplementation(({ where }) =>
      Promise.resolve(
        where.descendantOrgUnitId === 'section-x1' ? { depth: 1 } : null,
      ),
    );
    prisma.orgUnit.findMany.mockResolvedValue([
      {
        id: 'department-x',
        code: 'DEPT-X',
        name: 'Department X',
        parentOrgUnitId: 'division-tech',
        sortOrder: 1,
        orgUnitType: { code: 'DEPARTMENT', name: 'Department' },
      },
      {
        id: 'section-x1',
        code: 'X1',
        name: 'Section X1',
        parentOrgUnitId: 'department-x',
        sortOrder: 2,
        orgUnitType: { code: 'SECTION', name: 'Section' },
      },
    ]);

    const context = await service.getCreatorContext(user);

    expect(context.authority.kind).toBe('ORG_UNIT_HEAD');
    expect(
      context.requestableOrgUnits.find((unit) => unit.id === 'department-x')
        ?.canRequestHead,
    ).toBe(false);
    expect(
      context.requestableOrgUnits.find((unit) => unit.id === 'section-x1')
        ?.canRequestHead,
    ).toBe(true);
  });

  it('rejects Super Admin from the Office-side request creation flow', async () => {
    const { service, prisma } = buildService();
    allowActiveOfficeUser(prisma, AccountClass.SUPER_ADMIN);

    await expect(
      service.getCreatorContext({
        accountId: 'account-1',
        sessionId: 'session-1',
        username: 'superadmin.com',
        accountClass: AccountClass.SUPER_ADMIN,
        role: AccountRole.SUPER_ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a Department Head to request an employee in the Department itself', async () => {
    const { service, prisma } = buildService();
    allowActiveOfficeUser(prisma);
    prisma.orgUnit.findUnique.mockResolvedValue(departmentTarget());
    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
        orgUnitId: 'department-x',
      },
    ]);
    prisma.orgUnitClosure.findMany.mockResolvedValue([
      { descendantOrgUnitId: 'department-x' },
    ]);

    const target = await service.resolveCreateTarget(user, {
      officeId: 'office-1',
      intendedOrgUnitId: 'department-x',
      requestedOrganizationRole: AccountRequestOrganizationRole.EMPLOYEE,
    });

    expect(target.requestedOrganizationRole).toBe(
      AccountRequestOrganizationRole.EMPLOYEE,
    );
  });

  it('does not allow a Department Head to create a second Head for their own Department', async () => {
    const { service, prisma } = buildService();
    allowActiveOfficeUser(prisma);
    prisma.orgUnit.findUnique.mockResolvedValue(departmentTarget());
    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
        orgUnitId: 'department-x',
      },
    ]);
    prisma.orgUnitClosure.findMany.mockResolvedValue([
      { descendantOrgUnitId: 'department-x' },
    ]);
    prisma.orgUnitClosure.findFirst.mockResolvedValue(null);

    await expect(
      service.resolveCreateTarget(user, {
        officeId: 'office-1',
        intendedOrgUnitId: 'department-x',
        requestedOrganizationRole: AccountRequestOrganizationRole.ORG_UNIT_HEAD,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never accepts an Operational Team as a hierarchy account target', async () => {
    const { service, prisma } = buildService();
    allowActiveOfficeUser(prisma);
    prisma.orgUnit.findUnique.mockResolvedValue({
      ...departmentTarget(),
      id: 'team-1',
      orgUnitType: {
        code: 'TEAM',
        name: 'Operational Team',
        isActive: true,
        isTeam: true,
      },
    });

    await expect(
      service.resolveCreateTarget(user, {
        officeId: 'office-1',
        intendedOrgUnitId: 'team-1',
        requestedOrganizationRole: AccountRequestOrganizationRole.EMPLOYEE,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
