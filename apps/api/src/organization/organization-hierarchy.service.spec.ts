import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AccountRole } from '../generated/prisma/client';

import { CAPABILITIES } from './organization-capabilities';
import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationAuthorizationService } from './organization-authorization.service';
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

    const authorization = {
      assertCan: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorizationService;

    const service =
      new OrganizationHierarchyService(
        prisma,
        authority,
        authorization,
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

    expect(authorization.assertCan).toHaveBeenCalledWith(
      user,
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      'office-1',
      'parent-1',
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

    const authorization = {
      assertCan: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorizationService;

    const service =
      new OrganizationHierarchyService(
        prisma,
        authority,
        authorization,
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

  it('rejects creating a child under a parent from another Office', async () => {
    const transaction = {
      orgUnitType: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'type-1',
        }),
      },
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
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

    const authorization = {
      assertCan: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorizationService;

    const service =
      new OrganizationHierarchyService(
        prisma,
        authority,
        authorization,
      );

    await expect(
      service.createOrgUnit(
        user,
        'office-1',
        {
          orgUnitTypeId: 'type-1',
          parentOrgUnitId: 'foreign-office-parent',
          code: 'child',
          name: 'Child',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      transaction.orgUnit.create,
    ).not.toHaveBeenCalled();
  });

  it('rejects moving a unit beneath a parent from another Office', async () => {
    const orgUnitFindFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'unit-1',
        officeId: 'office-1',
        parentOrgUnitId: null,
        orgUnitTypeId: 'type-1',
        isActive: true,
      })
      .mockResolvedValueOnce(null);

    const prisma = {
      orgUnit: {
        findFirst: orgUnitFindFirst,
      },
      $transaction: jest.fn(),
    } as unknown as PrismaService;

    const authority = {
      assertCanManageOrgUnit: jest
        .fn()
        .mockResolvedValue(undefined),
      assertOfficeHead: jest.fn(),
    } as unknown as OrganizationAuthorityService;

    const authorization = {
      assertCan: jest.fn().mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorizationService;

    const service =
      new OrganizationHierarchyService(
        prisma,
        authority,
        authorization,
      );

    await expect(
      service.moveOrgUnit(
        user,
        'office-1',
        'unit-1',
        {
          parentOrgUnitId: 'foreign-office-parent',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('does not fall back to legacy hierarchy authority when central authorization denies', async () => {
    const prisma = {
      $transaction: jest.fn(),
    } as unknown as PrismaService;

    const authority = {
      assertCanManageOrgUnit: jest
        .fn()
        .mockResolvedValue(undefined),
      assertOfficeHead: jest
        .fn()
        .mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorityService;

    const authorization = {
      assertCan: jest
        .fn()
        .mockRejectedValue(new ForbiddenException()),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationHierarchyService(
      prisma,
      authority,
      authorization,
    );

    await expect(
      service.createOrgUnit(user, 'office-1', {
        orgUnitTypeId: 'type-1',
        parentOrgUnitId: 'team-1',
        code: 'child',
        name: 'Child',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(authorization.assertCan).toHaveBeenCalledWith(
      user,
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      'office-1',
      'team-1',
    );
    expect(authority.assertCanManageOrgUnit).not.toHaveBeenCalled();
    expect(authority.assertOfficeHead).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns only centrally visible OrgUnits when reading the hierarchy tree', async () => {
    const prisma = {
      office: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'office-1',
          code: 'PATAN',
          name: 'Patan Telecom Office',
          isActive: true,
        }),
      },
      orgUnit: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'department-1',
            officeId: 'office-1',
            parentOrgUnitId: null,
            code: 'TECH',
            name: 'Technical',
            isActive: true,
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            orgUnitType: {
              id: 'type-1',
              code: 'DEPARTMENT',
              name: 'Department',
              isTeam: false,
              isActive: true,
            },
            _count: {
              memberships: 1,
              childOrgUnits: 1,
              leadershipAssignments: 1,
            },
          },
          {
            id: 'team-1',
            officeId: 'office-1',
            parentOrgUnitId: 'department-1',
            code: 'TEAM-1',
            name: 'Team One',
            isActive: true,
            sortOrder: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            orgUnitType: {
              id: 'type-2',
              code: 'TEAM',
              name: 'Team',
              isTeam: true,
              isActive: true,
            },
            _count: {
              memberships: 1,
              childOrgUnits: 0,
              leadershipAssignments: 1,
            },
          },
        ]),
      },
    } as unknown as PrismaService;

    const authority = {
      assertCanViewOffice: jest
        .fn()
        .mockResolvedValue(undefined),
    } as unknown as OrganizationAuthorityService;

    const authorization = {
      visibleOrgUnitIds: jest
        .fn()
        .mockResolvedValue([
          'department-1',
          'team-1',
        ]),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationHierarchyService(
      prisma,
      authority,
      authorization,
    );

    const result = await service.getTree(
      user,
      'office-1',
    );

    expect(authorization.visibleOrgUnitIds).toHaveBeenCalledWith(
      user,
      CAPABILITIES.ORGANIZATION_VIEW,
      'office-1',
    );

    expect(prisma.orgUnit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          officeId: 'office-1',
          id: {
            in: ['department-1', 'team-1'],
          },
        },
      }),
    );

    expect(result.tree).toHaveLength(1);
    expect(result.tree[0]).toEqual(
      expect.objectContaining({
        id: 'department-1',
        children: [
          expect.objectContaining({
            id: 'team-1',
          }),
        ],
      }),
    );
  });
});
