import { BadRequestException, ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AccountClass, AccountRole } from '../generated/prisma/client';

import {
  CAPABILITIES,
  SHARED_RESPONSIBILITIES,
} from './organization-capabilities';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationDelegationService } from './organization-delegation.service';

const user = {
  accountId: 'account-1',
  accountClass: AccountClass.OFFICE_USER,
  role: AccountRole.EMPLOYEE,
} as AuthenticatedUser;

function createAuthorization() {
  return {
    can: jest.fn().mockResolvedValue(false),
    visibleOrgUnitIds: jest.fn().mockResolvedValue([]),
    isOfficeHead: jest.fn().mockResolvedValue(false),
    canRedelegate: jest.fn().mockResolvedValue(false),
    canRedelegateResponsibility: jest.fn().mockResolvedValue(false),
  } as unknown as OrganizationAuthorizationService;
}

describe('OrganizationDelegationService UI context', () => {
  it('does not allow self-delegation to create persistent authority', async () => {
    const prisma = {
      account: {
        findUnique: jest.fn().mockResolvedValue({
          id: user.accountId,
          accountClass: AccountClass.OFFICE_USER,
          role: AccountRole.EMPLOYEE,
          isEnabled: true,
          employeeId: 'employee-1',
        }),
      },
    } as unknown as PrismaService;

    const authorization = createAuthorization();
    authorization.canRedelegate = jest.fn().mockResolvedValue(true);

    const service = new OrganizationDelegationService(prisma, authorization);

    await expect(
      service.create(user, 'office-1', {
        granteeAccountId: user.accountId,
        capability: CAPABILITIES.MEMBERSHIP_VIEW,
        reason: 'Self grant is not allowed',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns only server-authorized shared responsibilities and excludes the actor from candidates', async () => {
    const prisma = {
      delegatedPermission: {
        findFirst: jest.fn().mockResolvedValue({ id: 'grant-1' }),
      },
      orgMembership: {
        findMany: jest.fn().mockResolvedValue([
          {
            orgUnit: null,
            employee: {
              id: 'employee-1',
              empId: 'NTC-1',
              empName: 'Current User',
              designation: 'Officer',
              account: {
                id: user.accountId,
                username: 'current',
                accountClass: AccountClass.OFFICE_USER,
                role: AccountRole.EMPLOYEE,
                isEnabled: true,
              },
            },
          },
          {
            orgUnit: {
              id: 'unit-1',
              code: 'TECH',
              name: 'Technical',
            },
            employee: {
              id: 'employee-2',
              empId: 'NTC-2',
              empName: 'Eligible User',
              designation: 'Engineer',
              account: {
                id: 'account-2',
                username: 'eligible',
                accountClass: AccountClass.OFFICE_USER,
                role: AccountRole.EMPLOYEE,
                isEnabled: true,
              },
            },
          },
        ]),
      },
    } as unknown as PrismaService;

    const authorization = createAuthorization();
    authorization.canRedelegateResponsibility = jest.fn(
      async (_user, responsibility) =>
        responsibility === SHARED_RESPONSIBILITIES.ORGANIZATION_DIRECTORY_VIEW,
    );

    const service = new OrganizationDelegationService(prisma, authorization);

    const result = await service.getUiContext(user, 'office-1', {});

    expect(result.hasDelegationAuthority).toBe(true);
    expect(result.availableResponsibilities).toEqual([
      SHARED_RESPONSIBILITIES.ORGANIZATION_DIRECTORY_VIEW,
    ]);
    expect(result.candidates).toEqual([
      expect.objectContaining({
        accountId: 'account-2',
        empId: 'NTC-2',
        empName: 'Eligible User',
      }),
    ]);
    expect(result.availableResponsibilities).not.toContain(
      SHARED_RESPONSIBILITIES.WORK_MANAGEMENT,
    );
  });

  it('keeps Work Type Management at Office or Division scope only', async () => {
    const prisma = {
      delegatedPermission: {
        findFirst: jest.fn().mockResolvedValue({ id: 'grant-1' }),
      },
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'section-1',
          orgUnitType: { code: 'SECTION' },
        }),
      },
      orgMembership: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    } as unknown as PrismaService;

    const authorization = createAuthorization();
    authorization.canRedelegateResponsibility = jest
      .fn()
      .mockResolvedValue(true);

    const service = new OrganizationDelegationService(prisma, authorization);
    const context = await service.getUiContext(user, 'office-1', {
      orgUnitId: 'section-1',
      includeDescendants: 'true',
    });

    expect(context.availableResponsibilities).not.toContain(
      SHARED_RESPONSIBILITIES.WORK_TYPE_MANAGEMENT,
    );
    expect(context.availableResponsibilities).toContain(
      SHARED_RESPONSIBILITIES.WORK_MANAGEMENT,
    );
  });

  it('rejects Work Type Management below Division scope or without descendant coverage', async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'section-1',
        orgUnitType: { code: 'SECTION' },
      })
      .mockResolvedValueOnce({
        id: 'division-1',
        orgUnitType: { code: 'DIVISION' },
      });
    const prisma = {
      orgUnit: { findFirst },
    } as unknown as PrismaService;
    const authorization = createAuthorization();
    authorization.canRedelegateResponsibility = jest
      .fn()
      .mockResolvedValue(true);
    const service = new OrganizationDelegationService(prisma, authorization);

    await expect(
      service.create(user, 'office-1', {
        granteeAccountId: 'account-2',
        capability: SHARED_RESPONSIBILITIES.WORK_TYPE_MANAGEMENT,
        orgUnitId: 'section-1',
        includeDescendants: true,
        reason: 'Work Type subject expert',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create(user, 'office-1', {
        granteeAccountId: 'account-2',
        capability: SHARED_RESPONSIBILITIES.WORK_TYPE_MANAGEMENT,
        orgUnitId: 'division-1',
        includeDescendants: false,
        reason: 'Work Type subject expert',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets a non-leadership grantor see and revoke their own delegation history', async () => {
    const now = new Date();
    const permission = {
      id: 'permission-1',
      officeId: 'office-1',
      orgUnitId: 'unit-1',
      granteeAccountId: 'account-2',
      grantedByAccountId: user.accountId,
      revokedByAccountId: null,
      capability: CAPABILITIES.MEMBERSHIP_VIEW,
      includeDescendants: false,
      canRedelegate: false,
      effectiveFrom: new Date(now.getTime() - 60_000),
      effectiveUntil: null,
      revokedAt: null,
      grantReason: 'Temporary responsibility',
      revokeReason: null,
      createdAt: now,
      updatedAt: now,
      grantee: {
        id: 'account-2',
        username: 'eligible',
        employee: {
          empId: 'NTC-2',
          empName: 'Eligible User',
        },
      },
      orgUnit: {
        id: 'unit-1',
        code: 'TECH',
        name: 'Technical',
      },
      grantedBy: {
        id: user.accountId,
        username: 'current',
      },
      revokedBy: null,
    };

    const findMany = jest.fn().mockResolvedValue([permission]);
    const prisma = {
      delegatedPermission: { findMany },
    } as unknown as PrismaService;

    const authorization = createAuthorization();
    const service = new OrganizationDelegationService(prisma, authorization);

    const result = await service.list(user, 'office-1');

    expect(result.data[0].availableActions.revoke).toBe(true);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          officeId: 'office-1',
          OR: expect.arrayContaining([
            { grantedByAccountId: user.accountId },
            { granteeAccountId: user.accountId },
          ]),
        }),
      }),
    );
  });

  it('rejects future revocation because revokedAt takes effect immediately in authorization checks', async () => {
    const update = jest.fn();
    const prisma = {
      delegatedPermission: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'permission-1',
          officeId: 'office-1',
          orgUnitId: 'unit-1',
          leadershipType: null,
          revokedAt: null,
          grantedByAccountId: user.accountId,
          effectiveFrom: new Date(Date.now() - 60_000),
        }),
        update,
      },
    } as unknown as PrismaService;

    const authorization = createAuthorization();
    const service = new OrganizationDelegationService(prisma, authorization);

    await expect(
      service.revoke(user, 'office-1', 'permission-1', {
        effectiveAt: new Date(Date.now() + 3_600_000).toISOString(),
        reason: 'Revoke later',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(update).not.toHaveBeenCalled();
  });
});
