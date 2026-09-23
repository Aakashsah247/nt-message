import { ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AccountClass } from '../generated/prisma/client';

import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationHierarchyService } from './organization-hierarchy.service';

describe('OrganizationHierarchyService Office Head context', () => {
  const officeUser = {
    accountId: 'office-head-account',
    accountClass: AccountClass.OFFICE_USER,
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
              orgUnits: 10,
              memberships: 20,
            },
          },
        ]),
      },
      orgMembership: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;
  }

  it('identifies an active Office Head using V3 leadership authority', async () => {
    const authority = {
      listVisibleOfficeIds: jest.fn().mockResolvedValue(['office-1']),
      assertOfficeHead: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorityService;

    const service = new OrganizationHierarchyService(
      createPrisma(),
      authority,
      {} as OrganizationAuthorizationService,
    );

    await expect(service.getOfficeHeadContext(officeUser)).resolves.toEqual({
      isOfficeHead: true,
      officeIds: ['office-1'],
    });
  });

  it('does not classify an ordinary Office user as Office Head', async () => {
    const authority = {
      listVisibleOfficeIds: jest.fn().mockResolvedValue(['office-1']),
      assertOfficeHead: jest
        .fn()
        .mockRejectedValue(new ForbiddenException('Office Head required.')),
    } as unknown as OrganizationAuthorityService;

    const service = new OrganizationHierarchyService(
      createPrisma(),
      authority,
      {} as OrganizationAuthorizationService,
    );

    await expect(service.getOfficeHeadContext(officeUser)).resolves.toEqual({
      isOfficeHead: false,
      officeIds: [],
    });
  });

  it('keeps Super Admin outside Office Head authority', async () => {
    const authority = {
      listVisibleOfficeIds: jest.fn(),
      assertOfficeHead: jest.fn(),
    } as unknown as OrganizationAuthorityService;

    const service = new OrganizationHierarchyService(
      createPrisma(),
      authority,
      {} as OrganizationAuthorizationService,
    );

    await expect(
      service.getOfficeHeadContext({
        accountId: 'super-admin',
        accountClass: AccountClass.SUPER_ADMIN,
      } as AuthenticatedUser),
    ).resolves.toEqual({
      isOfficeHead: false,
      officeIds: [],
    });

    expect(authority.assertOfficeHead).not.toHaveBeenCalled();
  });
});
