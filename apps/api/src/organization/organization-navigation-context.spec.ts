import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AccountRole } from '../generated/prisma/client';

import { CAPABILITIES } from './organization-capabilities';
import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationHierarchyService } from './organization-hierarchy.service';

describe('OrganizationHierarchyService navigation context', () => {
  const superAdminUser = {
    accountId: 'super-admin-account',
    role: AccountRole.SUPER_ADMIN,
  } as AuthenticatedUser;

  const employeeUser = {
    accountId: 'employee-account',
    role: AccountRole.EMPLOYEE,
  } as AuthenticatedUser;

  function createPrisma() {
    return {
      office: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'office-1',
            code: 'PATAN',
            name: 'Patan Telecom Office',
            isActive: true,
            sortOrder: 0,
            createdAt: new Date('2026-09-01T00:00:00.000Z'),
            updatedAt: new Date('2026-09-01T00:00:00.000Z'),
            _count: {
              orgUnits: 14,
              memberships: 20,
            },
          },
        ]),
      },
    } as unknown as PrismaService;
  }

  function createAuthority() {
    return {
      listVisibleOfficeIds: jest.fn().mockResolvedValue(['office-1']),
    } as unknown as OrganizationAuthorityService;
  }

  it('gives Super Admin the read-only Organization Viewer navigation mode', async () => {
    const prisma = createPrisma();
    const authority = {
      listVisibleOfficeIds: jest.fn().mockResolvedValue(null),
    } as unknown as OrganizationAuthorityService;
    const authorization = {
      can: jest.fn(),
      visibleOrgUnitIds: jest.fn(),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationHierarchyService(
      prisma,
      authority,
      authorization,
    );

    await expect(
      service.getNavigationContext(superAdminUser),
    ).resolves.toEqual({
      mode: 'VIEW',
      officeIds: ['office-1'],
      manageableOfficeIds: [],
    });

    expect(authorization.can).not.toHaveBeenCalled();
    expect(authorization.visibleOrgUnitIds).not.toHaveBeenCalled();
  });

  it('shows Office Management when any structural capability is centrally visible', async () => {
    const prisma = createPrisma();
    const authority = createAuthority();
    const authorization = {
      can: jest.fn().mockResolvedValue(false),
      visibleOrgUnitIds: jest.fn(
        async (
          _user: AuthenticatedUser,
          capability: string,
        ) =>
          capability === CAPABILITIES.ORGANIZATION_RENAME_UNIT
            ? ['unit-1']
            : [],
      ),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationHierarchyService(
      prisma,
      authority,
      authorization,
    );

    await expect(
      service.getNavigationContext(employeeUser),
    ).resolves.toEqual({
      mode: 'MANAGE',
      officeIds: ['office-1'],
      manageableOfficeIds: ['office-1'],
    });

    expect(authorization.can).toHaveBeenCalledWith(
      employeeUser,
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      'office-1',
      null,
    );
  });

  it('hides Office Management when the employee has no structural mutation scope', async () => {
    const prisma = createPrisma();
    const authority = createAuthority();
    const authorization = {
      can: jest.fn().mockResolvedValue(false),
      visibleOrgUnitIds: jest.fn().mockResolvedValue([]),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationHierarchyService(
      prisma,
      authority,
      authorization,
    );

    await expect(
      service.getNavigationContext(employeeUser),
    ).resolves.toEqual({
      mode: 'NONE',
      officeIds: ['office-1'],
      manageableOfficeIds: [],
    });
  });
});
