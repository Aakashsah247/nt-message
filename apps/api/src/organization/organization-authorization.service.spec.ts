import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
} from '../generated/prisma/client';

import {
  CAPABILITIES,
} from './organization-capabilities';
import { OrganizationAuthorizationService } from './organization-authorization.service';

describe('OrganizationAuthorizationService', () => {
  const employeeUser = {
    accountId: 'account-1',
    role: AccountRole.EMPLOYEE,
  } as AuthenticatedUser;

  const superAdmin = {
    accountId: 'super-admin',
    role: AccountRole.SUPER_ADMIN,
  } as AuthenticatedUser;

  function activeEmployeeAccount(
    role: AccountRole = AccountRole.EMPLOYEE,
  ) {
    return {
      id: 'account-1',
      role,
      isEnabled: true,
      employee: {
        id: 'employee-1',
        status: EmployeeStatus.ACTIVE,
        employmentStatus: EmploymentStatus.ACTIVE,
        archivedAt: null,
      },
    };
  }

  function createPrisma() {
    return {
      account: {
        findUnique: jest
          .fn()
          .mockResolvedValue(activeEmployeeAccount()),
      },
      orgMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'membership-1',
        }),
      },
      orgLeadershipAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      delegatedPermission: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      orgUnitClosure: {
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      orgUnit: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
  }

  it('keeps Super Admin Work access read-only', async () => {
    const prisma = createPrisma();

    prisma.account.findUnique.mockResolvedValue({
      id: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
      isEnabled: true,
      employee: null,
    });

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.can(
        superAdmin,
        CAPABILITIES.WORK_VIEW,
        'office-1',
      ),
    ).resolves.toBe(true);

    await expect(
      service.can(
        superAdmin,
        CAPABILITIES.WORK_CREATE,
        'office-1',
      ),
    ).resolves.toBe(false);

    await expect(
      service.can(
        superAdmin,
        CAPABILITIES.WORK_ASSIGN,
        'office-1',
      ),
    ).resolves.toBe(false);
  });

  it('does not grant Deputy automatic management authority', async () => {
    const prisma = createPrisma();

    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.DEPUTY,
        orgUnitId: 'unit-1',
      },
    ]);

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.MEMBERSHIP_TRANSFER_INTERNAL,
        'office-1',
        'unit-1',
      ),
    ).resolves.toBe(false);
  });

  it('allows an explicit delegated capability without changing role', async () => {
    const prisma = createPrisma();

    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.DEPUTY,
        orgUnitId: 'unit-1',
      },
    ]);

    prisma.delegatedPermission.findMany.mockResolvedValue([
      {
        orgUnitId: 'unit-1',
        includeDescendants: false,
      },
    ]);

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.MEMBERSHIP_TRANSFER_INTERNAL,
        'office-1',
        'unit-1',
      ),
    ).resolves.toBe(true);
  });

  it('limits Team Lead capability to the Team itself', async () => {
    const prisma = createPrisma();

    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.TEAM_LEAD,
        orgUnitId: 'team-1',
      },
    ]);

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.MEMBERSHIP_VIEW,
        'office-1',
        'team-1',
      ),
    ).resolves.toBe(true);

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.MEMBERSHIP_VIEW,
        'office-1',
        'team-child',
      ),
    ).resolves.toBe(false);
  });

  it('allows Org Unit Head capability across descendants', async () => {
    const prisma = createPrisma();

    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
        orgUnitId: 'unit-1',
      },
    ]);

    prisma.orgUnitClosure.findUnique.mockResolvedValue({
      depth: 2,
    });

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.MEMBERSHIP_VIEW,
        'office-1',
        'child-2',
      ),
    ).resolves.toBe(true);
  });

  it('does not grant Team Lead structural mutation', async () => {
    const prisma = createPrisma();

    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.TEAM_LEAD,
        orgUnitId: 'team-1',
      },
    ]);

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.ORGANIZATION_RENAME_UNIT,
        'office-1',
        'team-1',
      ),
    ).resolves.toBe(false);
  });

  it('does not grant Org Unit Head structural mutation without delegation', async () => {
    const prisma = createPrisma();

    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
        orgUnitId: 'unit-1',
      },
    ]);

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.ORGANIZATION_RENAME_UNIT,
        'office-1',
        'unit-1',
      ),
    ).resolves.toBe(false);
  });

  it('allows an explicitly delegated structural mutation within scope', async () => {
    const prisma = createPrisma();

    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
        orgUnitId: 'unit-1',
      },
    ]);

    prisma.delegatedPermission.findMany.mockResolvedValue([
      {
        orgUnitId: 'unit-1',
        includeDescendants: false,
      },
    ]);

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.ORGANIZATION_RENAME_UNIT,
        'office-1',
        'unit-1',
      ),
    ).resolves.toBe(true);
  });
});
