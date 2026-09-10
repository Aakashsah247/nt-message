import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  OfficialGroupMembershipMode,
  OfficialGroupScopeType,
  OrgMembershipType,
} from '../generated/prisma/client';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService official-group OrgUnit runtime', () => {
  const officeId = '11111111-1111-4111-8111-111111111111';
  const orgUnitId = '22222222-2222-4222-8222-222222222222';
  const childOrgUnitId = '33333333-3333-4333-8333-333333333333';
  const accountId = '44444444-4444-4444-8444-444444444444';
  const employeeId = '55555555-5555-4555-8555-555555555555';

  const messagingEventsService = {
    emitConversationUpdated: jest.fn(),
  };

  const transaction = {
    conversation: {
      create: jest.fn(),
    },
    conversationParticipant: {
      createMany: jest.fn(),
    },
    officialGroupAuditLog: {
      create: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn(),
    account: {
      findUnique: jest.fn(),
    },
    conversation: {
      findMany: jest.fn(),
    },
    office: {
      findUnique: jest.fn(),
    },
    orgUnit: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    orgUnitClosure: {
      findMany: jest.fn(),
    },
    orgMembership: {
      findMany: jest.fn(),
    },
    orgLeadershipAssignment: {
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;

  let service: ConversationsService;

  const account = {
    id: accountId,
    username: 'employee',
    role: AccountRole.EMPLOYEE,
    isEnabled: true,
    profilePhotoKey: null,
    profileBio: null,
    showOnlineStatus: true,
    showReadReceipts: true,
    requireMessageRequests: true,
    superAdminProfile: null,
    employee: {
      id: employeeId,
      empId: 'NTC-2001',
      empName: 'Employee One',
      officialEmail: 'employee@example.com',
      phoneNumber: '9800000000',
      designation: 'Engineer',
      profilePhotoKey: null,
      profileBio: null,
      status: 'ACTIVE',
      employmentStatus: 'ACTIVE',
      archivedAt: null,
      isActivated: true,
      divisionId: null,
      departmentId: null,
      division: null,
      departmentUnit: null,
    },
  };

  function group(
    membershipMode: OfficialGroupMembershipMode,
    scopeType = OfficialGroupScopeType.ORG_UNIT,
  ) {
    return {
      id: 'official-group-1',
      createdByAccountId: accountId,
      officialScopeType: scopeType,
      officialDivisionId: null,
      officialDepartmentId: null,
      officialOfficeId: officeId,
      officialOrgUnitId:
        scopeType === OfficialGroupScopeType.ORG_UNIT ? orgUnitId : null,
      officialMembershipMode: membershipMode,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationsService(
      prisma,
      messagingEventsService as never,
      {} as never,
    );
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback) =>
        (callback as (tx: typeof transaction) => Promise<unknown>)(transaction),
      );
  });

  it('uses only the selected OrgUnit for DIRECT_MEMBERS membership', async () => {
    jest
      .mocked(prisma.orgMembership.findMany)
      .mockResolvedValue([{ employee: { account } }] as never);

    const result = await (
      service as unknown as {
        getV3OfficialGroupMembershipAccounts: (
          value: unknown,
        ) => Promise<Array<{ id: string }>>;
      }
    ).getV3OfficialGroupMembershipAccounts(
      group(OfficialGroupMembershipMode.DIRECT_MEMBERS),
    );

    expect(prisma.orgUnitClosure.findMany).not.toHaveBeenCalled();
    expect(prisma.orgMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          officeId,
          membershipType: OrgMembershipType.PRIMARY,
          orgUnitId: { in: [orgUnitId] },
        }),
      }),
    );
    expect(result.map((item) => item.id)).toEqual([accountId]);
  });

  it('expands ENTIRE_SUBTREE membership through OrgUnitClosure', async () => {
    jest
      .mocked(prisma.orgUnitClosure.findMany)
      .mockResolvedValue([
        { descendantOrgUnitId: orgUnitId },
        { descendantOrgUnitId: childOrgUnitId },
      ] as never);
    jest
      .mocked(prisma.orgMembership.findMany)
      .mockResolvedValue([{ employee: { account } }] as never);

    await (
      service as unknown as {
        getV3OfficialGroupMembershipAccounts: (
          value: unknown,
        ) => Promise<unknown>;
      }
    ).getV3OfficialGroupMembershipAccounts(
      group(OfficialGroupMembershipMode.ENTIRE_SUBTREE),
    );

    expect(prisma.orgUnitClosure.findMany).toHaveBeenCalledWith({
      where: { ancestorOrgUnitId: orgUnitId },
      select: { descendantOrgUnitId: true },
    });
    expect(prisma.orgMembership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          orgUnitId: { in: [orgUnitId, childOrgUnitId] },
        }),
      }),
    );
  });

  it('uses every active primary Office membership for an OFFICE group', async () => {
    jest
      .mocked(prisma.orgMembership.findMany)
      .mockResolvedValue([{ employee: { account } }] as never);

    await (
      service as unknown as {
        getV3OfficialGroupMembershipAccounts: (
          value: unknown,
        ) => Promise<unknown>;
      }
    ).getV3OfficialGroupMembershipAccounts(
      group(
        OfficialGroupMembershipMode.ENTIRE_SUBTREE,
        OfficialGroupScopeType.OFFICE,
      ),
    );

    const where = jest.mocked(prisma.orgMembership.findMany).mock.calls[0]?.[0]
      ?.where as Record<string, unknown>;
    expect(prisma.orgUnitClosure.findMany).not.toHaveBeenCalled();
    expect(where.officeId).toBe(officeId);
    expect(where).not.toHaveProperty('orgUnitId');
  });

  it('synchronizes account groups by active V3 Office membership instead of legacy Division/Department fields', async () => {
    jest.mocked(prisma.account.findUnique).mockResolvedValue({
      employee: { id: employeeId },
    } as never);
    jest
      .mocked(prisma.orgMembership.findMany)
      .mockResolvedValue([{ officeId }] as never);
    jest.mocked(prisma.conversation.findMany).mockResolvedValue([] as never);

    await service.synchronizeOfficialGroupsForAccountSafely(
      accountId,
      accountId,
      'TEST_SYNC',
    );

    expect(prisma.conversation.findMany).toHaveBeenCalledWith({
      where: {
        type: 'GROUP',
        groupKind: 'OFFICIAL',
        OR: [
          { participants: { some: { accountId } } },
          { officialOfficeId: { in: [officeId] } },
        ],
      },
      select: { id: true },
    });
  });

  it('publishes Office Head scope options for Office, direct OrgUnit, and subtree OrgUnit groups', async () => {
    jest
      .spyOn(
        service as unknown as {
          getMessagingViewer: () => Promise<unknown>;
        },
        'getMessagingViewer',
      )
      .mockResolvedValue({
        accountId,
        employeeId,
        role: AccountRole.EMPLOYEE,
        divisionId: null,
        departmentId: null,
      });
    jest
      .spyOn(
        service as unknown as {
          isActiveOfficeHeadForOffice: () => Promise<boolean>;
        },
        'isActiveOfficeHeadForOffice',
      )
      .mockResolvedValue(true);
    jest.mocked(prisma.orgMembership.findMany).mockResolvedValue([
      {
        officeId,
        office: {
          id: officeId,
          code: 'PATAN',
          name: 'Patan Telecom Office',
          isActive: true,
        },
      },
    ] as never);
    jest.mocked(prisma.orgUnit.findMany).mockResolvedValue([
      {
        id: orgUnitId,
        officeId,
        parentOrgUnitId: null,
        code: 'TECH',
        name: 'Technical',
        isActive: true,
        orgUnitType: {
          id: 'type-1',
          code: 'UNIT',
          name: 'Unit',
          isTeam: false,
        },
      },
    ] as never);

    const result = await service.listOfficialGroupScopes({
      accountId,
      sessionId: 'session-1',
    } as never);

    expect(result.canCreate).toBe(true);
    expect(result.canReconcileAll).toBe(true);
    expect(result.scopes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scopeType: OfficialGroupScopeType.OFFICE,
          officeId,
          orgUnitId: null,
          membershipMode: OfficialGroupMembershipMode.ENTIRE_SUBTREE,
        }),
        expect.objectContaining({
          scopeType: OfficialGroupScopeType.ORG_UNIT,
          orgUnitId,
          membershipMode: OfficialGroupMembershipMode.DIRECT_MEMBERS,
        }),
        expect.objectContaining({
          scopeType: OfficialGroupScopeType.ORG_UNIT,
          orgUnitId,
          membershipMode: OfficialGroupMembershipMode.ENTIRE_SUBTREE,
        }),
      ]),
    );
  });
  it('persists Office/OrgUnit scope and membership mode when creating a V3 official group', async () => {
    jest
      .spyOn(
        service as unknown as {
          getMessagingViewer: () => Promise<unknown>;
        },
        'getMessagingViewer',
      )
      .mockResolvedValue({
        accountId,
        employeeId,
        role: AccountRole.EMPLOYEE,
        divisionId: null,
        departmentId: null,
      });
    jest
      .spyOn(
        service as unknown as {
          getAuthorizedOfficialGroupScope: () => Promise<unknown>;
        },
        'getAuthorizedOfficialGroupScope',
      )
      .mockResolvedValue({
        scopeType: OfficialGroupScopeType.ORG_UNIT,
        officeId,
        orgUnitId,
        membershipMode: OfficialGroupMembershipMode.DIRECT_MEMBERS,
        office: null,
        orgUnit: null,
        division: null,
        department: null,
      });
    jest
      .spyOn(
        service as unknown as {
          getDesiredOfficialGroupMembership: () => Promise<unknown>;
        },
        'getDesiredOfficialGroupMembership',
      )
      .mockResolvedValue({
        accounts: [account],
        officeHeadAccountIds: new Set([accountId]),
      });
    jest
      .spyOn(
        service as unknown as {
          getConversationRecord: () => Promise<unknown>;
        },
        'getConversationRecord',
      )
      .mockResolvedValue({ id: 'official-group-1' });
    jest
      .spyOn(
        service as unknown as {
          serializeConversation: () => unknown;
        },
        'serializeConversation',
      )
      .mockReturnValue({ id: 'official-group-1' });
    transaction.conversation.create.mockResolvedValue({
      id: 'official-group-1',
    });

    await service.createOfficialGroupConversation(
      { accountId, sessionId: 'session-1' } as never,
      {
        title: 'Technical Direct',
        description: 'Direct members only',
        scopeType: 'ORG_UNIT',
        officeId,
        orgUnitId,
        membershipMode: 'DIRECT_MEMBERS',
      },
    );

    expect(transaction.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupKind: 'OFFICIAL',
        officialScopeType: OfficialGroupScopeType.ORG_UNIT,
        officialOfficeId: officeId,
        officialOrgUnitId: orgUnitId,
        officialMembershipMode: OfficialGroupMembershipMode.DIRECT_MEMBERS,
        officialDivisionId: null,
        officialDepartmentId: null,
      }),
      select: { id: true },
    });
    expect(transaction.officialGroupAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          officeId,
          orgUnitId,
          membershipMode: OfficialGroupMembershipMode.DIRECT_MEMBERS,
        }),
      }),
    });
  });
});
