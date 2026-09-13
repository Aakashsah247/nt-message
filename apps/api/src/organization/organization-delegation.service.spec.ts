import { ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AccountClass, AccountRole } from '../generated/prisma/client';

import { CAPABILITIES } from './organization-capabilities';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationDelegationService } from './organization-delegation.service';

describe('OrganizationDelegationService', () => {
  it('does not allow Super Admin to create internal Office delegation', async () => {
    const prisma = {} as PrismaService;

    const authorization = {} as OrganizationAuthorizationService;

    const service = new OrganizationDelegationService(prisma, authorization);

    await expect(
      service.create(
        {
          accountId: 'super-admin',
          accountClass: AccountClass.SUPER_ADMIN,
          role: AccountRole.SUPER_ADMIN,
        } as AuthenticatedUser,
        'office-1',
        {
          granteeAccountId: 'account-1',
          capability: CAPABILITIES.MEMBERSHIP_VIEW,
          reason: 'Internal delegation',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not allow protected system capabilities to be delegated', async () => {
    const prisma = {} as PrismaService;

    const authorization = {} as OrganizationAuthorizationService;

    const service = new OrganizationDelegationService(prisma, authorization);

    await expect(
      service.create(
        {
          accountId: 'office-head',
          accountClass: AccountClass.OFFICE_USER,
          role: AccountRole.EMPLOYEE,
        } as AuthenticatedUser,
        'office-1',
        {
          granteeAccountId: 'account-1',
          capability: CAPABILITIES.SYSTEM_SECURITY,
          reason: 'Not allowed',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('passes requested descendant scope and effective period into anti-escalation authorization', async () => {
    const prisma = {
      orgUnit: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'unit-1',
        }),
      },
    } as unknown as PrismaService;

    const authorization = {
      canRedelegate: jest.fn().mockResolvedValue(false),
    } as unknown as OrganizationAuthorizationService;

    const service = new OrganizationDelegationService(prisma, authorization);

    const effectiveFrom = '2026-09-03T00:00:00.000Z';
    const effectiveUntil = '2026-09-04T00:00:00.000Z';

    await expect(
      service.create(
        {
          accountId: 'delegated-manager',
          accountClass: AccountClass.OFFICE_USER,
          role: AccountRole.EMPLOYEE,
        } as AuthenticatedUser,
        'office-1',
        {
          granteeAccountId: 'account-2',
          capability: CAPABILITIES.ORGANIZATION_RENAME_UNIT,
          orgUnitId: 'unit-1',
          includeDescendants: true,
          effectiveFrom,
          effectiveUntil,
          reason: 'Temporary delegated administration',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(authorization.canRedelegate).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'delegated-manager',
      }),
      CAPABILITIES.ORGANIZATION_RENAME_UNIT,
      'office-1',
      'unit-1',
      true,
      new Date(effectiveFrom),
      new Date(effectiveUntil),
    );
  });
});
