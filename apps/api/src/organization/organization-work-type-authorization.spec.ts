import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
} from '../generated/prisma/client';
import { CAPABILITIES } from './organization-capabilities';
import { OrganizationAuthorizationService } from './organization-authorization.service';

const officeHeadUser = {
  accountId: 'office-head-account',
  role: AccountRole.EMPLOYEE,
  accountClass: AccountClass.OFFICE_USER,
} as AuthenticatedUser;

const superAdmin = {
  accountId: 'super-admin-account',
  role: AccountRole.SUPER_ADMIN,
  accountClass: AccountClass.SUPER_ADMIN,
} as AuthenticatedUser;

function officeHeadPrisma() {
  return {
    account: {
      findUnique: jest.fn().mockResolvedValue({
        id: officeHeadUser.accountId,
        role: AccountRole.EMPLOYEE,
        accountClass: AccountClass.OFFICE_USER,
        isEnabled: true,
        employee: {
          id: 'employee-1',
          status: EmployeeStatus.ACTIVE,
          employmentStatus: EmploymentStatus.ACTIVE,
          archivedAt: null,
        },
      }),
    },
    orgMembership: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'membership-1',
        orgUnitId: null,
      }),
    },
    orgLeadershipAssignment: {
      findMany: jest.fn().mockResolvedValue([
        {
          leadershipType: OrgLeadershipType.OFFICE_HEAD,
          orgUnitId: null,
        },
      ]),
      findFirst: jest.fn().mockResolvedValue({
        id: 'leadership-1',
        effectiveUntil: null,
      }),
    },
    delegatedPermission: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

describe('work type V3 authorization', () => {
  it('gives the Office Head office-level view, draft and publish authority', async () => {
    const authorization = new OrganizationAuthorizationService(
      officeHeadPrisma(),
    );

    await expect(
      authorization.can(
        officeHeadUser,
        CAPABILITIES.WORK_TYPE_VIEW,
        'office-1',
        null,
      ),
    ).resolves.toBe(true);

    await expect(
      authorization.can(
        officeHeadUser,
        CAPABILITIES.WORK_TYPE_DRAFT,
        'office-1',
        null,
      ),
    ).resolves.toBe(true);

    await expect(
      authorization.can(
        officeHeadUser,
        CAPABILITIES.WORK_TYPE_PUBLISH,
        'office-1',
        null,
      ),
    ).resolves.toBe(true);
  });

  it('keeps Super Admin read-only for Work Type configuration', async () => {
    const prisma = {
      account: {
        findUnique: jest.fn().mockResolvedValue({
          id: superAdmin.accountId,
          role: AccountRole.SUPER_ADMIN,
          accountClass: AccountClass.SUPER_ADMIN,
          isEnabled: true,
          employee: null,
        }),
      },
    } as unknown as PrismaService;

    const authorization = new OrganizationAuthorizationService(prisma);

    await expect(
      authorization.can(
        superAdmin,
        CAPABILITIES.WORK_TYPE_VIEW,
        'office-1',
        null,
      ),
    ).resolves.toBe(true);

    await expect(
      authorization.can(
        superAdmin,
        CAPABILITIES.WORK_TYPE_DRAFT,
        'office-1',
        null,
      ),
    ).resolves.toBe(false);

    await expect(
      authorization.can(
        superAdmin,
        CAPABILITIES.WORK_TYPE_PUBLISH,
        'office-1',
        null,
      ),
    ).resolves.toBe(false);
  });

  it('keeps Work Type publish protected from re-delegation', async () => {
    const authorization = new OrganizationAuthorizationService(
      officeHeadPrisma(),
    );

    await expect(
      authorization.canRedelegate(
        officeHeadUser,
        CAPABILITIES.WORK_TYPE_PUBLISH,
        'office-1',
        null,
      ),
    ).resolves.toBe(false);
  });

  it('gives Division Head Work Type view, draft and publish authority without granting it to lower OrgUnit Heads', async () => {
    const makePrisma = (typeCode: string) =>
      ({
        account: {
          findUnique: jest.fn().mockResolvedValue({
            id: officeHeadUser.accountId,
            role: AccountRole.EMPLOYEE,
            accountClass: AccountClass.OFFICE_USER,
            isEnabled: true,
            employee: {
              id: 'employee-division-head',
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              archivedAt: null,
            },
          }),
        },
        orgMembership: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'membership-division',
            orgUnitId: 'unit-1',
          }),
        },
        orgLeadershipAssignment: {
          findMany: jest.fn().mockResolvedValue([
            {
              leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
              orgUnitId: 'unit-1',
              orgUnit: { orgUnitType: { code: typeCode } },
            },
          ]),
        },
        delegatedPermission: { findMany: jest.fn().mockResolvedValue([]) },
      }) as unknown as PrismaService;

    for (const capability of [
      CAPABILITIES.WORK_TYPE_VIEW,
      CAPABILITIES.WORK_TYPE_DRAFT,
      CAPABILITIES.WORK_TYPE_PUBLISH,
    ]) {
      await expect(
        new OrganizationAuthorizationService(makePrisma('DIVISION')).can(
          officeHeadUser,
          capability,
          'office-1',
          null,
        ),
      ).resolves.toBe(true);

      await expect(
        new OrganizationAuthorizationService(makePrisma('DEPARTMENT')).can(
          officeHeadUser,
          capability,
          'office-1',
          null,
        ),
      ).resolves.toBe(false);
    }
  });
});
