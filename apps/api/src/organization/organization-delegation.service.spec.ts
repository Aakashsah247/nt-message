import { ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import { AccountRole } from '../generated/prisma/client';

import { CAPABILITIES } from './organization-capabilities';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { OrganizationDelegationService } from './organization-delegation.service';

describe('OrganizationDelegationService', () => {
  it('does not allow Super Admin to create internal Office delegation', async () => {
    const prisma = {} as PrismaService;

    const authorization =
      {} as OrganizationAuthorizationService;

    const service =
      new OrganizationDelegationService(
        prisma,
        authorization,
      );

    await expect(
      service.create(
        {
          accountId: 'super-admin',
          role: AccountRole.SUPER_ADMIN,
        } as AuthenticatedUser,
        'office-1',
        {
          granteeAccountId: 'account-1',
          capability:
            CAPABILITIES.MEMBERSHIP_VIEW,
          reason: 'Internal delegation',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not allow protected system capabilities to be delegated', async () => {
    const prisma = {} as PrismaService;

    const authorization =
      {} as OrganizationAuthorizationService;

    const service =
      new OrganizationDelegationService(
        prisma,
        authorization,
      );

    await expect(
      service.create(
        {
          accountId: 'office-head',
          role: AccountRole.EMPLOYEE,
        } as AuthenticatedUser,
        'office-1',
        {
          granteeAccountId: 'account-1',
          capability:
            CAPABILITIES.SYSTEM_SECURITY,
          reason: 'Not allowed',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
