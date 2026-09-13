import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  AccountRole,
  ConversationParticipantRole,
  OfficialGroupMembershipMode,
  OfficialGroupScopeType,
  OrgLeadershipType,
} from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('P12-E official-group V3 authorization', () => {
  const officeId = '11111111-1111-4111-8111-111111111111';
  const rootOrgUnitId = '22222222-2222-4222-8222-222222222222';
  const childOrgUnitId = '33333333-3333-4333-8333-333333333333';
  const siblingOrgUnitId = '44444444-4444-4444-8444-444444444444';
  const teamOrgUnitId = '55555555-5555-4555-8555-555555555555';
  const employeeId = '66666666-6666-4666-8666-666666666666';
  const accountId = '77777777-7777-4777-8777-777777777777';

  const employeeUser = {
    accountId,
    sessionId: 'session-1',
    role: AccountRole.EMPLOYEE,
    accountClass: AccountClass.OFFICE_USER,
  } as AuthenticatedUser;

  function activeAccount(role = AccountRole.EMPLOYEE) {
    return {
      id: accountId,
      role,
      accountClass: AccountClass.OFFICE_USER,
      isEnabled: true,
      employee: {
        id: employeeId,
        status: 'ACTIVE',
        employmentStatus: 'ACTIVE',
        archivedAt: null,
      },
    };
  }

  function authorizationPrisma() {
    return {
      account: {
        findUnique: jest.fn().mockResolvedValue(activeAccount()),
      },
      orgMembership: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'membership-1',
          orgUnitId: rootOrgUnitId,
        }),
      },
      orgLeadershipAssignment: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn(),
      },
      delegatedPermission: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      operationalTeamLeadAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
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

  it('keeps Super Admin read-only for official groups', async () => {
    const prisma = authorizationPrisma();
    prisma.account.findUnique.mockResolvedValue({
      id: 'super-admin',
      role: AccountRole.SUPER_ADMIN,
      accountClass: AccountClass.SUPER_ADMIN,
      isEnabled: true,
      employee: null,
    });
    const service = new OrganizationAuthorizationService(
      prisma as unknown as PrismaService,
    );
    const superAdmin = {
      accountId: 'super-admin',
      sessionId: 'session-1',
      role: AccountRole.SUPER_ADMIN,
      accountClass: AccountClass.SUPER_ADMIN,
    } as AuthenticatedUser;

    await expect(
      service.can(superAdmin, CAPABILITIES.OFFICIAL_GROUP_VIEW, officeId),
    ).resolves.toBe(true);
    await expect(
      service.can(superAdmin, CAPABILITIES.OFFICIAL_GROUP_MANAGE, officeId),
    ).resolves.toBe(false);
  });

  it('gives Office Head Office-wide official-group management authority', async () => {
    const prisma = authorizationPrisma();
    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.OFFICE_HEAD,
        orgUnitId: null,
      },
    ]);
    const service = new OrganizationAuthorizationService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.OFFICIAL_GROUP_MANAGE,
        officeId,
        null,
      ),
    ).resolves.toBe(true);
    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.OFFICIAL_GROUP_MANAGE,
        officeId,
        childOrgUnitId,
      ),
    ).resolves.toBe(true);
  });

  it('limits Org Unit Head authority to its own subtree', async () => {
    const prisma = authorizationPrisma();
    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
        orgUnitId: rootOrgUnitId,
      },
    ]);
    prisma.orgUnitClosure.findUnique.mockImplementation(async (args) => {
      const relation = args.where.ancestorOrgUnitId_descendantOrgUnitId;
      return relation.ancestorOrgUnitId === rootOrgUnitId &&
        relation.descendantOrgUnitId === childOrgUnitId
        ? { depth: 1 }
        : null;
    });
    const service = new OrganizationAuthorizationService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.OFFICIAL_GROUP_MANAGE,
        officeId,
        childOrgUnitId,
      ),
    ).resolves.toBe(true);
    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.OFFICIAL_GROUP_MANAGE,
        officeId,
        siblingOrgUnitId,
      ),
    ).resolves.toBe(false);
    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.OFFICIAL_GROUP_MANAGE,
        officeId,
        null,
      ),
    ).resolves.toBe(false);
  });

  it('uses current OperationalTeamLeadAssignment for exact Team scope', async () => {
    const prisma = authorizationPrisma();
    prisma.operationalTeamLeadAssignment.findFirst.mockImplementation(
      async (args) =>
        args.where.team.is.orgUnitId === teamOrgUnitId
          ? { id: 'lead-1' }
          : null,
    );
    const service = new OrganizationAuthorizationService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.OFFICIAL_GROUP_MANAGE,
        officeId,
        teamOrgUnitId,
      ),
    ).resolves.toBe(true);
    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.OFFICIAL_GROUP_MANAGE,
        officeId,
        siblingOrgUnitId,
      ),
    ).resolves.toBe(false);
  });

  it('does not revive historical OrgLeadership TEAM_LEAD authority', async () => {
    const prisma = authorizationPrisma();
    prisma.orgLeadershipAssignment.findMany.mockResolvedValue([
      {
        leadershipType: OrgLeadershipType.TEAM_LEAD,
        orgUnitId: teamOrgUnitId,
      },
    ]);
    const service = new OrganizationAuthorizationService(
      prisma as unknown as PrismaService,
    );

    await expect(
      service.can(
        employeeUser,
        CAPABILITIES.OFFICIAL_GROUP_MANAGE,
        officeId,
        teamOrgUnitId,
      ),
    ).resolves.toBe(false);
  });

  it('allows exact delegation for direct membership but not subtree control', async () => {
    const prisma = {
      account: { findUnique: jest.fn() },
      office: { findUnique: jest.fn() },
      orgUnit: { findFirst: jest.fn() },
      division: { findUnique: jest.fn() },
      department: { findUnique: jest.fn() },
      orgLeadershipAssignment: { findMany: jest.fn() },
      delegatedPermission: { findMany: jest.fn() },
      orgUnitClosure: { findUnique: jest.fn() },
    } as unknown as PrismaService;
    const service = new ConversationsService(
      prisma,
      { emitConversationUpdated: jest.fn() } as never,
      {} as never,
    );
    const authorization = (
      service as unknown as {
        organizationAuthorization: OrganizationAuthorizationService;
      }
    ).organizationAuthorization;
    jest.spyOn(authorization, 'can').mockResolvedValue(true);
    jest
      .spyOn(
        service as unknown as {
          canManageOfficialGroupSubtree: () => Promise<boolean>;
        },
        'canManageOfficialGroupSubtree',
      )
      .mockResolvedValue(false);
    const manage = (
      service as unknown as {
        canManageOfficialGroupScope: (
          viewer: unknown,
          office: string,
          orgUnit: string,
          mode: OfficialGroupMembershipMode,
        ) => Promise<boolean>;
      }
    ).canManageOfficialGroupScope.bind(service);
    const viewer = {
      accountId,
      employeeId,
      role: AccountRole.EMPLOYEE,
      divisionId: null,
      departmentId: null,
    };

    await expect(
      manage(
        viewer,
        officeId,
        childOrgUnitId,
        OfficialGroupMembershipMode.DIRECT_MEMBERS,
      ),
    ).resolves.toBe(true);
    await expect(
      manage(
        viewer,
        officeId,
        childOrgUnitId,
        OfficialGroupMembershipMode.ENTIRE_SUBTREE,
      ),
    ).resolves.toBe(false);
  });

  it('derives group participant roles from V3 authority sets instead of legacy roles', () => {
    const service = new ConversationsService(
      {} as PrismaService,
      { emitConversationUpdated: jest.fn() } as never,
      {} as never,
    );
    const roleFor = (
      service as unknown as {
        getOfficialGroupParticipantRole: (
          account: { id: string },
          officeHeads: ReadonlySet<string>,
          managers: ReadonlySet<string>,
        ) => ConversationParticipantRole;
      }
    ).getOfficialGroupParticipantRole.bind(service);

    expect(
      roleFor({ id: accountId }, new Set<string>(), new Set<string>()),
    ).toBe(ConversationParticipantRole.MEMBER);
    expect(
      roleFor({ id: accountId }, new Set<string>(), new Set([accountId])),
    ).toBe(ConversationParticipantRole.ADMIN);
    expect(
      roleFor({ id: accountId }, new Set([accountId]), new Set([accountId])),
    ).toBe(ConversationParticipantRole.OWNER);
  });
});
