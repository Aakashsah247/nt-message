import { ForbiddenException } from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
} from '../generated/prisma/client';

import { OrganizationAuthorityService } from './organization-authority.service';

describe('OrganizationAuthorityService', () => {
  const employeeUser = {
    accountId: 'account-1',
    role: AccountRole.EMPLOYEE,
  } as AuthenticatedUser;

  function activeAccount() {
    return {
      isEnabled: true,
      employee: {
        id: 'employee-1',
        status: EmployeeStatus.ACTIVE,
        employmentStatus: EmploymentStatus.ACTIVE,
        archivedAt: null,
      },
    };
  }

  it('keeps Super Admin outside internal organization mutation', async () => {
    const prisma = {} as PrismaService;

    const service = new OrganizationAuthorityService(prisma);

    await expect(
      service.assertCanManageOrgUnit(
        {
          accountId: 'super-admin',
          role: AccountRole.SUPER_ADMIN,
        } as AuthenticatedUser,
        'office-1',
        'unit-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not grant formal organization mutation from legacy Team Lead rows', async () => {
    const leadershipFindFirst = jest.fn(
      async (input: {
        where?: Record<string, unknown>;
      }) => {
        const where = input.where ?? {};

        if (
          where.leadershipType ===
          OrgLeadershipType.OFFICE_HEAD
        ) {
          return null;
        }

        return null;
      },
    );

    const prisma = {
      account: {
        findUnique: jest.fn().mockResolvedValue(activeAccount()),
      },
      orgLeadershipAssignment: {
        findFirst: leadershipFindFirst,
      },
    } as unknown as PrismaService;

    const service = new OrganizationAuthorityService(prisma);

    await expect(
      service.assertCanManageOrgUnit(
        employeeUser,
        'office-1',
        'team-1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      service.assertCanManageOrgUnit(
        employeeUser,
        'office-1',
        'team-child',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows Org Unit Head authority through the descendant closure', async () => {
    const leadershipFindFirst = jest.fn(
      async (input: {
        where?: Record<string, unknown>;
      }) => {
        const where = input.where ?? {};

        if (
          where.leadershipType ===
          OrgLeadershipType.OFFICE_HEAD
        ) {
          return null;
        }

        const serialized = JSON.stringify(where);

        if (
          serialized.includes(
            `"leadershipType":"${OrgLeadershipType.ORG_UNIT_HEAD}"`,
          ) &&
          serialized.includes(
            '"descendantOrgUnitId":"child-unit"',
          )
        ) {
          return { id: 'unit-head-assignment' };
        }

        return null;
      },
    );

    const prisma = {
      account: {
        findUnique: jest.fn().mockResolvedValue(activeAccount()),
      },
      orgLeadershipAssignment: {
        findFirst: leadershipFindFirst,
      },
    } as unknown as PrismaService;

    const service = new OrganizationAuthorityService(prisma);

    await expect(
      service.assertCanManageOrgUnit(
        employeeUser,
        'office-1',
        'child-unit',
      ),
    ).resolves.toBeUndefined();
  });
});
