import { ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  AccountRole,
  ConversationParticipantRole,
  ConversationType,
  MessageRequestReason,
} from '../generated/prisma/client';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService group governance', () => {
  const prisma = {
    account: {
      findUnique: jest.fn(),
    },
    conversation: {
      findFirst: jest.fn(),
    },
    conversationParticipant: {
      findUnique: jest.fn(),
    },
  } as unknown as PrismaService;

  let service: ConversationsService;

  const assertCanDeleteMessageForEveryone = (
    viewerAccountId: string,
    viewerParticipant: { role: ConversationParticipantRole },
    message: { conversationId: string; senderAccountId: string },
  ) =>
    (
      service as unknown as {
        assertCanDeleteMessageForEveryone: (
          viewerAccountId: string,
          viewerParticipant: { role: ConversationParticipantRole },
          message: { conversationId: string; senderAccountId: string },
        ) => Promise<void>;
      }
    ).assertCanDeleteMessageForEveryone(
      viewerAccountId,
      viewerParticipant,
      message,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConversationsService(prisma, {} as never, {} as never);
  });


  it('uses AccountClass for messaging access independently of the normalized compatibility role', async () => {
    const account = {
      id: 'office-head-account',
      username: 'office-head',
      accountClass: AccountClass.OFFICE_USER,
      role: AccountRole.EMPLOYEE,
      isEnabled: true,
      showOnlineStatus: true,
      showReadReceipts: true,
      requireMessageRequests: false,
      employee: {
        id: 'office-head-employee',
        status: 'ACTIVE',
        employmentStatus: 'ACTIVE',
        archivedAt: null,
        isActivated: true,
        orgMemberships: [
          {
            startsAt: new Date('2026-01-01T00:00:00.000Z'),
            endsAt: null,
            office: { id: 'office-1', isActive: true },
            orgUnit: { id: 'org-unit-1', isActive: true },
          },
        ],
      },
    };

    (prisma.account.findUnique as jest.Mock).mockResolvedValue(account);

    const viewer = await (
      service as unknown as {
        getMessagingViewer: (user: unknown) => Promise<{
          accountId: string;
          role: AccountRole;
          officeId: string | null;
        }>;
      }
    ).getMessagingViewer({
      accountId: account.id,
      sessionId: 'session-1',
      username: account.username,
      accountClass: AccountClass.OFFICE_USER,
      role: AccountRole.EMPLOYEE,
    });

    expect(viewer).toEqual(
      expect.objectContaining({
        accountId: account.id,
        role: AccountRole.EMPLOYEE,
        officeId: 'office-1',
      }),
    );
  });

  it('elects only one active Office Head as official-group OWNER during leadership overlap', async () => {
    const creatorHead = { id: 'head-b' };
    const otherHead = { id: 'head-a' };
    const member = { id: 'member-1' };

    jest
      .spyOn(
        service as unknown as {
          resolveOfficialGroupOfficeId: () => Promise<string>;
        },
        'resolveOfficialGroupOfficeId',
      )
      .mockResolvedValue('office-1');
    jest
      .spyOn(
        service as unknown as {
          getV3OfficialGroupMembershipAccounts: () => Promise<unknown[]>;
        },
        'getV3OfficialGroupMembershipAccounts',
      )
      .mockResolvedValue([creatorHead, member]);
    jest
      .spyOn(
        service as unknown as {
          getActiveOfficeHeadAccountsForOffice: () => Promise<unknown[]>;
        },
        'getActiveOfficeHeadAccountsForOffice',
      )
      .mockResolvedValue([otherHead, creatorHead]);
    jest
      .spyOn(
        service as unknown as {
          getOfficialGroupManagerAccountIds: () => Promise<Set<string>>;
        },
        'getOfficialGroupManagerAccountIds',
      )
      .mockResolvedValue(new Set());

    const desired = await (
      service as unknown as {
        getDesiredOfficialGroupMembership: (group: unknown) => Promise<{
          accounts: Array<{ id: string }>;
          officeHeadAccountIds: Set<string>;
          managerAccountIds: Set<string>;
        }>;
      }
    ).getDesiredOfficialGroupMembership({
      id: 'official-group-1',
      createdByAccountId: creatorHead.id,
    });

    expect([...desired.officeHeadAccountIds]).toEqual([creatorHead.id]);
    expect(desired.managerAccountIds.has(otherHead.id)).toBe(true);
    expect(desired.accounts.map((account) => account.id).sort()).toEqual(
      [creatorHead.id, otherHead.id, member.id].sort(),
    );
  });

  it('assigns an active Office Head as ADMIN when explicitly added to a personal group', () => {
    const role = (
      service as unknown as {
        getPersonalGroupMemberRole: (
          isOfficeHead: boolean,
        ) => ConversationParticipantRole;
      }
    ).getPersonalGroupMemberRole(true);

    expect(role).toBe(ConversationParticipantRole.ADMIN);
  });

  it('keeps Super Admin and other normal personal-group participants as MEMBER', () => {
    const role = (
      service as unknown as {
        getPersonalGroupMemberRole: (
          isOfficeHead: boolean,
        ) => ConversationParticipantRole;
      }
    ).getPersonalGroupMemberRole(false);

    expect(role).toBe(ConversationParticipantRole.MEMBER);
  });

  it('makes the active Office Head OWNER of an official group and leaves Super Admin as a normal member', () => {
    const getOfficialRole = (
      account: unknown,
      officeHeadAccountIds: ReadonlySet<string>,
    ) =>
      (
        service as unknown as {
          getOfficialGroupParticipantRole: (
            account: unknown,
            officeHeadAccountIds: ReadonlySet<string>,
            managerAccountIds: ReadonlySet<string>,
          ) => ConversationParticipantRole;
        }
      ).getOfficialGroupParticipantRole(
        account,
        officeHeadAccountIds,
        new Set<string>(),
      );

    expect(
      getOfficialRole(
        { id: 'office-head-1', role: AccountRole.EMPLOYEE, employee: null },
        new Set(['office-head-1']),
      ),
    ).toBe(ConversationParticipantRole.OWNER);
    expect(
      getOfficialRole(
        { id: 'super-admin-1', role: AccountRole.SUPER_ADMIN, employee: null },
        new Set(),
      ),
    ).toBe(ConversationParticipantRole.MEMBER);
  });

  it('transfers first-contact privilege from Super Admin to Office Head', () => {
    const getReason = (
      viewer: unknown,
      target: unknown,
      officeHeadEmployeeIds: ReadonlySet<string>,
    ) =>
      (
        service as unknown as {
          getMessageRequestReason: (
            viewer: unknown,
            target: unknown,
            officeHeadEmployeeIds: ReadonlySet<string>,
            orgScope: {
              primaryByEmployeeId: Map<
                string,
                { officeId: string; orgUnitId: string }
              >;
              relatedOrgUnitPairs: Set<string>;
            },
          ) => MessageRequestReason | null;
        }
      ).getMessageRequestReason(viewer, target, officeHeadEmployeeIds, {
        primaryByEmployeeId: new Map(),
        relatedOrgUnitPairs: new Set(),
      });

    const employeeTarget = {
      id: 'employee-account-1',
      role: AccountRole.EMPLOYEE,
      employee: {
        id: 'employee-1',
        divisionId: 'division-1',
        departmentId: 'department-1',
      },
    };

    expect(
      getReason(
        {
          accountId: 'office-head-account',
          employeeId: 'office-head-employee',
          role: AccountRole.EMPLOYEE,
          divisionId: 'division-2',
          departmentId: null,
        },
        employeeTarget,
        new Set(['office-head-employee']),
      ),
    ).toBeNull();

    expect(
      getReason(
        {
          accountId: 'super-admin-account',
          employeeId: null,
          role: AccountRole.SUPER_ADMIN,
          divisionId: null,
          departmentId: null,
        },
        employeeTarget,
        new Set(),
      ),
    ).toBe(MessageRequestReason.OUTSIDE_ORG_SCOPE);
  });

  it('allows Super Admin to be blocked as a normal participant and protects the active Office Head', async () => {
    const assertCanBlock = (viewer: unknown, target: unknown) =>
      (
        service as unknown as {
          assertCanBlockAccount: (
            viewer: unknown,
            target: unknown,
          ) => Promise<void>;
        }
      ).assertCanBlockAccount(viewer, target);
    const officeHeadIdsSpy = jest.spyOn(
      service as unknown as {
        getActiveOfficeHeadEmployeeIds: () => Promise<Set<string>>;
      },
      'getActiveOfficeHeadEmployeeIds',
    );

    officeHeadIdsSpy.mockResolvedValueOnce(new Set());
    await expect(
      assertCanBlock(
        {
          accountId: 'employee-account',
          employeeId: 'employee-1',
          role: AccountRole.EMPLOYEE,
        },
        {
          id: 'super-admin-account',
          role: AccountRole.SUPER_ADMIN,
          employee: null,
        },
      ),
    ).resolves.toBeUndefined();

    officeHeadIdsSpy.mockResolvedValueOnce(new Set(['office-head-employee']));
    await expect(
      assertCanBlock(
        {
          accountId: 'employee-account',
          employeeId: 'employee-1',
          role: AccountRole.EMPLOYEE,
        },
        {
          id: 'office-head-account',
          role: AccountRole.EMPLOYEE,
          employee: { id: 'office-head-employee' },
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('keeps communication analytics on V3 Office authorization and outside Super Admin', async () => {
    const authorization = (
      service as unknown as {
        organizationAuthorization: {
          can: jest.Mock;
          visibleOrgUnitIds: jest.Mock;
        };
      }
    ).organizationAuthorization;
    jest.spyOn(authorization, 'can').mockResolvedValue(true);
    jest
      .spyOn(authorization, 'visibleOrgUnitIds')
      .mockResolvedValue(['unit-1']);

    const authorizeAnalytics = (viewer: unknown) =>
      (
        service as unknown as {
          getMessagingAnalyticsAuthorizationScope: (
            viewer: unknown,
          ) => Promise<unknown>;
        }
      ).getMessagingAnalyticsAuthorizationScope(viewer);

    await expect(
      authorizeAnalytics({
        accountId: 'office-head-account',
        employeeId: 'office-head-employee',
        role: AccountRole.EMPLOYEE,
        officeId: 'office-1',
        orgUnitId: 'unit-1',
      }),
    ).resolves.toMatchObject({
      officeId: 'office-1',
      isOfficeWide: true,
    });

    await expect(
      authorizeAnalytics({
        accountId: 'super-admin-account',
        employeeId: null,
        role: AccountRole.SUPER_ADMIN,
        officeId: null,
        orgUnitId: null,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('prevents the personal-group owner from demoting an active Office Head participant', async () => {
    jest
      .spyOn(
        service as unknown as { getMessagingViewer: () => Promise<unknown> },
        'getMessagingViewer',
      )
      .mockResolvedValue({ accountId: 'owner-1' });
    jest
      .spyOn(
        service as unknown as { getActiveGroupAccess: () => Promise<unknown> },
        'getActiveGroupAccess',
      )
      .mockResolvedValue({
        conversation: {
          groupKind: 'PERSONAL',
          participants: [
            {
              accountId: 'owner-1',
              role: ConversationParticipantRole.OWNER,
            },
            {
              accountId: 'office-head-1',
              role: ConversationParticipantRole.ADMIN,
            },
          ],
        },
        viewerParticipant: {
          role: ConversationParticipantRole.OWNER,
        },
      });
    jest.mocked(prisma.account.findUnique).mockResolvedValue({
      employeeId: 'employee-office-head-1',
    } as never);
    jest
      .spyOn(
        service as unknown as {
          isActiveOfficeHeadEmployee: () => Promise<boolean>;
        },
        'isActiveOfficeHeadEmployee',
      )
      .mockResolvedValue(true);

    await expect(
      service.updateGroupMemberRole(
        { accountId: 'owner-1', sessionId: 'session-1' } as never,
        'group-1',
        'office-head-1',
        { role: 'MEMBER' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('uses the same moderator delete policy for personal and official group conversations', async () => {
    jest.mocked(prisma.conversation.findFirst).mockResolvedValue({
      id: 'group-1',
    } as never);

    await assertCanDeleteMessageForEveryone(
      'owner-1',
      { role: ConversationParticipantRole.OWNER },
      { conversationId: 'group-1', senderAccountId: 'member-1' },
    );

    expect(prisma.conversation.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'group-1',
        type: ConversationType.GROUP,
      },
      select: {
        id: true,
      },
    });
  });

  it.each(['PERSONAL', 'OFFICIAL'] as const)(
    'allows the %s group owner to delete another participant message for everyone',
    async () => {
      jest.mocked(prisma.conversation.findFirst).mockResolvedValue({
        id: 'group-1',
      } as never);

      await expect(
        assertCanDeleteMessageForEveryone(
          'owner-1',
          { role: ConversationParticipantRole.OWNER },
          { conversationId: 'group-1', senderAccountId: 'admin-1' },
        ),
      ).resolves.toBeUndefined();
    },
  );

  it.each(['PERSONAL', 'OFFICIAL'] as const)(
    'allows a %s group admin to delete a non-owner message for everyone',
    async () => {
      jest.mocked(prisma.conversation.findFirst).mockResolvedValue({
        id: 'group-1',
      } as never);
      jest.mocked(prisma.conversationParticipant.findUnique).mockResolvedValue({
        role: ConversationParticipantRole.MEMBER,
      } as never);

      await expect(
        assertCanDeleteMessageForEveryone(
          'admin-1',
          { role: ConversationParticipantRole.ADMIN },
          { conversationId: 'group-1', senderAccountId: 'member-1' },
        ),
      ).resolves.toBeUndefined();
    },
  );

  it.each(['PERSONAL', 'OFFICIAL'] as const)(
    "prevents a %s group admin from deleting the owner's message",
    async () => {
      jest.mocked(prisma.conversation.findFirst).mockResolvedValue({
        id: 'group-1',
      } as never);
      jest.mocked(prisma.conversationParticipant.findUnique).mockResolvedValue({
        role: ConversationParticipantRole.OWNER,
      } as never);

      await expect(
        assertCanDeleteMessageForEveryone(
          'admin-1',
          { role: ConversationParticipantRole.ADMIN },
          { conversationId: 'group-1', senderAccountId: 'owner-1' },
        ),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it.each(['PERSONAL', 'OFFICIAL'] as const)(
    'does not give %s group moderation rights to a normal member',
    async () => {
      jest.mocked(prisma.conversation.findFirst).mockResolvedValue({
        id: 'group-1',
      } as never);

      await expect(
        assertCanDeleteMessageForEveryone(
          'member-1',
          { role: ConversationParticipantRole.MEMBER },
          { conversationId: 'group-1', senderAccountId: 'member-2' },
        ),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it('keeps delete-for-everyone sender-only in private conversations', async () => {
    jest.mocked(prisma.conversation.findFirst).mockResolvedValue(null);

    await expect(
      assertCanDeleteMessageForEveryone(
        'viewer-1',
        { role: ConversationParticipantRole.MEMBER },
        { conversationId: 'private-1', senderAccountId: 'sender-1' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
