import { ConflictException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AccountClass, AccountRole } from '../generated/prisma/client';

import { SHARED_RESPONSIBILITIES } from './organization-capabilities';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationDelegationService } from './organization-delegation.service';

const user = {
  accountId: 'account-1',
  accountClass: AccountClass.OFFICE_USER,
  role: AccountRole.EMPLOYEE,
} as AuthenticatedUser;

function authorization() {
  return {
    isOfficeHead: jest.fn().mockResolvedValue(false),
    canRedelegateResponsibility: jest.fn().mockResolvedValue(true),
  } as unknown as OrganizationAuthorizationService;
}

describe('OrganizationDelegationService candidate scoping', () => {
  it('queries employee candidates only inside the selected OrgUnit subtree', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      delegatedPermission: {
        findFirst: jest.fn().mockResolvedValue({ id: 'grant-1' }),
      },
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'finance-division',
          orgUnitType: { code: 'DIVISION' },
        }),
      },
      orgUnitClosure: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { descendantOrgUnitId: 'finance-division' },
            { descendantOrgUnitId: 'finance-department' },
          ]),
      },
      orgMembership: { findMany },
    } as unknown as PrismaService;

    const service = new OrganizationDelegationService(prisma, authorization());

    await service.getUiContext(user, 'office-1', {
      orgUnitId: 'finance-division',
      includeDescendants: 'true',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          officeId: 'office-1',
          orgUnitId: {
            in: ['finance-division', 'finance-department'],
          },
        }),
      }),
    );
  });

  it('rejects a grantee outside the selected delegated OrgUnit subtree', async () => {
    const membershipFindFirst = jest.fn().mockResolvedValue(null);
    const prisma = {
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'finance-division',
          orgUnitType: { code: 'DIVISION' },
        }),
      },
      orgUnitClosure: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { descendantOrgUnitId: 'finance-division' },
            { descendantOrgUnitId: 'finance-department' },
          ]),
      },
      account: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'account-2',
          accountClass: AccountClass.OFFICE_USER,
          isEnabled: true,
          employeeId: 'employee-2',
        }),
      },
      orgMembership: {
        findFirst: membershipFindFirst,
      },
    } as unknown as PrismaService;

    const service = new OrganizationDelegationService(prisma, authorization());

    await expect(
      service.create(user, 'office-1', {
        granteeAccountId: 'account-2',
        capability: SHARED_RESPONSIBILITIES.WORK_MANAGEMENT,
        orgUnitId: 'finance-division',
        includeDescendants: true,
        reason: 'Finance operational coverage',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(membershipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          employeeId: 'employee-2',
          officeId: 'office-1',
          orgUnitId: {
            in: ['finance-division', 'finance-department'],
          },
        }),
      }),
    );
  });
});
