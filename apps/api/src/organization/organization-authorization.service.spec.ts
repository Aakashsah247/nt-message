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

    await expect(
      service.can(
        superAdmin,
        CAPABILITIES.WORK_START_STAGE,
        'office-1',
      ),
    ).resolves.toBe(false);

    await expect(
      service.can(
        superAdmin,
        CAPABILITIES.WORK_APPROVE_STAGE,
        'office-1',
      ),
    ).resolves.toBe(false);

    await expect(
      service.can(
        superAdmin,
        CAPABILITIES.WORK_CANCEL,
        'office-1',
      ),
    ).resolves.toBe(false);
  });

  it('grants Work lifecycle capabilities only through current leadership scope', async () => {
    const prisma = createPrisma();

    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
        orgUnitId: 'unit-1',
      },
    ]);

    prisma.orgUnitClosure.findUnique.mockImplementation(async (args) => {
      const relation = args.where.ancestorOrgUnitId_descendantOrgUnitId;

      if (
        relation.ancestorOrgUnitId === 'unit-1' &&
        relation.descendantOrgUnitId === 'child-1'
      ) {
        return { depth: 1 };
      }

      return null;
    });

    const service = new OrganizationAuthorizationService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.WORK_APPROVE_STAGE,
        'office-1',
        'child-1',
      ),
    ).resolves.toBe(true);

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.WORK_RETURN_STAGE,
        'office-1',
        'child-1',
      ),
    ).resolves.toBe(true);

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.WORK_CANCEL,
        'office-1',
        'child-1',
      ),
    ).resolves.toBe(true);

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.WORK_REOPEN,
        'office-1',
        'child-1',
      ),
    ).resolves.toBe(true);

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.WORK_APPROVE_STAGE,
        'office-1',
        'outside-scope',
      ),
    ).resolves.toBe(false);
  });

  it('allows an active Office member to reach the Work Type creation policy gate', async () => {
    const prisma = createPrisma();
    const service = new OrganizationAuthorizationService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.can(employeeUser, CAPABILITIES.WORK_CREATE, 'office-1'),
    ).resolves.toBe(true);

    await expect(
      service.can(employeeUser, CAPABILITIES.WORK_START_STAGE, 'office-1'),
    ).resolves.toBe(true);

    await expect(
      service.can(employeeUser, CAPABILITIES.WORK_SUBMIT_STAGE, 'office-1'),
    ).resolves.toBe(true);
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


  it('grants users.request_create automatically to the current Office Head', async () => {
    const prisma = createPrisma();

    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.OFFICE_HEAD,
        orgUnitId: null,
      },
    ]);

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.USERS_REQUEST_CREATE,
        'office-1',
        'unit-1',
      ),
    ).resolves.toBe(true);
  });

  it('does not grant users.request_create to Team Lead by default', async () => {
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
        CAPABILITIES.USERS_REQUEST_CREATE,
        'office-1',
        'team-1',
      ),
    ).resolves.toBe(false);
  });

  it('allows users.request_create only when explicitly delegated to a normal Office user', async () => {
    const prisma = createPrisma();

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
        CAPABILITIES.USERS_REQUEST_CREATE,
        'office-1',
        'unit-1',
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

  it('does not let an exact-scope grant expand into descendant scope', async () => {
    const prisma = createPrisma();

    prisma.delegatedPermission.findMany.mockResolvedValue([
      {
        orgUnitId: 'unit-1',
        includeDescendants: false,
        effectiveUntil: null,
      },
    ]);

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.canRedelegate(
        employeeUser,
        CAPABILITIES.ORGANIZATION_RENAME_UNIT,
        'office-1',
        'unit-1',
        true,
        new Date('2026-09-03T00:00:00.000Z'),
        null,
      ),
    ).resolves.toBe(false);
  });

  it('allows descendant redelegation only from an existing subtree grant', async () => {
    const prisma = createPrisma();

    prisma.delegatedPermission.findMany.mockResolvedValue([
      {
        orgUnitId: 'unit-1',
        includeDescendants: true,
        effectiveUntil: null,
      },
    ]);

    prisma.orgUnitClosure.findUnique.mockResolvedValue({
      depth: 1,
    });

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.canRedelegate(
        employeeUser,
        CAPABILITIES.ORGANIZATION_RENAME_UNIT,
        'office-1',
        'child-1',
        true,
        new Date('2026-09-03T00:00:00.000Z'),
        null,
      ),
    ).resolves.toBe(true);
  });

  it('does not let a finite delegated grant create authority beyond its expiry', async () => {
    const prisma = createPrisma();

    prisma.delegatedPermission.findMany.mockResolvedValue([
      {
        orgUnitId: 'unit-1',
        includeDescendants: false,
        effectiveUntil: new Date(
          '2026-09-05T00:00:00.000Z',
        ),
      },
    ]);

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.canRedelegate(
        employeeUser,
        CAPABILITIES.ORGANIZATION_RENAME_UNIT,
        'office-1',
        'unit-1',
        false,
        new Date('2026-09-04T00:00:00.000Z'),
        null,
      ),
    ).resolves.toBe(false);
  });

  it('does not let a temporary Office Head delegate beyond the leadership period', async () => {
    const prisma = createPrisma();

    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.OFFICE_HEAD,
        orgUnitId: null,
      },
    ]);

    prisma.orgLeadershipAssignment.findFirst.mockResolvedValue({
      id: 'acting-office-head',
      effectiveUntil: new Date('2026-09-05T00:00:00.000Z'),
    });

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.canRedelegate(
        employeeUser,
        CAPABILITIES.ORGANIZATION_RENAME_UNIT,
        'office-1',
        'unit-1',
        false,
        new Date('2026-09-04T00:00:00.000Z'),
        new Date('2026-09-06T00:00:00.000Z'),
      ),
    ).resolves.toBe(false);
  });

  it('denies protected Office access when the user has no active primary membership in that Office', async () => {
    const prisma = createPrisma();

    prisma.orgMembership.findFirst.mockResolvedValue(null);
    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.OFFICE_HEAD,
        orgUnitId: null,
      },
    ]);
    prisma.delegatedPermission.findMany.mockResolvedValue([
      {
        orgUnitId: null,
        includeDescendants: true,
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
        'other-office',
        'unit-1',
      ),
    ).resolves.toBe(false);

    expect(
      prisma.orgLeadershipAssignment.findMany,
    ).not.toHaveBeenCalled();
    expect(
      prisma.delegatedPermission.findMany,
    ).not.toHaveBeenCalled();
  });

  it('limits a normal employee organization view to the effective breadcrumb', async () => {
    const prisma = createPrisma();

    prisma.orgMembership.findFirst.mockResolvedValue({
      id: 'membership-1',
      orgUnitId: 'team-1',
    });

    prisma.orgUnitClosure.findUnique.mockImplementation(
      async (args) => {
        const relation =
          args.where
            .ancestorOrgUnitId_descendantOrgUnitId;

        if (
          relation.descendantOrgUnitId === 'team-1' &&
          relation.ancestorOrgUnitId === 'department-1'
        ) {
          return { depth: 1 };
        }

        return null;
      },
    );

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.ORGANIZATION_VIEW,
        'office-1',
        'team-1',
      ),
    ).resolves.toBe(true);

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.ORGANIZATION_VIEW,
        'office-1',
        'department-1',
      ),
    ).resolves.toBe(true);

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.ORGANIZATION_VIEW,
        'office-1',
        'sibling-team',
      ),
    ).resolves.toBe(false);

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.ORGANIZATION_VIEW,
        'office-1',
        null,
      ),
    ).resolves.toBe(false);
  });

  it('keeps Org Unit Head authority inside its own subtree', async () => {
    const prisma = createPrisma();

    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
        orgUnitId: 'unit-1',
      },
    ]);

    prisma.orgUnitClosure.findUnique.mockImplementation(
      async (args) => {
        const relation =
          args.where
            .ancestorOrgUnitId_descendantOrgUnitId;

        if (
          relation.ancestorOrgUnitId === 'unit-1' &&
          relation.descendantOrgUnitId === 'child-1'
        ) {
          return { depth: 1 };
        }

        return null;
      },
    );

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.MEMBERSHIP_VIEW,
        'office-1',
        'child-1',
      ),
    ).resolves.toBe(true);

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.MEMBERSHIP_VIEW,
        'office-1',
        'parent-1',
      ),
    ).resolves.toBe(false);

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.MEMBERSHIP_VIEW,
        'office-1',
        'sibling-1',
      ),
    ).resolves.toBe(false);

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.MEMBERSHIP_VIEW,
        'office-1',
        'outside-subtree',
      ),
    ).resolves.toBe(false);
  });

  it('removes Acting Office Head authority exactly at effectiveUntil', async () => {
    const prisma = createPrisma();
    const effectiveUntil = new Date(
      '2026-09-05T00:00:00.000Z',
    );

    prisma.orgLeadershipAssignment.findMany.mockImplementation(
      async (args) => {
        const at = args.where.effectiveFrom.lte as Date;

        return at.getTime() < effectiveUntil.getTime()
          ? [
              {
                leadershipType:
                  OrgLeadershipType.OFFICE_HEAD,
                orgUnitId: null,
              },
            ]
          : [];
      },
    );

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.LEADERSHIP_ASSIGN,
        'office-1',
        'unit-1',
        new Date('2026-09-04T23:59:59.999Z'),
      ),
    ).resolves.toBe(true);

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.LEADERSHIP_ASSIGN,
        'office-1',
        'unit-1',
        effectiveUntil,
      ),
    ).resolves.toBe(false);

    expect(
      prisma.orgLeadershipAssignment.findMany,
    ).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          effectiveFrom: {
            lte: effectiveUntil,
          },
          OR: [
            {
              effectiveUntil: null,
            },
            {
              effectiveUntil: {
                gt: effectiveUntil,
              },
            },
          ],
        }),
      }),
    );
  });

  it('gives a Deputy only the explicitly delegated capability', async () => {
    const prisma = createPrisma();

    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.DEPUTY,
        orgUnitId: 'unit-1',
      },
    ]);

    prisma.delegatedPermission.findMany.mockImplementation(
      async (args) =>
        args.where.capability ===
        CAPABILITIES.MEMBERSHIP_TRANSFER_INTERNAL
          ? [
              {
                orgUnitId: 'unit-1',
                includeDescendants: false,
              },
            ]
          : [],
    );

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

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.LEADERSHIP_ASSIGN,
        'office-1',
        'unit-1',
      ),
    ).resolves.toBe(false);
  });

  it('does not recognize an Office Head after primary Office membership ends', async () => {
    const prisma = createPrisma();

    prisma.orgMembership.findFirst.mockResolvedValue(null);
    prisma.orgLeadershipAssignment.findFirst.mockResolvedValue({
      id: 'stale-office-head',
      effectiveUntil: null,
    });

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.isOfficeHead(
        employeeUser,
        'office-1',
        new Date('2026-09-03T00:00:00.000Z'),
      ),
    ).resolves.toBe(false);

    expect(
      prisma.orgLeadershipAssignment.findFirst,
    ).not.toHaveBeenCalled();
  });

  it('does not expose scoped OrgUnits for an inactive employee account', async () => {
    const prisma = createPrisma();

    prisma.account.findUnique.mockResolvedValue({
      ...activeEmployeeAccount(),
      isEnabled: false,
    });

    const service =
      new OrganizationAuthorizationService(
        prisma as unknown as PrismaService,
      );

    await expect(
      service.visibleOrgUnitIds(
        employeeUser,
        CAPABILITIES.LEADERSHIP_VIEW,
        'office-1',
      ),
    ).resolves.toEqual([]);

    expect(
      prisma.orgLeadershipAssignment.findMany,
    ).not.toHaveBeenCalled();
    expect(
      prisma.delegatedPermission.findMany,
    ).not.toHaveBeenCalled();
  });

});
