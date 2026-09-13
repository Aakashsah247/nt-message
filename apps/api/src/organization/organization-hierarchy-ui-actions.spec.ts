import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AccountClass, AccountRole } from '../generated/prisma/client';

import { CAPABILITIES } from './organization-capabilities';
import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationHierarchyService } from './organization-hierarchy.service';

describe('OrganizationHierarchyService UI action context', () => {
  const employeeUser = {
    accountId: 'employee-account',
    accountClass: AccountClass.OFFICE_USER,
    role: AccountRole.EMPLOYEE,
  } as AuthenticatedUser;

  const superAdminUser = {
    accountId: 'super-admin-account',
    accountClass: AccountClass.SUPER_ADMIN,
    role: AccountRole.SUPER_ADMIN,
  } as AuthenticatedUser;

  it('derives unit actions from central capability authorization', async () => {
    const prisma = {
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'unit-1',
          officeId: 'office-1',
        }),
      },
    } as unknown as PrismaService;

    const authority = {
      assertCanViewOffice: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorityService;

    const authorization = {
      can: jest.fn(
        async (
          _user: AuthenticatedUser,
          capability: string,
        ) =>
          capability === CAPABILITIES.ORGANIZATION_CREATE_UNIT ||
          capability === CAPABILITIES.ORGANIZATION_RENAME_UNIT,
      ),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationHierarchyService(
      prisma,
      authority,
      authorization,
    );

    await expect(
      service.getAvailableActions(
        employeeUser,
        'office-1',
        'unit-1',
      ),
    ).resolves.toEqual({
      officeId: 'office-1',
      orgUnitId: 'unit-1',
      availableActions: {
        createChildUnit: true,
        renameUnit: true,
        moveUnit: false,
        changeUnitStatus: false,
      },
    });

    expect(authority.assertCanViewOffice).toHaveBeenCalledWith(
      employeeUser,
      'office-1',
    );
    expect(authorization.can).toHaveBeenCalledTimes(4);
    expect(authorization.can).toHaveBeenCalledWith(
      employeeUser,
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      'office-1',
      'unit-1',
    );
    expect(authorization.can).toHaveBeenCalledWith(
      employeeUser,
      CAPABILITIES.ORGANIZATION_RENAME_UNIT,
      'office-1',
      'unit-1',
    );
    expect(authorization.can).toHaveBeenCalledWith(
      employeeUser,
      CAPABILITIES.ORGANIZATION_MOVE_UNIT,
      'office-1',
      'unit-1',
    );
    expect(authorization.can).toHaveBeenCalledWith(
      employeeUser,
      CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
      'office-1',
      'unit-1',
    );
  });

  it('keeps Super Admin mutation actions hidden when central authorization denies them', async () => {
    const prisma = {} as PrismaService;

    const authority = {
      assertCanViewOffice: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorityService;

    const authorization = {
      can: jest.fn().mockResolvedValue(false),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationHierarchyService(
      prisma,
      authority,
      authorization,
    );

    await expect(
      service.getAvailableActions(
        superAdminUser,
        'office-1',
        null,
      ),
    ).resolves.toEqual({
      officeId: 'office-1',
      orgUnitId: null,
      availableActions: {
        createChildUnit: false,
        renameUnit: false,
        moveUnit: false,
        changeUnitStatus: false,
      },
    });

    expect(authority.assertCanViewOffice).toHaveBeenCalledWith(
      superAdminUser,
      'office-1',
    );
    expect(authorization.can).toHaveBeenCalledTimes(1);
    expect(authorization.can).toHaveBeenCalledWith(
      superAdminUser,
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      'office-1',
      null,
    );
  });
});
