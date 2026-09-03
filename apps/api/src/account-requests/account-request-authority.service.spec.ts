import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { AccountRole } from '../generated/prisma/client';
import { AccountRequestAuthorityService } from './account-request-authority.service';

const user: AuthenticatedUser = {
  accountId: 'account-1',
  sessionId: 'session-1',
  username: 'employee.com',
  role: AccountRole.EMPLOYEE,
};

function buildService() {
  const prisma = {
    account: {
      findUnique: jest.fn(),
    },
    orgMembership: {
      findFirst: jest.fn(),
    },
    orgUnit: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    orgUnitClosure: {
      findMany: jest.fn(),
    },
    legacyOrgUnitMapping: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    department: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const authorization = {
    visibleOrgUnitIds: jest.fn(),
    assertCan: jest.fn(),
  };

  const service = new AccountRequestAuthorityService(
    prisma as never,
    authorization as never,
  );

  return { service, prisma, authorization };
}

function allowActiveOfficeUser(
  prisma: ReturnType<typeof buildService>['prisma'],
  role: AccountRole = AccountRole.EMPLOYEE,
) {
  prisma.account.findUnique.mockResolvedValue({
    id: 'account-1',
    role,
    isEnabled: true,
    employee: {
      id: 'employee-1',
      status: 'ACTIVE',
      employmentStatus: 'ACTIVE',
      archivedAt: null,
      divisionId: 'division-legacy',
      departmentId: 'department-legacy',
      division: null,
      departmentUnit: null,
    },
  });

  prisma.orgMembership.findFirst.mockResolvedValue({
    id: 'membership-1',
    officeId: 'office-1',
    orgUnitId: 'unit-home',
    office: {
      id: 'office-1',
      code: 'PATAN',
      name: 'Patan Telecom Office',
      isActive: true,
    },
    orgUnit: {
      id: 'unit-home',
      code: 'HOME',
      name: 'Home Unit',
      isActive: true,
      parentOrgUnitId: null,
      orgUnitType: {
        code: 'UNIT',
        name: 'Unit',
      },
    },
  });
}

describe('AccountRequestAuthorityService', () => {
  it('uses users.request_create scope instead of the legacy account role', async () => {
    const { service, prisma, authorization } = buildService();
    allowActiveOfficeUser(prisma, AccountRole.EMPLOYEE);

    authorization.visibleOrgUnitIds.mockResolvedValue([
      'unit-requestable',
    ]);
    prisma.orgUnit.findMany.mockResolvedValue([
      {
        id: 'unit-requestable',
        code: 'ADMIN',
        name: 'Administration',
        parentOrgUnitId: null,
        sortOrder: 0,
        orgUnitType: {
          code: 'UNIT',
          name: 'Unit',
        },
      },
    ]);
    prisma.legacyOrgUnitMapping.findMany.mockResolvedValue([]);

    const context = await service.getCreatorContext(user);

    expect(authorization.visibleOrgUnitIds).toHaveBeenCalledWith(
      user,
      'users.request_create',
      'office-1',
    );
    expect(context.requestableOrgUnits).toHaveLength(1);
  });

  it('rejects Super Admin from the normal Office request-creation flow', async () => {
    const { service, prisma } = buildService();
    allowActiveOfficeUser(prisma, AccountRole.SUPER_ADMIN);

    await expect(
      service.getCreatorContext({
        accountId: 'account-1',
        sessionId: 'session-1',
        username: 'superadmin.com',
        role: AccountRole.SUPER_ADMIN,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a requested Office outside the requester primary membership', async () => {
    const { service, prisma } = buildService();
    allowActiveOfficeUser(prisma);

    await expect(
      service.resolveCreateTarget(user, {
        officeId: 'office-2',
        intendedOrgUnitId: 'unit-requestable',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires an intended OrgUnit when no compatibility department is supplied', async () => {
    const { service, prisma } = buildService();
    allowActiveOfficeUser(prisma);

    await expect(
      service.resolveCreateTarget(user, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps a legacy department to its reconciled OrgUnit and checks central capability scope', async () => {
    const { service, prisma, authorization } = buildService();
    allowActiveOfficeUser(prisma);

    prisma.legacyOrgUnitMapping.findFirst.mockResolvedValue({
      officeId: 'office-1',
      orgUnitId: 'unit-department',
    });
    prisma.orgUnit.findUnique.mockResolvedValue({
      id: 'unit-department',
      officeId: 'office-1',
      code: 'OPS',
      name: 'Operations',
      isActive: true,
      parentOrgUnitId: 'unit-division',
      orgUnitType: {
        code: 'DEPARTMENT',
        name: 'Department',
      },
    });
    prisma.orgUnitClosure.findMany.mockResolvedValue([
      {
        ancestorOrgUnitId: 'unit-department',
        depth: 0,
      },
      {
        ancestorOrgUnitId: 'unit-division',
        depth: 1,
      },
    ]);
    prisma.legacyOrgUnitMapping.findMany.mockResolvedValue([
      {
        legacyEntityType: 'DEPARTMENT',
        legacyEntityId: 'department-legacy',
        orgUnitId: 'unit-department',
      },
      {
        legacyEntityType: 'DIVISION',
        legacyEntityId: 'division-legacy',
        orgUnitId: 'unit-division',
      },
    ]);
    prisma.department.findUnique.mockResolvedValue({
      id: 'department-legacy',
      divisionId: 'division-legacy',
      isActive: true,
      division: {
        isActive: true,
      },
    });

    const target = await service.resolveCreateTarget(user, {
      legacyDepartmentId: 'department-legacy',
    });

    expect(authorization.assertCan).toHaveBeenCalledWith(
      user,
      'users.request_create',
      'office-1',
      'unit-department',
    );
    expect(target).toMatchObject({
      requesterId: 'account-1',
      legacyDivisionId: 'division-legacy',
      legacyDepartmentId: 'department-legacy',
      intendedOrgUnit: {
        id: 'unit-department',
      },
    });
  });
});
