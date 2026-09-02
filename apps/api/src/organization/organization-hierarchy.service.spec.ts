import { ConflictException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AccountRole } from '../generated/prisma/client';

import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationHierarchyService } from './organization-hierarchy.service';

describe('OrganizationHierarchyService', () => {
  const user = {
    accountId: 'office-head-account',
    role: AccountRole.EMPLOYEE,
  } as AuthenticatedUser;

  it('creates closure links when adding a child unit', async () => {
    const transaction = {
      orgUnitType: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'type-1',
        }),
      },
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'parent-1',
        }),
        create: jest.fn().mockResolvedValue({
          id: 'child-1',
          officeId: 'office-1',
          parentOrgUnitId: 'parent-1',
          orgUnitTypeId: 'type-1',
          code: 'CHILD',
          name: 'Child',
        }),
      },
      orgUnitClosure: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([
          {
            ancestorOrgUnitId: 'root-1',
            depth: 1,
          },
          {
            ancestorOrgUnitId: 'parent-1',
            depth: 0,
          },
        ]),
        createMany: jest.fn().mockResolvedValue({
          count: 2,
        }),
      },
    };

    const prisma = {
      $transaction: jest.fn(
        async (
          callback: (
            tx: typeof transaction,
          ) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaService;

    const authority = {
      assertCanManageOrgUnit: jest
        .fn()
        .mockResolvedValue(undefined),
      assertOfficeHead: jest.fn(),
    } as unknown as OrganizationAuthorityService;

    const service =
      new OrganizationHierarchyService(
        prisma,
        authority,
      );

    await service.createOrgUnit(
      user,
      'office-1',
      {
        orgUnitTypeId: 'type-1',
        parentOrgUnitId: 'parent-1',
        code: 'child',
        name: 'Child',
      },
    );

    expect(
      transaction.orgUnitClosure.create,
    ).toHaveBeenCalledWith({
      data: {
        ancestorOrgUnitId: 'child-1',
        descendantOrgUnitId: 'child-1',
        depth: 0,
      },
    });

    expect(
      transaction.orgUnitClosure.createMany,
    ).toHaveBeenCalledWith({
      data: [
        {
          ancestorOrgUnitId: 'root-1',
          descendantOrgUnitId: 'child-1',
          depth: 2,
        },
        {
          ancestorOrgUnitId: 'parent-1',
          descendantOrgUnitId: 'child-1',
          depth: 1,
        },
      ],
    });
  });

  it('rejects a move beneath one of the unit descendants', async () => {
    const orgUnitFindFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'unit-1',
        officeId: 'office-1',
        parentOrgUnitId: null,
        orgUnitTypeId: 'type-1',
        isActive: true,
      })
      .mockResolvedValueOnce({
        id: 'child-1',
      });

    const transaction = {
      orgUnitClosure: {
        findUnique: jest.fn().mockResolvedValue({
          depth: 1,
        }),
      },
    };

    const prisma = {
      orgUnit: {
        findFirst: orgUnitFindFirst,
      },
      $transaction: jest.fn(
        async (
          callback: (
            tx: typeof transaction,
          ) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaService;

    const authority = {
      assertCanManageOrgUnit: jest
        .fn()
        .mockResolvedValue(undefined),
      assertOfficeHead: jest.fn(),
    } as unknown as OrganizationAuthorityService;

    const service =
      new OrganizationHierarchyService(
        prisma,
        authority,
      );

    await expect(
      service.moveOrgUnit(
        user,
        'office-1',
        'unit-1',
        {
          parentOrgUnitId: 'child-1',
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
