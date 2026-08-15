import { ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  ConversationParticipantRole,
  ConversationType,
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
    service = new ConversationsService(
      prisma,
      {} as never,
      {} as never,
    );
  });

  it('assigns Super Admin as ADMIN when explicitly added to a personal group', () => {
    const role = (
      service as unknown as {
        getPersonalGroupMemberRole: (
          accountRole: AccountRole,
        ) => ConversationParticipantRole;
      }
    ).getPersonalGroupMemberRole(AccountRole.SUPER_ADMIN);

    expect(role).toBe(ConversationParticipantRole.ADMIN);
  });

  it('keeps normal selected personal-group members as MEMBER', () => {
    const role = (
      service as unknown as {
        getPersonalGroupMemberRole: (
          accountRole: AccountRole,
        ) => ConversationParticipantRole;
      }
    ).getPersonalGroupMemberRole(AccountRole.EMPLOYEE);

    expect(role).toBe(ConversationParticipantRole.MEMBER);
  });

  it('prevents the personal-group owner from demoting an active Super Admin participant', async () => {
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
              accountId: 'super-admin-1',
              role: ConversationParticipantRole.ADMIN,
            },
          ],
        },
        viewerParticipant: {
          role: ConversationParticipantRole.OWNER,
        },
      });
    jest.mocked(prisma.account.findUnique).mockResolvedValue({
      role: AccountRole.SUPER_ADMIN,
    } as never);

    await expect(
      service.updateGroupMemberRole(
        { accountId: 'owner-1', sessionId: 'session-1' } as never,
        'group-1',
        'super-admin-1',
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
