import { ConflictException, ForbiddenException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  AnnouncementStatus,
  ConversationParticipantRole,
  GroupKind,
} from '../generated/prisma/client';
import type { MessagingEventsService } from '../realtime/messaging-events.service';
import { ConversationStorageService } from './conversation-storage.service';
import { ConversationsService } from './conversations.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('ConversationsService group deletion governance', () => {
  const transaction = {
    announcement: {
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    conversation: {
      delete: jest.fn(),
    },
  };

  const prisma = {
    messageAttachment: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  } as unknown as PrismaService;

  const messagingEventsService = {
    emitConversationUpdated: jest.fn(),
  } as unknown as MessagingEventsService;

  const conversationStorageService = {
    lockStorageKeys: jest.fn(),
    findUnreferencedStorageKeys: jest.fn(),
    deletePhysicalStorageObjects: jest.fn(),
  } as unknown as ConversationStorageService;

  let service: ConversationsService;
  let viewerSpy: jest.SpyInstance;
  let accessSpy: jest.SpyInstance;

  const personalOwnerAccess = {
    conversation: {
      id: 'group-1',
      groupKind: GroupKind.PERSONAL,
      groupPhotoKey: 'group-1/photo.jpg',
      participants: [
        {
          accountId: 'owner-1',
          role: ConversationParticipantRole.OWNER,
        },
        {
          accountId: 'member-1',
          role: ConversationParticipantRole.MEMBER,
        },
      ],
    },
    viewerParticipant: {
      role: ConversationParticipantRole.OWNER,
    },
  };

  const officialOwnerAccess = {
    conversation: {
      id: 'official-1',
      groupKind: GroupKind.OFFICIAL,
      groupPhotoKey: null,
      participants: [
        {
          accountId: 'super-admin-1',
          role: ConversationParticipantRole.OWNER,
        },
        {
          accountId: 'member-1',
          role: ConversationParticipantRole.MEMBER,
        },
      ],
    },
    viewerParticipant: {
      role: ConversationParticipantRole.OWNER,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    service = new ConversationsService(
      prisma,
      messagingEventsService,
      conversationStorageService,
    );

    viewerSpy = jest
      .spyOn(
        service as unknown as { getMessagingViewer: () => Promise<unknown> },
        'getMessagingViewer',
      )
      .mockResolvedValue({
        accountId: 'owner-1',
        role: AccountRole.EMPLOYEE,
      });

    accessSpy = jest
      .spyOn(
        service as unknown as { getActiveGroupAccess: () => Promise<unknown> },
        'getActiveGroupAccess',
      )
      .mockResolvedValue(personalOwnerAccess);

    jest.mocked(prisma.messageAttachment.findMany).mockResolvedValue([
      { storageKey: 'message/file-a' },
      { storageKey: 'message/file-b' },
    ] as never);
    transaction.announcement.count.mockResolvedValue(0);
    jest.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      (callback as (tx: typeof transaction) => Promise<unknown>)(transaction),
    );
    jest
      .mocked(conversationStorageService.findUnreferencedStorageKeys)
      .mockResolvedValue(['message/file-a']);
    jest
      .spyOn(
        service as unknown as {
          deleteGroupPhotoIfExists: (storageKey: string | null) => Promise<void>;
        },
        'deleteGroupPhotoIfExists',
      )
      .mockResolvedValue(undefined);
  });

  it('allows only a personal group owner to delete the personal group', async () => {
    const response = await service.deleteGroupConversation(
      { accountId: 'owner-1', sessionId: 'session-1' } as never,
      'group-1',
    );

    expect(transaction.announcement.deleteMany).not.toHaveBeenCalled();
    expect(transaction.conversation.delete).toHaveBeenCalledWith({
      where: { id: 'group-1' },
    });
    expect(conversationStorageService.lockStorageKeys).toHaveBeenCalledWith(
      transaction,
      ['message/file-a', 'message/file-b'],
    );
    expect(
      conversationStorageService.findUnreferencedStorageKeys,
    ).toHaveBeenCalledWith(transaction, ['message/file-a', 'message/file-b']);
    expect(
      conversationStorageService.deletePhysicalStorageObjects,
    ).toHaveBeenCalledWith(['message/file-a']);
    expect(messagingEventsService.emitConversationUpdated).toHaveBeenCalledWith(
      ['owner-1', 'member-1'],
      expect.objectContaining({
        conversationId: 'group-1',
        reason: 'GROUP_DELETED',
      }),
    );
    expect(response).toEqual(
      expect.objectContaining({
        message: 'Group deleted successfully.',
        groupKind: GroupKind.PERSONAL,
      }),
    );
  });

  it('rejects a personal group administrator', async () => {
    accessSpy.mockResolvedValue({
      ...personalOwnerAccess,
      viewerParticipant: { role: ConversationParticipantRole.ADMIN },
    });

    await expect(
      service.deleteGroupConversation(
        { accountId: 'admin-1', sessionId: 'session-1' } as never,
        'group-1',
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.messageAttachment.findMany).not.toHaveBeenCalled();
  });

  it('allows the Super Admin OWNER to delete an official group without touching organization records', async () => {
    viewerSpy.mockResolvedValue({
      accountId: 'super-admin-1',
      role: AccountRole.SUPER_ADMIN,
    });
    accessSpy.mockResolvedValue(officialOwnerAccess);
    const response = await service.deleteGroupConversation(
      { accountId: 'super-admin-1', sessionId: 'session-1' } as never,
      'official-1',
    );

    expect(transaction.announcement.count).toHaveBeenCalledWith({
      where: {
        officialConversationId: 'official-1',
        status: AnnouncementStatus.PUBLISHING,
      },
    });
    expect(transaction.announcement.deleteMany).toHaveBeenCalledWith({
      where: { officialConversationId: 'official-1' },
    });
    expect(transaction.conversation.delete).toHaveBeenCalledWith({
      where: { id: 'official-1' },
    });
    expect(response).toEqual(
      expect.objectContaining({
        message: 'Official group deleted successfully.',
        groupKind: GroupKind.OFFICIAL,
      }),
    );
  });

  it('rejects an official-group OWNER who is not the Super Admin account', async () => {
    viewerSpy.mockResolvedValue({
      accountId: 'management-1',
      role: AccountRole.SENIOR_MANAGEMENT,
    });
    accessSpy.mockResolvedValue(officialOwnerAccess);

    await expect(
      service.deleteGroupConversation(
        { accountId: 'management-1', sessionId: 'session-1' } as never,
        'official-1',
      ),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.messageAttachment.findMany).not.toHaveBeenCalled();
  });

  it('rejects an official-group administrator even when the account is Super Admin', async () => {
    viewerSpy.mockResolvedValue({
      accountId: 'super-admin-1',
      role: AccountRole.SUPER_ADMIN,
    });
    accessSpy.mockResolvedValue({
      ...officialOwnerAccess,
      viewerParticipant: { role: ConversationParticipantRole.ADMIN },
    });

    await expect(
      service.deleteGroupConversation(
        { accountId: 'super-admin-1', sessionId: 'session-1' } as never,
        'official-1',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('blocks official group deletion while a linked announcement is publishing', async () => {
    viewerSpy.mockResolvedValue({
      accountId: 'super-admin-1',
      role: AccountRole.SUPER_ADMIN,
    });
    accessSpy.mockResolvedValue(officialOwnerAccess);
    transaction.announcement.count.mockResolvedValue(1);

    await expect(
      service.deleteGroupConversation(
        { accountId: 'super-admin-1', sessionId: 'session-1' } as never,
        'official-1',
      ),
    ).rejects.toThrow(ConflictException);

    expect(transaction.conversation.delete).not.toHaveBeenCalled();
    expect(transaction.announcement.deleteMany).not.toHaveBeenCalled();
  });
});
