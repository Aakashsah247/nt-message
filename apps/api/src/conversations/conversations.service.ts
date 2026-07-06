import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  ConversationParticipantRole,
  ConversationType,
  EmployeeStatus,
  EmploymentStatus,
  GroupKind,
  MessageContentType,
  MessageRequestReason,
  MessagingNotificationType,
  MessageRequestStatus,
  OfficialGroupAuditAction,
  OfficialGroupScopeType,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { MessagingEventsService } from '../realtime/messaging-events.service';

import { AddGroupMembersDto } from './dto/add-group-members.dto';
import { CreateGroupConversationDto } from './dto/create-group-conversation.dto';
import { CreateOfficialGroupConversationDto } from './dto/create-official-group-conversation.dto';
import { CreatePrivateConversationDto } from './dto/create-private-conversation.dto';
import { ForwardTextMessageDto } from './dto/forward-text-message.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { ListOfficialGroupAuditQueryDto } from './dto/list-official-group-audit-query.dto';
import { SearchMessagingContactsQueryDto } from './dto/search-messaging-contacts-query.dto';
import { SearchMessagesQueryDto } from './dto/search-messages-query.dto';
import { SendTextMessageDto } from './dto/send-text-message.dto';
import { SendLocationMessageDto } from './dto/send-location-message.dto';
import { SendAttachmentMessageDto } from './dto/send-attachment-message.dto';
import { UpdateGroupConversationDto } from './dto/update-group-conversation.dto';
import { UpdateGroupMemberRoleDto } from './dto/update-group-member-role.dto';
import { UpdateConversationPreferenceDto } from './dto/update-conversation-preference.dto';
import type { ConversationMuteSetting } from './dto/update-conversation-preference.dto';
import { UpdateTextMessageDto } from './dto/update-text-message.dto';
import { UpdateLiveLocationDto } from './dto/update-live-location.dto';
import { UpdateMessagingProfileDto } from './dto/update-messaging-profile.dto';
import { UpdateMessagingSettingsDto } from './dto/update-messaging-settings.dto';
import { ReactMessageDto } from './dto/react-message.dto';
import type { UploadedMessageAttachmentFile } from './types/uploaded-message-attachment-file';

interface MessagingViewer {
  accountId: string;
  role: AccountRole;
  divisionId: string | null;
  departmentId: string | null;
  showOnlineStatus: boolean;
  showReadReceipts: boolean;
}

interface OfficialGroupScopeRecord {
  id: string;
  createdByAccountId: string;
  officialScopeType: OfficialGroupScopeType;
  officialDivisionId: string | null;
  officialDepartmentId: string | null;
}

interface OfficialGroupParticipantSyncRecord {
  accountId: string;
  joinedAt: Date;
  leftAt: Date | null;
  role: ConversationParticipantRole;
}

interface OfficialGroupSyncResult {
  conversationId: string;
  addedCount: number;
  removedCount: number;
  roleChangedCount: number;
}

type DeliveryStatus = 'SENT' | 'DELIVERED' | 'READ';
type MessageReactionMutationAction = 'ADDED' | 'UPDATED' | 'REMOVED';
type MessagingBlockDirection = 'BLOCKED_BY_ME' | 'BLOCKED_ME' | 'MUTUAL' | null;

interface MessageSearchFilters {
  searchText: string | null;
  senderAccountId?: string;
  contentType?: MessageContentType;
  dateFrom?: Date;
  dateTo?: Date;
  limit: number;
}

interface NotificationParticipant {
  accountId: string;
  isMuted?: boolean;
  mutedUntil?: Date | null;
}

interface MessageNotificationInput {
  message: MessageRecord;
  participants: NotificationParticipant[];
  notificationType?: MessagingNotificationType;
  mentionedAccountIds?: string[];
}

interface MessageMentionPayloadItem {
  accountId: string;
  displayName: string;
}

interface MessageLocationPayload {
  kind: 'CURRENT' | 'LIVE';
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  headingDegrees: number | null;
  speedMetersPerSecond: number | null;
  label: string | null;
  mapUrl: string;
  liveExpiresAt: string | null;
  liveStoppedAt: string | null;
  updatedAt: string;
}

export interface AnalyticsScopeSummary {
  role: AccountRole;
  label: string;
  division: {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
  } | null;
  department: {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
  } | null;
}

export interface AnalyticsCountItem {
  key: string;
  label: string;
  count: number;
}

export interface AnalyticsAttachmentItem extends AnalyticsCountItem {
  totalBytes: number;
}

export interface ForwardedMessageMetadata {
  sourceMessageId: string;
  sourceConversationId: string;
  originalSenderAccountId: string;
  originalSenderDisplayName: string;
  originalSentAt: string;
  originalTextContent: string;
}

export interface MessagingProfileSharedGroup {
  id: string;
  title: string | null;
  groupKind: GroupKind | null;
  memberCount: number;
}

const MESSAGE_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_IMAGE_ATTACHMENT_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MAX_AUDIO_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_VIDEO_ATTACHMENT_BYTES = 200 * 1024 * 1024;
const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;
const MESSAGE_ATTACHMENT_STORAGE_DIR = path.resolve(
  process.env.MESSAGE_ATTACHMENT_STORAGE_DIR ??
    path.join(process.cwd(), 'storage', 'message-attachments'),
);
const PROFILE_PHOTO_STORAGE_DIR = path.resolve(
  process.env.PROFILE_PHOTO_STORAGE_DIR ??
    path.join(process.cwd(), 'storage', 'profile-photos'),
);
const GROUP_PHOTO_STORAGE_DIR = path.resolve(
  process.env.GROUP_PHOTO_STORAGE_DIR ??
    path.join(process.cwd(), 'storage', 'group-photos'),
);

const IMAGE_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const PROFILE_PHOTO_MIME_TYPES = IMAGE_ATTACHMENT_MIME_TYPES;

const VIDEO_ATTACHMENT_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
]);

const AUDIO_ATTACHMENT_MIME_TYPES = new Set([
  'audio/aac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
  'audio/x-m4a',
]);

const DOCUMENT_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
]);


const messagingAccountSelect = {
  id: true,
  username: true,
  role: true,
  isEnabled: true,
  profilePhotoKey: true,
  profileBio: true,
  showOnlineStatus: true,
  showReadReceipts: true,

  employee: {
    select: {
      id: true,
      empId: true,
      empName: true,
      officialEmail: true,
      designation: true,
      profilePhotoKey: true,
      profileBio: true,
      status: true,
      employmentStatus: true,
      archivedAt: true,
      isActivated: true,
      divisionId: true,
      departmentId: true,

      division: {
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
        },
      },

      departmentUnit: {
        select: {
          id: true,
          divisionId: true,
          code: true,
          name: true,
          isActive: true,
        },
      },
    },
  },
} satisfies Prisma.AccountSelect;

type MessagingAccountRecord = Prisma.AccountGetPayload<{
  select: typeof messagingAccountSelect;
}>;

const messageSelect = {
  id: true,
  conversationId: true,
  senderAccountId: true,
  clientMessageId: true,
  contentType: true,
  textContent: true,
  payload: true,
  replyToMessageId: true,
  sentAt: true,
  editedAt: true,
  deletedAt: true,
  deletedByAccountId: true,
  createdAt: true,
  updatedAt: true,

  sender: {
    select: messagingAccountSelect,
  },

  replyTo: {
    select: {
      id: true,
      senderAccountId: true,
      contentType: true,
      textContent: true,
      deletedAt: true,
      sentAt: true,

      sender: {
        select: messagingAccountSelect,
      },
    },
  },

  receipts: {
    select: {
      accountId: true,
      deliveredAt: true,
      readAt: true,
      account: {
        select: {
          showReadReceipts: true,
        },
      },
    },

    orderBy: {
      accountId: 'asc',
    },
  },

  reactions: {
    select: {
      accountId: true,
      reactionValue: true,
      createdAt: true,
      updatedAt: true,

      account: {
        select: messagingAccountSelect,
      },
    },

    orderBy: [
      {
        reactionValue: 'asc',
      },
      {
        createdAt: 'asc',
      },
    ],
  },

  stars: {
    select: {
      accountId: true,
      starredAt: true,
    },
  },

  pins: {
    where: {
      unpinnedAt: null,
    },

    take: 1,

    orderBy: {
      pinnedAt: 'desc',
    },

    select: {
      pinnedByAccountId: true,
      pinnedAt: true,

      pinnedBy: {
        select: messagingAccountSelect,
      },
    },
  },

  attachments: {
    select: {
      id: true,
      messageId: true,
      storageKey: true,
      originalFileName: true,
      mimeType: true,
      fileSizeBytes: true,
      contentType: true,
      scanStatus: true,
      createdAt: true,
      updatedAt: true,
    },

    orderBy: {
      createdAt: 'asc',
    },
  },
} satisfies Prisma.MessageSelect;

type MessageRecord = Prisma.MessageGetPayload<{
  select: typeof messageSelect;
}>;

const messageInformationSelect = {
  ...messageSelect,

  receipts: {
    select: {
      accountId: true,
      deliveredAt: true,
      readAt: true,
      createdAt: true,
      updatedAt: true,

      account: {
        select: messagingAccountSelect,
      },
    },

    orderBy: {
      accountId: 'asc',
    },
  },
} satisfies Prisma.MessageSelect;

type MessageInformationRecord = Prisma.MessageGetPayload<{
  select: typeof messageInformationSelect;
}>;

const conversationSelect = {
  id: true,
  type: true,
  title: true,
  description: true,
  groupPhotoKey: true,
  groupKind: true,
  officialScopeType: true,
  officialDivisionId: true,
  officialDepartmentId: true,
  privateParticipantKey: true,
  createdByAccountId: true,
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,

  officialDivision: {
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
    },
  },

  officialDepartment: {
    select: {
      id: true,
      divisionId: true,
      code: true,
      name: true,
      isActive: true,
    },
  },

  participants: {
    orderBy: {
      joinedAt: 'asc',
    },

    select: {
      accountId: true,
      joinedAt: true,
      leftAt: true,
      role: true,
      isMuted: true,
      isArchived: true,
      isPinned: true,
      pinnedAt: true,
      mutedUntil: true,
      archivedAt: true,
      markedUnreadAt: true,
      draftText: true,
      draftUpdatedAt: true,

      account: {
        select: messagingAccountSelect,
      },
    },
  },

  messages: {
    take: 1,

    orderBy: [
      {
        sentAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],

    select: messageSelect,
  },
} satisfies Prisma.ConversationSelect;

type ConversationRecord = Prisma.ConversationGetPayload<{
  select: typeof conversationSelect;
}>;

const messageRequestSelect = {
  id: true,
  participantKey: true,
  requesterAccountId: true,
  recipientAccountId: true,
  blockedByAccountId: true,
  conversationId: true,
  status: true,
  reason: true,
  requestCount: true,
  requestedAt: true,
  respondedAt: true,
  createdAt: true,
  updatedAt: true,

  requester: {
    select: messagingAccountSelect,
  },

  recipient: {
    select: messagingAccountSelect,
  },
} satisfies Prisma.MessageRequestSelect;

type MessageRequestRecord = Prisma.MessageRequestGetPayload<{
  select: typeof messageRequestSelect;
}>;

const messagingAccountBlockSelect = {
  blockerAccountId: true,
  blockedAccountId: true,
  reason: true,
  createdAt: true,
  updatedAt: true,

  blocked: {
    select: messagingAccountSelect,
  },
} satisfies Prisma.MessagingAccountBlockSelect;

type MessagingAccountBlockRecord = Prisma.MessagingAccountBlockGetPayload<{
  select: typeof messagingAccountBlockSelect;
}>;

const officialGroupAuditSelect = {
  id: true,
  conversationId: true,
  actorAccountId: true,
  action: true,
  metadata: true,
  createdAt: true,

  actor: {
    select: messagingAccountSelect,
  },
} satisfies Prisma.OfficialGroupAuditLogSelect;

const messagingNotificationSelect = {
  id: true,
  recipientAccountId: true,
  actorAccountId: true,
  conversationId: true,
  messageId: true,
  type: true,
  title: true,
  body: true,
  isRead: true,
  readAt: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,

  actor: {
    select: messagingAccountSelect,
  },
} satisfies Prisma.MessagingNotificationSelect;

type MessagingNotificationRecord = Prisma.MessagingNotificationGetPayload<{
  select: typeof messagingNotificationSelect;
}>;

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingEventsService: MessagingEventsService,
  ) {}

  private getRoleRank(role: AccountRole): number {
    switch (role) {
      case AccountRole.SUPER_ADMIN:
        return 4;
      case AccountRole.SENIOR_MANAGEMENT:
        return 3;
      case AccountRole.TEAM_MANAGER:
        return 2;
      case AccountRole.EMPLOYEE:
      default:
        return 1;
    }
  }

  private getBlockDirection(
    viewerAccountId: string,
    targetAccountId: string,
    blocks: Array<{ blockerAccountId: string; blockedAccountId: string }>,
  ): MessagingBlockDirection {
    const blockedByMe = blocks.some(
      (block) =>
        block.blockerAccountId === viewerAccountId &&
        block.blockedAccountId === targetAccountId,
    );
    const blockedMe = blocks.some(
      (block) =>
        block.blockerAccountId === targetAccountId &&
        block.blockedAccountId === viewerAccountId,
    );

    if (blockedByMe && blockedMe) {
      return 'MUTUAL';
    }

    if (blockedByMe) {
      return 'BLOCKED_BY_ME';
    }

    return blockedMe ? 'BLOCKED_ME' : null;
  }

  private serializeMessagingAccountBlock(block: MessagingAccountBlockRecord) {
    return {
      blockerAccountId: block.blockerAccountId,
      blockedAccountId: block.blockedAccountId,
      reason: block.reason,
      account: this.serializeAccount(block.blocked),
      createdAt: block.createdAt,
      updatedAt: block.updatedAt,
    };
  }

  private assertCanBlockAccount(
    viewer: MessagingViewer,
    target: MessagingAccountRecord,
  ): void {
    if (viewer.accountId === target.id) {
      throw new BadRequestException('You cannot block your own account.');
    }

    if (target.role === AccountRole.SUPER_ADMIN && viewer.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Super Admin cannot be blocked. You can mute private alerts or report the concern.',
      );
    }

    if (this.getRoleRank(target.role) > this.getRoleRank(viewer.role)) {
      throw new ForbiddenException(
        'You cannot block a higher authority account. Use mute/report for personal discomfort; official communication remains available.',
      );
    }
  }

  private async findPersonalBlockRelation(
    firstAccountId: string,
    secondAccountId: string,
  ): Promise<Array<{ blockerAccountId: string; blockedAccountId: string }>> {
    return this.prisma.messagingAccountBlock.findMany({
      where: {
        OR: [
          {
            blockerAccountId: firstAccountId,
            blockedAccountId: secondAccountId,
          },
          {
            blockerAccountId: secondAccountId,
            blockedAccountId: firstAccountId,
          },
        ],
      },
      select: {
        blockerAccountId: true,
        blockedAccountId: true,
      },
    });
  }

  private async assertNoPersonalBlock(
    actorAccountId: string,
    targetAccountId: string,
    actionDescription: string,
  ): Promise<void> {
    const blocks = await this.findPersonalBlockRelation(
      actorAccountId,
      targetAccountId,
    );

    if (blocks.length === 0) {
      return;
    }

    const direction = this.getBlockDirection(
      actorAccountId,
      targetAccountId,
      blocks,
    );

    if (direction === 'BLOCKED_BY_ME' || direction === 'MUTUAL') {
      throw new ForbiddenException(
        `You blocked this account. Unblock them before ${actionDescription}.`,
      );
    }

    throw new ForbiddenException(
      `This account blocked private contact with you, so you cannot ${actionDescription}.`,
    );
  }

  private async assertNoPersonalGroupBlocks(
    participantAccountIds: string[],
  ): Promise<void> {
    const uniqueAccountIds = [...new Set(participantAccountIds)];

    if (uniqueAccountIds.length < 2) {
      return;
    }

    const block = await this.prisma.messagingAccountBlock.findFirst({
      where: {
        blockerAccountId: {
          in: uniqueAccountIds,
        },
        blockedAccountId: {
          in: uniqueAccountIds,
        },
      },
      select: {
        blockerAccountId: true,
        blockedAccountId: true,
      },
    });

    if (block) {
      throw new ForbiddenException(
        'A personal group cannot include accounts that have blocked each other.',
      );
    }
  }

  private serializeMessagingSettings(account: {
    id: string;
    showOnlineStatus: boolean;
    showReadReceipts: boolean;
    updatedAt?: Date;
  }) {
    return {
      accountId: account.id,
      showOnlineStatus: account.showOnlineStatus,
      showReadReceipts: account.showReadReceipts,
      updatedAt: account.updatedAt ?? null,
    };
  }

  async getMessagingSettings(user: AuthenticatedUser) {
    const viewer = await this.getMessagingViewer(user);

    return {
      data: {
        accountId: viewer.accountId,
        showOnlineStatus: viewer.showOnlineStatus,
        showReadReceipts: viewer.showReadReceipts,
        updatedAt: null,
      },
    };
  }

  async updateMessagingSettings(
    user: AuthenticatedUser,
    dto: UpdateMessagingSettingsDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const data: Prisma.AccountUpdateInput = {};

    if (typeof dto.showOnlineStatus === 'boolean') {
      data.showOnlineStatus = dto.showOnlineStatus;
    }

    if (typeof dto.showReadReceipts === 'boolean') {
      data.showReadReceipts = dto.showReadReceipts;
    }

    if (Object.keys(data).length === 0) {
      return {
        data: {
          accountId: viewer.accountId,
          showOnlineStatus: viewer.showOnlineStatus,
          showReadReceipts: viewer.showReadReceipts,
          updatedAt: null,
        },
      };
    }

    const updated = await this.prisma.account.update({
      where: {
        id: viewer.accountId,
      },
      data,
      select: {
        id: true,
        showOnlineStatus: true,
        showReadReceipts: true,
        updatedAt: true,
      },
    });

    if (typeof dto.showOnlineStatus === 'boolean') {
      const occurredAt = new Date().toISOString();

      // Tell connected clients to hide/reveal this account's active presence promptly.
      this.messagingEventsService.emitPresenceUpdated({
        accountId: viewer.accountId,
        isOnline: updated.showOnlineStatus,
        lastSeenAt: updated.showOnlineStatus ? null : occurredAt,
        occurredAt,
      });
    }

    return {
      data: this.serializeMessagingSettings(updated),
    };
  }

  async listBlockedMessagingAccounts(user: AuthenticatedUser) {
    const viewer = await this.getMessagingViewer(user);

    const blocks = await this.prisma.messagingAccountBlock.findMany({
      where: {
        blockerAccountId: viewer.accountId,
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          blockedAccountId: 'asc',
        },
      ],
      select: messagingAccountBlockSelect,
    });

    return {
      data: blocks.map((block) => this.serializeMessagingAccountBlock(block)),
      counts: {
        blockedByMe: blocks.length,
      },
    };
  }

  async blockMessagingAccount(
    user: AuthenticatedUser,
    blockedAccountId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);

    const target = await this.prisma.account.findUnique({
      where: {
        id: blockedAccountId,
      },
      select: messagingAccountSelect,
    });

    if (!target || !target.isEnabled || !this.isVisibleMessagingProfile(target)) {
      throw new NotFoundException('The selected messaging account was not found.');
    }

    this.assertCanBlockAccount(viewer, target);

    const block = await this.prisma.messagingAccountBlock.upsert({
      where: {
        blockerAccountId_blockedAccountId: {
          blockerAccountId: viewer.accountId,
          blockedAccountId: target.id,
        },
      },
      create: {
        blockerAccountId: viewer.accountId,
        blockedAccountId: target.id,
      },
      update: {},
      select: messagingAccountBlockSelect,
    });

    const participantKey = this.buildPrivateParticipantKey(
      viewer.accountId,
      target.id,
    );
    const now = new Date();

    await this.prisma.messageRequest.updateMany({
      where: {
        participantKey,
        status: {
          in: [MessageRequestStatus.PENDING, MessageRequestStatus.DECLINED],
        },
      },
      data: {
        status: MessageRequestStatus.BLOCKED,
        blockedByAccountId: viewer.accountId,
        respondedAt: now,
      },
    });

    await this.prisma.conversationParticipant.updateMany({
      where: {
        accountId: viewer.accountId,
        conversation: {
          privateParticipantKey: participantKey,
        },
      },
      data: {
        isArchived: true,
        isMuted: true,
      },
    });

    this.messagingEventsService.emitMessageRequestUpdated(
      [viewer.accountId, target.id],
      {
        requestId: participantKey,
        status: 'BLOCKED',
        conversationId: null,
        occurredAt: now.toISOString(),
      },
    );

    return {
      message: 'Account blocked for private messaging.',
      data: this.serializeMessagingAccountBlock(block),
    };
  }

  async unblockMessagingAccount(
    user: AuthenticatedUser,
    blockedAccountId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);

    const deleted = await this.prisma.messagingAccountBlock.deleteMany({
      where: {
        blockerAccountId: viewer.accountId,
        blockedAccountId,
      },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('Blocked account was not found.');
    }

    const participantKey = this.buildPrivateParticipantKey(
      viewer.accountId,
      blockedAccountId,
    );

    await this.prisma.messageRequest.updateMany({
      where: {
        participantKey,
        blockedByAccountId: viewer.accountId,
        status: MessageRequestStatus.BLOCKED,
      },
      data: {
        status: MessageRequestStatus.DECLINED,
        blockedByAccountId: null,
      },
    });

    this.messagingEventsService.emitMessageRequestUpdated(
      [viewer.accountId, blockedAccountId],
      {
        requestId: participantKey,
        status: 'DECLINED',
        conversationId: null,
        occurredAt: new Date().toISOString(),
      },
    );

    return {
      message: 'Account unblocked for private messaging.',
      blockedAccountId,
    };
  }

  async canShareOnlineStatus(accountId: string): Promise<boolean> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { showOnlineStatus: true },
    });

    return account?.showOnlineStatus ?? false;
  }

  async filterAccountIdsSharingOnlineStatus(
    accountIds: string[],
  ): Promise<Set<string>> {
    if (accountIds.length === 0) {
      return new Set();
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        id: {
          in: [...new Set(accountIds)],
        },
        showOnlineStatus: true,
      },
      select: {
        id: true,
      },
    });

    return new Set(accounts.map((account) => account.id));
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private buildPrivateParticipantKey(
    firstAccountId: string,
    secondAccountId: string,
  ): string {
    return [firstAccountId, secondAccountId].sort().join(':');
  }

  private isActiveEmployeeAccount(account: MessagingAccountRecord): boolean {
    const employee = account.employee;

    if (!employee) {
      return account.role === AccountRole.SUPER_ADMIN;
    }

    if (
      employee.status !== EmployeeStatus.ACTIVE ||
      employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      employee.archivedAt !== null ||
      !employee.isActivated ||
      !employee.division ||
      !employee.division.isActive
    ) {
      return false;
    }

    if (
      employee.departmentId &&
      (!employee.departmentUnit || !employee.departmentUnit.isActive)
    ) {
      return false;
    }

    return true;
  }

  private async getMessagingViewer(
    user: AuthenticatedUser,
  ): Promise<MessagingViewer> {
    const account = await this.prisma.account.findUnique({
      where: {
        id: user.accountId,
      },

      select: messagingAccountSelect,
    });

    if (
      !account ||
      !account.isEnabled ||
      account.role !== user.role ||
      !this.isActiveEmployeeAccount(account)
    ) {
      throw new ForbiddenException(
        'Your account cannot access private messaging.',
      );
    }

    if (account.role === AccountRole.SUPER_ADMIN) {
      return {
        accountId: account.id,
        role: account.role,
        divisionId: null,
        departmentId: null,
        showOnlineStatus: account.showOnlineStatus,
        showReadReceipts: account.showReadReceipts,
      };
    }

    const employee = account.employee;

    if (!employee) {
      throw new ForbiddenException(
        'Your account does not have an active employee identity.',
      );
    }

    if (
      account.role === AccountRole.SENIOR_MANAGEMENT &&
      !employee.divisionId
    ) {
      throw new ForbiddenException(
        'Your account does not have an active division assignment.',
      );
    }

    if (
      account.role === AccountRole.TEAM_MANAGER &&
      (!employee.divisionId || !employee.departmentId)
    ) {
      throw new ForbiddenException(
        'Your account does not have an active department assignment.',
      );
    }

    return {
      accountId: account.id,
      role: account.role,
      divisionId: employee.divisionId,
      departmentId: employee.departmentId,
      showOnlineStatus: account.showOnlineStatus,
      showReadReceipts: account.showReadReceipts,
    };
  }

  private getAccountProfilePhotoKey(account: MessagingAccountRecord): string | null {
    return account.profilePhotoKey ?? account.employee?.profilePhotoKey ?? null;
  }

  private getAccountProfileBio(account: MessagingAccountRecord): string | null {
    return account.profileBio ?? account.employee?.profileBio ?? null;
  }

  private serializeAccount(account: MessagingAccountRecord) {
    const employee = account.employee;
    const profilePhotoKey = this.getAccountProfilePhotoKey(account);
    const profileBio = this.getAccountProfileBio(account);

    return {
      accountId: account.id,
      username: account.username,
      role: account.role,
      profilePhotoKey,
      profileBio,
      showOnlineStatus: account.showOnlineStatus,
      showReadReceipts: account.showReadReceipts,
      displayName:
        employee?.empName ??
        account.username ??
        (account.role === AccountRole.SUPER_ADMIN
          ? 'Super Admin'
          : 'NT Message User'),

      employee: employee
        ? {
            id: employee.id,
            empId: employee.empId,
            empName: employee.empName,
            designation: employee.designation,
            profilePhotoKey,
            profileBio,
            division: employee.division,
            department: employee.departmentUnit,
          }
        : null,
    };
  }

  private serializeUserProfile(
    account: MessagingAccountRecord,
    viewerAccountId: string,
    sharedGroups: MessagingProfileSharedGroup[],
    contactMode: 'SELF' | 'DIRECT' | 'REQUEST_REQUIRED' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'BLOCKED',
    blockDirection: MessagingBlockDirection = null,
  ) {
    const employee = account.employee;

    return {
      ...this.serializeAccount(account),
      isOwnProfile: account.id === viewerAccountId,
      contactMode,
      blockDirection,
      profileBio: this.getAccountProfileBio(account),
      official: employee
        ? {
            // Official identity stays read-only and comes from activation/admin workflows.
            employeeId: employee.empId,
            officialEmail: employee.officialEmail,
            designation: employee.designation,
            division: employee.division,
            department: employee.departmentUnit,
          }
        : null,
      sharedGroups,
    };
  }

  private resolveProfilePhotoPath(storageKey: string): string {
    const absolutePath = path.resolve(PROFILE_PHOTO_STORAGE_DIR, storageKey);

    if (!absolutePath.startsWith(`${PROFILE_PHOTO_STORAGE_DIR}${path.sep}`)) {
      throw new BadRequestException('Profile photo storage key is invalid.');
    }

    return absolutePath;
  }

  private validateProfilePhoto(file?: UploadedMessageAttachmentFile): {
    originalFileName: string;
  } {
    if (!file) {
      throw new BadRequestException('Profile photo file is required.');
    }

    if (!file.buffer || file.size <= 0) {
      throw new BadRequestException('Profile photo file is empty.');
    }

    if (!PROFILE_PHOTO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Profile photo must be JPG, PNG or WEBP.');
    }

    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      throw new BadRequestException('Profile photo must be 5 MB or smaller.');
    }

    return {
      originalFileName: this.normalizeAttachmentFileName(file.originalname),
    };
  }

  private async writeProfilePhotoFile(
    storageKey: string,
    file: UploadedMessageAttachmentFile,
  ): Promise<void> {
    const absolutePath = this.resolveProfilePhotoPath(storageKey);

    await fs.mkdir(path.dirname(absolutePath), {
      recursive: true,
    });

    await fs.writeFile(absolutePath, file.buffer);
  }

  private async deleteProfilePhotoIfExists(storageKey: string | null): Promise<void> {
    if (!storageKey) {
      return;
    }

    try {
      await fs.unlink(this.resolveProfilePhotoPath(storageKey));
    } catch {
      // Profile-photo cleanup is best-effort because the database is the source of truth.
    }
  }


  private resolveGroupPhotoPath(storageKey: string): string {
    const absolutePath = path.resolve(GROUP_PHOTO_STORAGE_DIR, storageKey);

    if (!absolutePath.startsWith(`${GROUP_PHOTO_STORAGE_DIR}${path.sep}`)) {
      throw new BadRequestException('Group photo storage key is invalid.');
    }

    return absolutePath;
  }

  private validateGroupPhoto(file?: UploadedMessageAttachmentFile): {
    originalFileName: string;
  } {
    if (!file) {
      throw new BadRequestException('Group photo file is required.');
    }

    if (!file.buffer || file.size <= 0) {
      throw new BadRequestException('Group photo file is empty.');
    }

    if (!PROFILE_PHOTO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Group photo must be JPG, PNG or WEBP.');
    }

    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      throw new BadRequestException('Group photo must be 5 MB or smaller.');
    }

    return {
      originalFileName: this.normalizeAttachmentFileName(file.originalname),
    };
  }

  private async writeGroupPhotoFile(
    storageKey: string,
    file: UploadedMessageAttachmentFile,
  ): Promise<void> {
    const absolutePath = this.resolveGroupPhotoPath(storageKey);

    await fs.mkdir(path.dirname(absolutePath), {
      recursive: true,
    });

    await fs.writeFile(absolutePath, file.buffer);
  }

  private async deleteGroupPhotoIfExists(storageKey: string | null): Promise<void> {
    if (!storageKey) {
      return;
    }

    try {
      await fs.unlink(this.resolveGroupPhotoPath(storageKey));
    } catch {
      // Group-photo cleanup is best-effort because the database is the source of truth.
    }
  }

  private getPhotoMimeType(storageKey: string): string {
    const lowerStorageKey = storageKey.toLowerCase();

    return lowerStorageKey.endsWith('.png')
      ? 'image/png'
      : lowerStorageKey.endsWith('.webp')
        ? 'image/webp'
        : 'image/jpeg';
  }

  private async getProfileContactMode(
    viewer: MessagingViewer,
    target: MessagingAccountRecord,
  ): Promise<'SELF' | 'DIRECT' | 'REQUEST_REQUIRED' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'BLOCKED'> {
    if (viewer.accountId === target.id) {
      return 'SELF';
    }

    const participantKey = this.buildPrivateParticipantKey(
      viewer.accountId,
      target.id,
    );

    const [conversation, request, blocks] = await Promise.all([
      this.prisma.conversation.findUnique({
        where: {
          privateParticipantKey: participantKey,
        },
        select: {
          id: true,
        },
      }),
      this.prisma.messageRequest.findUnique({
        where: {
          participantKey,
        },
        select: {
          requesterAccountId: true,
          status: true,
        },
      }),
      this.findPersonalBlockRelation(viewer.accountId, target.id),
    ]);

    if (blocks.length > 0 || request?.status === MessageRequestStatus.BLOCKED) {
      return 'BLOCKED';
    }

    if (conversation) {
      return 'DIRECT';
    }

    if (request?.status === MessageRequestStatus.PENDING) {
      return request.requesterAccountId === viewer.accountId
        ? 'REQUEST_SENT'
        : 'REQUEST_RECEIVED';
    }

    return this.getMessageRequestReason(viewer, target)
      ? 'REQUEST_REQUIRED'
      : 'DIRECT';
  }

  private isVisibleMessagingProfile(account: MessagingAccountRecord): boolean {
    if (!account.isEnabled) {
      return false;
    }

    // Super Admin system accounts may not be employee-linked, but they still need display profiles.
    if (account.role === AccountRole.SUPER_ADMIN && !account.employee) {
      return true;
    }

    return this.isActiveEmployeeAccount(account);
  }

  private async listSharedGroupsForProfile(
    viewerAccountId: string,
    targetAccountId: string,
  ): Promise<MessagingProfileSharedGroup[]> {
    if (viewerAccountId === targetAccountId) {
      return [];
    }

    const sharedGroups = await this.prisma.conversation.findMany({
      where: {
        type: ConversationType.GROUP,
        AND: [
          {
            participants: {
              some: {
                accountId: viewerAccountId,
                leftAt: null,
              },
            },
          },
          {
            participants: {
              some: {
                accountId: targetAccountId,
                leftAt: null,
              },
            },
          },
        ],
      },
      take: 5,
      orderBy: {
        updatedAt: 'desc',
      },
      select: {
        id: true,
        title: true,
        groupKind: true,
        participants: {
          where: {
            leftAt: null,
          },
          select: {
            accountId: true,
          },
        },
      },
    });

    return sharedGroups.map((group) => ({
      id: group.id,
      title: group.title,
      groupKind: group.groupKind,
      memberCount: group.participants.length,
    }));
  }

  private getPlainMessagePayload(
    payload: unknown,
  ): Record<string, unknown> {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {};
    }

    return { ...(payload as Record<string, unknown>) };
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private getPayloadMentions(payload: unknown): MessageMentionPayloadItem[] {
    const mentions = this.getPlainMessagePayload(payload)['mentions'];

    if (!Array.isArray(mentions)) {
      return [];
    }

    return mentions
      .map((mention) => {
        if (!mention || typeof mention !== 'object' || Array.isArray(mention)) {
          return null;
        }

        const value = mention as Record<string, unknown>;
        const accountId = value.accountId;
        const displayName = value.displayName;

        if (typeof accountId !== 'string' || typeof displayName !== 'string') {
          return null;
        }

        return {
          accountId,
          displayName,
        };
      })
      .filter((mention): mention is MessageMentionPayloadItem => Boolean(mention));
  }

  private resolveTextMentions(
    textContent: string,
    requestedAccountIds: string[] | undefined,
    participants: Array<{
      accountId: string;
      account: Prisma.AccountGetPayload<{ select: typeof messagingAccountSelect }>;
    }>,
    senderAccountId: string,
  ): MessageMentionPayloadItem[] {
    const uniqueRequestedIds = new Set(requestedAccountIds ?? []);
    const resolved = new Map<string, MessageMentionPayloadItem>();

    for (const participant of participants) {
      if (participant.accountId === senderAccountId) {
        continue;
      }

      const account = this.serializeAccount(participant.account);
      const aliases = [
        account.displayName,
        account.username ?? '',
        account.employee?.empName ?? '',
      ]
        .map((value) => value.trim())
        .filter(Boolean);

      const wasRequested = uniqueRequestedIds.has(participant.accountId);
      const appearsInText = aliases.some((alias) => {
        const pattern = new RegExp(`(^|\\s)@${this.escapeRegExp(alias)}(?=\\s|$|[.,!?;:])`, 'i');

        return pattern.test(textContent);
      });

      if (wasRequested || appearsInText) {
        resolved.set(participant.accountId, {
          accountId: participant.accountId,
          displayName: account.displayName,
        });
      }
    }

    return [...resolved.values()];
  }

  private buildTextMessagePayload(
    mentions: MessageMentionPayloadItem[],
  ): Prisma.InputJsonValue | undefined {
    if (mentions.length === 0) {
      return undefined;
    }

    const mentionPayload: Prisma.InputJsonArray = mentions.map(
      (mention) =>
        ({
          accountId: mention.accountId,
          displayName: mention.displayName,
        }) as Prisma.InputJsonObject,
    );

    return {
      mentions: mentionPayload,
    } as Prisma.InputJsonObject;
  }


  private roundCoordinate(value: number): number {
    return Number(value.toFixed(8));
  }

  private normalizeOptionalNumber(value: number | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private buildMapUrl(latitude: number, longitude: number): string {
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }

  private buildLocationPayload(
    dto: SendLocationMessageDto | UpdateLiveLocationDto,
    kind: 'CURRENT' | 'LIVE',
    liveExpiresAt: Date | null,
    stoppedAt: Date | null = null,
  ): Prisma.InputJsonObject {
    const latitude = this.roundCoordinate(dto.latitude);
    const longitude = this.roundCoordinate(dto.longitude);
    const now = new Date().toISOString();
    const label = 'label' in dto && typeof dto.label === 'string'
      ? dto.label.trim().slice(0, 120) || null
      : null;
    const location: MessageLocationPayload = {
      kind,
      latitude,
      longitude,
      accuracyMeters: this.normalizeOptionalNumber(dto.accuracyMeters),
      headingDegrees: this.normalizeOptionalNumber(dto.headingDegrees),
      speedMetersPerSecond: this.normalizeOptionalNumber(dto.speedMetersPerSecond),
      label,
      mapUrl: this.buildMapUrl(latitude, longitude),
      liveExpiresAt: liveExpiresAt?.toISOString() ?? null,
      liveStoppedAt: stoppedAt?.toISOString() ?? null,
      updatedAt: now,
    };

    return {
      location: location as unknown as Prisma.InputJsonObject,
    } as Prisma.InputJsonObject;
  }

  private getLocationPayload(payload: unknown): MessageLocationPayload | null {
    const location = this.getPlainMessagePayload(payload).location;

    if (!location || typeof location !== 'object' || Array.isArray(location)) {
      return null;
    }

    const value = location as Record<string, unknown>;
    const kind = value.kind;
    const latitude = value.latitude;
    const longitude = value.longitude;
    const mapUrl = value.mapUrl;
    const updatedAt = value.updatedAt;

    if (
      (kind !== 'CURRENT' && kind !== 'LIVE') ||
      typeof latitude !== 'number' ||
      typeof longitude !== 'number' ||
      typeof mapUrl !== 'string' ||
      typeof updatedAt !== 'string'
    ) {
      return null;
    }

    return {
      kind,
      latitude,
      longitude,
      accuracyMeters: typeof value.accuracyMeters === 'number' ? value.accuracyMeters : null,
      headingDegrees: typeof value.headingDegrees === 'number' ? value.headingDegrees : null,
      speedMetersPerSecond: typeof value.speedMetersPerSecond === 'number' ? value.speedMetersPerSecond : null,
      label: typeof value.label === 'string' ? value.label : null,
      mapUrl,
      liveExpiresAt: typeof value.liveExpiresAt === 'string' ? value.liveExpiresAt : null,
      liveStoppedAt: typeof value.liveStoppedAt === 'string' ? value.liveStoppedAt : null,
      updatedAt,
    };
  }

  private isLiveLocationActive(location: MessageLocationPayload | null): boolean {
    if (!location || location.kind !== 'LIVE' || location.liveStoppedAt) {
      return false;
    }

    if (!location.liveExpiresAt) {
      return false;
    }

    return new Date(location.liveExpiresAt).getTime() > Date.now();
  }

  private getForwardedMessageMetadata(
    payload: unknown,
  ): ForwardedMessageMetadata | null {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const forwardedFrom = (payload as Record<string, unknown>)['forwardedFrom'];

    if (
      !forwardedFrom ||
      typeof forwardedFrom !== 'object' ||
      Array.isArray(forwardedFrom)
    ) {
      return null;
    }

    const value = forwardedFrom as Record<string, unknown>;
    const requiredKeys = [
      'sourceMessageId',
      'sourceConversationId',
      'originalSenderAccountId',
      'originalSenderDisplayName',
      'originalSentAt',
      'originalTextContent',
    ] as const;

    if (requiredKeys.some((key) => typeof value[key] !== 'string')) {
      return null;
    }

    return {
      sourceMessageId: value['sourceMessageId'] as string,
      sourceConversationId: value['sourceConversationId'] as string,
      originalSenderAccountId: value['originalSenderAccountId'] as string,
      originalSenderDisplayName: value['originalSenderDisplayName'] as string,
      originalSentAt: value['originalSentAt'] as string,
      originalTextContent: value['originalTextContent'] as string,
    };
  }

  private getAggregateReceiptDate(dates: Array<Date | null>): Date | null {
    if (dates.length === 0 || dates.some((date) => date === null)) {
      return null;
    }

    return dates.reduce<Date>((latest, date) => {
      const nonNullDate = date as Date;

      return nonNullDate.getTime() > latest.getTime() ? nonNullDate : latest;
    }, dates[0] as Date);
  }

  private canExposeReceiptRead(
    message: MessageRecord,
    receipt: MessageRecord['receipts'][number],
    viewerAccountId?: string,
  ): boolean {
    if (!viewerAccountId || viewerAccountId !== message.senderAccountId) {
      return true;
    }

    // When a recipient disables read receipts, the sender can still see delivery,
    // but read state stays hidden. Internal readAt remains stored for unread counts.
    return receipt.account.showReadReceipts;
  }

  private getVisibleReadAt(
    message: MessageRecord,
    receipt: MessageRecord['receipts'][number],
    viewerAccountId?: string,
  ): Date | null {
    return this.canExposeReceiptRead(message, receipt, viewerAccountId)
      ? receipt.readAt
      : null;
  }

  private getDeliveryStatus(
    message: MessageRecord,
    viewerAccountId?: string,
  ): DeliveryStatus {
    if (message.receipts.length === 0) {
      return 'SENT';
    }

    if (
      message.receipts.every(
        (receipt) => this.getVisibleReadAt(message, receipt, viewerAccountId) !== null,
      )
    ) {
      return 'READ';
    }

    if (message.receipts.every((receipt) => receipt.deliveredAt !== null)) {
      return 'DELIVERED';
    }

    return 'SENT';
  }

  private serializeReply(message: MessageRecord['replyTo']) {
    if (!message) {
      return null;
    }


    return {
      id: message.id,
      senderAccountId: message.senderAccountId,
      sender: this.serializeAccount(message.sender),
      contentType: message.contentType,
      textContent: message.deletedAt ? null : message.textContent,
      sentAt: message.sentAt,
      isDeleted: message.deletedAt !== null,
    };
  }

  private getVisibleMessageInformationReadAt(
    message: Pick<MessageInformationRecord, 'senderAccountId'>,
    receipt: MessageInformationRecord['receipts'][number],
    viewerAccountId: string,
  ): Date | null {
    if (viewerAccountId !== message.senderAccountId) {
      return receipt.accountId === viewerAccountId ? receipt.readAt : null;
    }

    // Recipient privacy can hide read time from the sender while delivery remains visible.
    return receipt.account.showReadReceipts ? receipt.readAt : null;
  }

  private serializeMessageInformation(
    message: MessageInformationRecord,
    viewerAccountId: string,
  ) {
    const recipients = message.receipts.map((receipt) => {
      const readAt = this.getVisibleMessageInformationReadAt(
        message,
        receipt,
        viewerAccountId,
      );

      return {
        accountId: receipt.accountId,
        account: this.serializeAccount(receipt.account),
        deliveredAt: receipt.deliveredAt,
        readAt,
        readHidden: receipt.readAt !== null && readAt === null,
        createdAt: receipt.createdAt,
        updatedAt: receipt.updatedAt,
      };
    });

    return {
      message: this.serializeMessage(message, viewerAccountId),
      sender: this.serializeAccount(message.sender),
      sentAt: message.sentAt,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
      recipients,
      summary: {
        totalRecipients: message.receipts.length,
        delivered: recipients.filter((receipt) => receipt.deliveredAt !== null).length,
        read: recipients.filter((receipt) => receipt.readAt !== null).length,
        readHidden: recipients.filter((receipt) => receipt.readHidden).length,
      },
    };
  }

  private serializeMessage(
    message: MessageRecord,
    viewerAccountId?: string,
  ) {
    const deliveredAt = this.getAggregateReceiptDate(
      message.receipts.map((receipt) => receipt.deliveredAt),
    );

    const readAt = this.getAggregateReceiptDate(
      message.receipts.map((receipt) =>
        this.getVisibleReadAt(message, receipt, viewerAccountId),
      ),
    );

    const viewerStar = viewerAccountId
      ? message.stars?.find((star) => star.accountId === viewerAccountId) ?? null
      : null;
    const activePin = message.pins?.[0] ?? null;

    return {
      id: message.id,
      conversationId: message.conversationId,
      senderAccountId: message.senderAccountId,
      clientMessageId: message.clientMessageId,
      sender: this.serializeAccount(message.sender),
      contentType: message.contentType,
      textContent: message.deletedAt ? null : message.textContent,
      payload: message.deletedAt ? null : message.payload,
      replyToMessageId: message.replyToMessageId,
      replyTo: this.serializeReply(message.replyTo),
      forwardedFrom: this.getForwardedMessageMetadata(message.payload),
      isStarred: viewerStar !== null,
      starredAt: viewerStar?.starredAt ?? null,
      isPinned: activePin !== null,
      pinnedAt: activePin?.pinnedAt ?? null,
      pinnedByAccountId: activePin?.pinnedByAccountId ?? null,
      pinnedBy: activePin ? this.serializeAccount(activePin.pinnedBy) : null,
      sentAt: message.sentAt,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
      isDeleted: message.deletedAt !== null,
      deliveryStatus: this.getDeliveryStatus(message, viewerAccountId),
      deliveredAt,
      readAt,
      receiptSummary: {
        total: message.receipts.length,
        delivered: message.receipts.filter(
          (receipt) => receipt.deliveredAt !== null,
        ).length,
        read: message.receipts.filter(
          (receipt) => this.getVisibleReadAt(message, receipt, viewerAccountId) !== null,
        ).length,
      },

      reactions:
        message.reactions?.map((reaction) => ({
          accountId: reaction.accountId,
          reactionValue: reaction.reactionValue,
          account: this.serializeAccount(reaction.account),
          createdAt: reaction.createdAt,
          updatedAt: reaction.updatedAt,
        })) ?? [],

      attachments: message.deletedAt
        ? []
        : message.attachments.map((attachment) => ({
            id: attachment.id,
            messageId: attachment.messageId,
            originalFileName: attachment.originalFileName,
            mimeType: attachment.mimeType,
            fileSizeBytes: attachment.fileSizeBytes,
            contentType: attachment.contentType,
            scanStatus: attachment.scanStatus,
            createdAt: attachment.createdAt,
            updatedAt: attachment.updatedAt,
          })),

      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }

  private isMuteActive(
    participant: {
      isMuted: boolean;
      mutedUntil?: Date | null;
    },
    now = new Date(),
  ): boolean {
    return participant.isMuted && (!participant.mutedUntil || participant.mutedUntil > now);
  }

  private getMuteUntil(mute: ConversationMuteSetting, now: Date): Date | null {
    if (mute === '8_HOURS') {
      return new Date(now.getTime() + 8 * 60 * 60 * 1000);
    }

    if (mute === '1_WEEK') {
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    }

    return null;
  }

  private serializeConversation(
    conversation: ConversationRecord,
    viewerAccountId: string,
    unreadCount: number,
  ) {
    const viewerParticipant = conversation.participants.find(
      (participant) => participant.accountId === viewerAccountId,
    );

    const activeParticipants = conversation.participants.filter(
      (participant) => participant.leftAt === null,
    );

    const otherParticipants = activeParticipants.filter(
      (participant) => participant.accountId !== viewerAccountId,
    );

    const privatePeer = otherParticipants[0]?.account ?? null;
    const isMarkedUnread = viewerParticipant?.markedUnreadAt !== null && viewerParticipant?.markedUnreadAt !== undefined;
    const normalizedUnreadCount = isMarkedUnread && unreadCount === 0 ? 1 : unreadCount;

    return {
      id: conversation.id,
      type: conversation.type,
      title:
        conversation.type === ConversationType.PRIVATE && privatePeer
          ? this.serializeAccount(privatePeer).displayName
          : conversation.title,
      description: conversation.description,
      groupPhotoKey: conversation.groupPhotoKey,
      groupKind: conversation.groupKind,
      officialScope: conversation.officialScopeType
        ? {
            scopeType: conversation.officialScopeType,
            divisionId: conversation.officialDivisionId,
            departmentId: conversation.officialDepartmentId,
            division: conversation.officialDivision,
            department: conversation.officialDepartment,
          }
        : null,
      createdByAccountId: conversation.createdByAccountId,
      lastMessageAt: conversation.messages[0]?.sentAt ?? null,
      unreadCount: normalizedUnreadCount,
      isMuted: viewerParticipant ? this.isMuteActive(viewerParticipant) : false,
      mutedUntil: viewerParticipant?.mutedUntil ?? null,
      isArchived: viewerParticipant?.isArchived ?? false,
      archivedAt: viewerParticipant?.archivedAt ?? null,
      isPinned: viewerParticipant?.isPinned ?? false,
      pinnedAt: viewerParticipant?.pinnedAt ?? null,
      isMarkedUnread,
      markedUnreadAt: viewerParticipant?.markedUnreadAt ?? null,
      draftText: viewerParticipant?.draftText ?? null,
      draftUpdatedAt: viewerParticipant?.draftUpdatedAt ?? null,
      viewerParticipantRole: viewerParticipant?.role ?? null,
      canManageGroup:
        conversation.type === ConversationType.GROUP &&
        (viewerParticipant?.role === ConversationParticipantRole.OWNER ||
          viewerParticipant?.role === ConversationParticipantRole.ADMIN),
      memberCount: activeParticipants.length,
      participants: activeParticipants.map((participant) => ({
        ...this.serializeAccount(participant.account),
        joinedAt: participant.joinedAt,
        participantRole: participant.role,
      })),
      lastMessage: conversation.messages[0]
        ? this.serializeMessage(conversation.messages[0], viewerAccountId)
        : null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private serializeNotification(notification: MessagingNotificationRecord) {
    return {
      id: notification.id,
      recipientAccountId: notification.recipientAccountId,
      actorAccountId: notification.actorAccountId,
      actor: notification.actor ? this.serializeAccount(notification.actor) : null,
      conversationId: notification.conversationId,
      messageId: notification.messageId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      isRead: notification.isRead,
      readAt: notification.readAt,
      metadata: notification.metadata,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }

  private ensureAnalyticsViewer(viewer: MessagingViewer): void {
    if (viewer.role === AccountRole.EMPLOYEE) {
      throw new ForbiddenException('Analytics are available only to management accounts.');
    }
  }

  private getAnalyticsEmployeeScopeWhere(viewer: MessagingViewer): Prisma.EmployeeWhereInput {
    return {
      divisionId: viewer.divisionId ?? undefined,
      ...(viewer.role === AccountRole.TEAM_MANAGER
        ? { departmentId: viewer.departmentId ?? undefined }
        : {}),
    };
  }

  private getAnalyticsAccountWhere(viewer: MessagingViewer): Prisma.AccountWhereInput {
    if (viewer.role === AccountRole.SUPER_ADMIN) {
      return {};
    }

    // Management analytics are scoped by employee assignment, not by editable frontend filters.
    return {
      employee: {
        is: this.getAnalyticsEmployeeScopeWhere(viewer),
      },
    };
  }

  private async buildAnalyticsScopeSummary(
    viewer: MessagingViewer,
  ): Promise<AnalyticsScopeSummary> {
    const [division, department] = await Promise.all([
      viewer.divisionId
        ? this.prisma.division.findUnique({
            where: { id: viewer.divisionId },
            select: { id: true, name: true, code: true, isActive: true },
          })
        : null,
      viewer.departmentId
        ? this.prisma.department.findUnique({
            where: { id: viewer.departmentId },
            select: { id: true, name: true, code: true, isActive: true },
          })
        : null,
    ]);

    const label =
      viewer.role === AccountRole.SUPER_ADMIN
        ? 'Organization-wide analytics'
        : viewer.role === AccountRole.SENIOR_MANAGEMENT
          ? 'Division analytics'
          : 'Department analytics';

    return {
      role: viewer.role,
      label,
      division,
      department,
    };
  }

  private emptyCountItems(keys: string[]): AnalyticsCountItem[] {
    return keys.map((key) => ({
      key,
      label: key
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      count: 0,
    }));
  }

  private countMapToItems(
    keys: string[],
    counts: Map<string, number>,
  ): AnalyticsCountItem[] {
    return this.emptyCountItems(keys).map((item) => ({
      ...item,
      count: counts.get(item.key) ?? 0,
    }));
  }

  private parseMessageSearchFilters(
    query: SearchMessagesQueryDto,
  ): MessageSearchFilters {
    const searchText = query.search?.trim() || null;
    const dateFrom = query.dateFrom ? new Date(query.dateFrom) : undefined;
    const dateTo = query.dateTo ? new Date(query.dateTo) : undefined;

    if (dateFrom && Number.isNaN(dateFrom.getTime())) {
      throw new BadRequestException('Start date filter is invalid.');
    }

    if (dateTo && Number.isNaN(dateTo.getTime())) {
      throw new BadRequestException('End date filter is invalid.');
    }

    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      throw new BadRequestException('Start date cannot be after end date.');
    }

    return {
      searchText,
      senderAccountId: query.senderAccountId,
      contentType: query.contentType,
      dateFrom,
      dateTo,
      limit: query.limit,
    };
  }

  private buildMessageSearchConditions(
    filters: MessageSearchFilters,
  ): Prisma.MessageWhereInput[] {
    const andConditions: Prisma.MessageWhereInput[] = [
      {
        deletedAt: null,
      },
    ];

    if (filters.senderAccountId) {
      andConditions.push({
        senderAccountId: filters.senderAccountId,
      });
    }

    if (filters.contentType) {
      andConditions.push({
        contentType: filters.contentType,
      });
    }

    if (filters.dateFrom || filters.dateTo) {
      andConditions.push({
        sentAt: {
          ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
          ...(filters.dateTo ? { lte: filters.dateTo } : {}),
        },
      });
    }

    if (filters.searchText) {
      // Search only approved visible fields so private payload data is not exposed accidentally.
      andConditions.push({
        OR: [
          {
            textContent: {
              contains: filters.searchText,
              mode: 'insensitive',
            },
          },
          {
            attachments: {
              some: {
                originalFileName: {
                  contains: filters.searchText,
                  mode: 'insensitive',
                },
              },
            },
          },
          {
            sender: {
              is: {
                OR: [
                  {
                    username: {
                      contains: filters.searchText,
                      mode: 'insensitive',
                    },
                  },
                  {
                    employee: {
                      is: {
                        OR: [
                          {
                            empName: {
                              contains: filters.searchText,
                              mode: 'insensitive',
                            },
                          },
                          {
                            empId: {
                              contains: filters.searchText,
                              mode: 'insensitive',
                            },
                          },
                          {
                            designation: {
                              contains: filters.searchText,
                              mode: 'insensitive',
                            },
                          },
                        ],
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      });
    }

    return andConditions;
  }

  private buildSearchSnippet(
    message: MessageRecord,
    searchText: string | null,
  ): string {
    const attachmentName = message.attachments.find((attachment) =>
      searchText
        ? attachment.originalFileName.toLowerCase().includes(searchText.toLowerCase())
        : false,
    )?.originalFileName;

    if (attachmentName) {
      return attachmentName;
    }

    const text = message.textContent?.trim();

    if (!text) {
      return message.attachments[0]?.originalFileName ?? String(message.contentType);
    }

    if (!searchText) {
      return text.length > 140 ? `${text.slice(0, 137)}...` : text;
    }

    const lowerText = text.toLowerCase();
    const lowerSearch = searchText.toLowerCase();
    const index = lowerText.indexOf(lowerSearch);

    if (index < 0) {
      return text.length > 140 ? `${text.slice(0, 137)}...` : text;
    }

    const start = Math.max(0, index - 45);
    const end = Math.min(text.length, index + searchText.length + 75);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < text.length ? '...' : '';

    return `${prefix}${text.slice(start, end)}${suffix}`;
  }

  private buildMessageSearchResult(
    message: MessageRecord,
    conversation: ConversationRecord,
    viewerAccountId: string,
    searchText: string | null,
  ) {
    return {
      message: this.serializeMessage(message, viewerAccountId),
      conversation: this.serializeConversation(conversation, viewerAccountId, 0),
      snippet: this.buildSearchSnippet(message, searchText),
      matchedAttachmentFileName:
        message.attachments.find((attachment) =>
          searchText
            ? attachment.originalFileName.toLowerCase().includes(searchText.toLowerCase())
            : false,
        )?.originalFileName ?? null,
    };
  }

  private async assertActiveParticipant(
    accountId: string,
    conversationId: string,
  ): Promise<{
    joinedAt: Date;
    role: ConversationParticipantRole;
  }> {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_accountId: {
          conversationId,
          accountId,
        },
      },

      select: {
        joinedAt: true,
        leftAt: true,
        role: true,
      },
    });

    if (!participant || participant.leftAt !== null) {
      throw new NotFoundException('Conversation was not found.');
    }

    return {
      joinedAt: participant.joinedAt,
      role: participant.role,
    };
  }

  private async findVisibleConversationMessageOrThrow(
    accountId: string,
    conversationId: string,
    messageId: string,
  ): Promise<MessageRecord> {
    const participant = await this.assertActiveParticipant(accountId, conversationId);

    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        sentAt: {
          gte: participant.joinedAt,
        },
        hiddenForAccounts: {
          none: {
            accountId,
          },
        },
      },

      select: messageSelect,
    });

    if (!message) {
      throw new NotFoundException('Message was not found.');
    }

    if (message.deletedAt) {
      throw new BadRequestException('Deleted messages cannot be used for this action.');
    }

    return message;
  }

  private normalizeAttachmentFileName(fileName: string): string {
    const normalized = fileName
      .normalize('NFKC')
      .replace(/[\/\0]/g, '_')
      .replace(/[\r\n]/g, ' ')
      .trim();

    if (!normalized) {
      return 'attachment';
    }

    return normalized.slice(0, 180);
  }

  private validateMessageAttachment(file?: UploadedMessageAttachmentFile): {
    originalFileName: string;
    contentType: MessageContentType;
  } {
    if (!file) {
      throw new BadRequestException('Attachment file is required.');
    }

    if (!file.buffer || file.size <= 0) {
      throw new BadRequestException('Attachment file is empty.');
    }

    const originalFileName = this.normalizeAttachmentFileName(
      file.originalname,
    );

    if (IMAGE_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      if (file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
        throw new BadRequestException('Image attachments must be 20 MB or smaller.');
      }

      return {
        originalFileName,
        contentType: MessageContentType.IMAGE,
      };
    }

    if (VIDEO_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      if (file.size > MAX_VIDEO_ATTACHMENT_BYTES) {
        throw new BadRequestException('Video attachments must be 200 MB or smaller.');
      }

      return {
        originalFileName,
        contentType: MessageContentType.VIDEO,
      };
    }

    if (AUDIO_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      // Audio files and browser voice notes share the same secure attachment pipeline.
      if (file.size > MAX_AUDIO_ATTACHMENT_BYTES) {
        throw new BadRequestException('Audio and voice-note attachments must be 25 MB or smaller.');
      }

      return {
        originalFileName,
        contentType: MessageContentType.AUDIO,
      };
    }

    if (DOCUMENT_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      if (file.size > MAX_DOCUMENT_ATTACHMENT_BYTES) {
        throw new BadRequestException('Document attachments must be 50 MB or smaller.');
      }

      return {
        originalFileName,
        contentType: MessageContentType.FILE,
      };
    }

    throw new BadRequestException(
      'Unsupported attachment type. Allowed files are JPG, PNG, WEBP, MP4, WEBM, MP3, M4A, AAC, WAV, OGG, WEBM audio, PDF, DOCX, XLSX, PPTX, TXT, CSV and ZIP.',
    );
  }

  private resolveAttachmentPath(storageKey: string): string {
    const absolutePath = path.resolve(MESSAGE_ATTACHMENT_STORAGE_DIR, storageKey);

    if (!absolutePath.startsWith(`${MESSAGE_ATTACHMENT_STORAGE_DIR}${path.sep}`)) {
      throw new BadRequestException('Attachment storage key is invalid.');
    }

    return absolutePath;
  }

  private async writeAttachmentFile(
    storageKey: string,
    file: UploadedMessageAttachmentFile,
  ): Promise<void> {
    const absolutePath = this.resolveAttachmentPath(storageKey);

    await fs.mkdir(path.dirname(absolutePath), {
      recursive: true,
    });

    await fs.writeFile(absolutePath, file.buffer);
  }

  private async deleteAttachmentFileIfExists(storageKey: string): Promise<void> {
    try {
      await fs.unlink(this.resolveAttachmentPath(storageKey));
    } catch {
      // Attachment cleanup is best-effort. The database remains authoritative.
    }
  }

  private async getActiveGroupAccess(
    accountId: string,
    conversationId: string,
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        type: ConversationType.GROUP,
        participants: {
          some: {
            accountId,
            leftAt: null,
          },
        },
      },
      select: {
        id: true,
        type: true,
        title: true,
        description: true,
        groupPhotoKey: true,
        groupKind: true,
        officialScopeType: true,
        officialDivisionId: true,
        officialDepartmentId: true,
        createdByAccountId: true,
        participants: {
          where: {
            leftAt: null,
          },
          orderBy: {
            joinedAt: 'asc',
          },
          select: {
            accountId: true,
            role: true,
            joinedAt: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Group conversation was not found.');
    }

    const viewerParticipant = conversation.participants.find(
      (participant) => participant.accountId === accountId,
    );

    if (!viewerParticipant) {
      throw new NotFoundException('Group conversation was not found.');
    }

    return {
      conversation,
      viewerParticipant,
    };
  }

  private assertGroupManager(role: ConversationParticipantRole): void {
    if (
      role !== ConversationParticipantRole.OWNER &&
      role !== ConversationParticipantRole.ADMIN
    ) {
      throw new ForbiddenException(
        'Only a group owner or administrator can manage this group.',
      );
    }
  }

  private async getEligibleGroupAccounts(
    viewer: MessagingViewer,
    requestedAccountIds: string[],
  ): Promise<MessagingAccountRecord[]> {
    const accountIds = [...new Set(requestedAccountIds)];

    if (accountIds.includes(viewer.accountId)) {
      throw new BadRequestException(
        'The current account is already included in the group.',
      );
    }

    const accounts = await this.prisma.account.findMany({
      where: {
        id: {
          in: accountIds,
        },
      },
      select: messagingAccountSelect,
    });

    if (
      accounts.length !== accountIds.length ||
      accounts.some(
        (account) =>
          !account.isEnabled || !this.isActiveEmployeeAccount(account),
      )
    ) {
      throw new BadRequestException(
        'One or more selected group members are unavailable.',
      );
    }

    if (viewer.role === AccountRole.SUPER_ADMIN) {
      return accounts;
    }

    const participantKeys = accounts.map((account) =>
      this.buildPrivateParticipantKey(viewer.accountId, account.id),
    );
    const existingConversations = await this.prisma.conversation.findMany({
      where: {
        privateParticipantKey: {
          in: participantKeys,
        },
      },
      select: {
        privateParticipantKey: true,
      },
    });
    const directKeys = new Set(
      existingConversations
        .map((conversation) => conversation.privateParticipantKey)
        .filter((value): value is string => Boolean(value)),
    );

    for (const account of accounts) {
      const key = this.buildPrivateParticipantKey(viewer.accountId, account.id);

      if (
        this.getMessageRequestReason(viewer, account) !== null &&
        !directKeys.has(key)
      ) {
        throw new ForbiddenException(
          `${this.serializeAccount(account).displayName} cannot be added before first-contact approval is completed.`,
        );
      }
    }

    return accounts;
  }

  private parseOfficialScopeType(
    scopeType: CreateOfficialGroupConversationDto['scopeType'],
  ): OfficialGroupScopeType {
    switch (scopeType) {
      case 'ORGANIZATION':
        return OfficialGroupScopeType.ORGANIZATION;
      case 'DIVISION':
        return OfficialGroupScopeType.DIVISION;
      case 'DEPARTMENT':
        return OfficialGroupScopeType.DEPARTMENT;
      default:
        throw new BadRequestException('Official group scope type is invalid.');
    }
  }

  private async getAuthorizedOfficialGroupScope(
    viewer: MessagingViewer,
    scopeType: OfficialGroupScopeType,
    divisionId?: string | null,
    departmentId?: string | null,
  ) {
    if (scopeType === OfficialGroupScopeType.ORGANIZATION) {
      if (divisionId || departmentId) {
        throw new BadRequestException(
          'Organization-wide groups must not specify a division or department.',
        );
      }

      if (viewer.role !== AccountRole.SUPER_ADMIN) {
        throw new ForbiddenException(
          'Only the Super Admin can manage organization-wide official groups.',
        );
      }

      return {
        scopeType,
        division: null,
        department: null,
      };
    }

    if (!divisionId) {
      throw new BadRequestException(
        'A division is required for this official group scope.',
      );
    }

    const division = await this.prisma.division.findUnique({
      where: {
        id: divisionId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    if (!division || !division.isActive) {
      throw new NotFoundException(
        'The selected active division was not found.',
      );
    }

    if (scopeType === OfficialGroupScopeType.DIVISION) {
      if (departmentId) {
        throw new BadRequestException(
          'A division-wide group must not specify a department.',
        );
      }

      const authorized =
        viewer.role === AccountRole.SUPER_ADMIN ||
        (viewer.role === AccountRole.SENIOR_MANAGEMENT &&
          viewer.divisionId === division.id);

      if (!authorized) {
        throw new ForbiddenException(
          'You can create or manage official groups only inside your assigned division.',
        );
      }

      return {
        scopeType,
        division,
        department: null,
      };
    }

    if (!departmentId) {
      throw new BadRequestException(
        'A department is required for a department official group.',
      );
    }

    const department = await this.prisma.department.findUnique({
      where: {
        id: departmentId,
      },
      select: {
        id: true,
        divisionId: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    if (
      !department ||
      !department.isActive ||
      department.divisionId !== division.id
    ) {
      throw new NotFoundException(
        'The selected active department was not found in this division.',
      );
    }

    const authorized =
      viewer.role === AccountRole.SUPER_ADMIN ||
      (viewer.role === AccountRole.SENIOR_MANAGEMENT &&
        viewer.divisionId === division.id) ||
      (viewer.role === AccountRole.TEAM_MANAGER &&
        viewer.divisionId === division.id &&
        viewer.departmentId === department.id);

    if (!authorized) {
      throw new ForbiddenException(
        'You can create or manage official groups only inside your assigned organizational scope.',
      );
    }

    return {
      scopeType,
      division,
      department,
    };
  }

  private async assertCanManageOfficialGroup(
    viewer: MessagingViewer,
    conversation: {
      groupKind: GroupKind | null;
      officialScopeType: OfficialGroupScopeType | null;
      officialDivisionId: string | null;
      officialDepartmentId: string | null;
    },
  ): Promise<void> {
    if (
      conversation.groupKind !== GroupKind.OFFICIAL ||
      !conversation.officialScopeType
    ) {
      throw new ConflictException(
        'This conversation is not an official organizational group.',
      );
    }

    await this.getAuthorizedOfficialGroupScope(
      viewer,
      conversation.officialScopeType,
      conversation.officialDivisionId,
      conversation.officialDepartmentId,
    );
  }

  private buildOfficialGroupMembershipWhere(
    group: OfficialGroupScopeRecord,
  ): Prisma.AccountWhereInput {
    const employeeWhere: Prisma.EmployeeWhereInput = {
      status: EmployeeStatus.ACTIVE,
      employmentStatus: EmploymentStatus.ACTIVE,
      archivedAt: null,
      isActivated: true,
      division: {
        is: {
          isActive: true,
        },
      },
    };

    if (group.officialScopeType === OfficialGroupScopeType.DIVISION) {
      employeeWhere.divisionId = group.officialDivisionId;
    }

    if (group.officialScopeType === OfficialGroupScopeType.DEPARTMENT) {
      employeeWhere.divisionId = group.officialDivisionId;
      employeeWhere.departmentId = group.officialDepartmentId;
      employeeWhere.departmentUnit = {
        is: {
          isActive: true,
        },
      };
    } else {
      employeeWhere.OR = [
        {
          departmentId: null,
        },
        {
          departmentUnit: {
            is: {
              isActive: true,
            },
          },
        },
      ];
    }

    return {
      isEnabled: true,
      OR: [
        {
          role: AccountRole.SUPER_ADMIN,
        },
        {
          employee: {
            is: employeeWhere,
          },
        },
      ],
    };
  }

  private getOfficialGroupParticipantRole(
    account: MessagingAccountRecord,
    group: OfficialGroupScopeRecord,
  ): ConversationParticipantRole {
    if (account.role === AccountRole.SUPER_ADMIN) {
      return ConversationParticipantRole.OWNER;
    }

    if (
      group.officialScopeType === OfficialGroupScopeType.DIVISION &&
      account.role === AccountRole.SENIOR_MANAGEMENT &&
      account.employee?.divisionId === group.officialDivisionId
    ) {
      return ConversationParticipantRole.ADMIN;
    }

    if (group.officialScopeType === OfficialGroupScopeType.DEPARTMENT) {
      if (
        account.role === AccountRole.SENIOR_MANAGEMENT &&
        account.employee?.divisionId === group.officialDivisionId
      ) {
        return ConversationParticipantRole.ADMIN;
      }

      if (
        account.role === AccountRole.TEAM_MANAGER &&
        account.employee?.departmentId === group.officialDepartmentId
      ) {
        return ConversationParticipantRole.ADMIN;
      }
    }

    return ConversationParticipantRole.MEMBER;
  }

  private async getDesiredOfficialGroupAccounts(
    group: OfficialGroupScopeRecord,
  ): Promise<MessagingAccountRecord[]> {
    return this.prisma.account.findMany({
      where: this.buildOfficialGroupMembershipWhere(group),
      orderBy: [
        {
          role: 'asc',
        },
        {
          id: 'asc',
        },
      ],
      select: messagingAccountSelect,
    });
  }

  private async synchronizeOfficialGroup(
    conversationId: string,
    actorAccountId: string | null,
    reason: string,
    forceAudit = false,
  ): Promise<OfficialGroupSyncResult> {
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
      select: {
        id: true,
        type: true,
        groupKind: true,
        createdByAccountId: true,
        officialScopeType: true,
        officialDivisionId: true,
        officialDepartmentId: true,
        participants: {
          select: {
            accountId: true,
            joinedAt: true,
            leftAt: true,
            role: true,
          },
        },
      },
    });

    if (
      !conversation ||
      conversation.type !== ConversationType.GROUP ||
      conversation.groupKind !== GroupKind.OFFICIAL ||
      !conversation.officialScopeType
    ) {
      throw new NotFoundException('Official group was not found.');
    }

    const group: OfficialGroupScopeRecord = {
      id: conversation.id,
      createdByAccountId: conversation.createdByAccountId,
      officialScopeType: conversation.officialScopeType,
      officialDivisionId: conversation.officialDivisionId,
      officialDepartmentId: conversation.officialDepartmentId,
    };
    const desiredAccounts = await this.getDesiredOfficialGroupAccounts(group);
    const currentByAccountId = new Map<
      string,
      OfficialGroupParticipantSyncRecord
    >(
      conversation.participants.map((participant) => [
        participant.accountId,
        participant,
      ]),
    );
    const desiredByAccountId = new Map<string, MessagingAccountRecord>(
      desiredAccounts.map((account) => [account.id, account]),
    );
    const addedAccountIds: string[] = [];
    const removedAccountIds: string[] = [];
    const roleChangedAccountIds: string[] = [];

    for (const account of desiredAccounts) {
      const current = currentByAccountId.get(account.id);
      const role = this.getOfficialGroupParticipantRole(account, group);

      if (!current || current.leftAt !== null) {
        addedAccountIds.push(account.id);
      } else if (current.role !== role) {
        roleChangedAccountIds.push(account.id);
      }
    }

    for (const participant of conversation.participants) {
      if (
        participant.leftAt === null &&
        !desiredByAccountId.has(participant.accountId)
      ) {
        removedAccountIds.push(participant.accountId);
      }
    }

    const changed =
      addedAccountIds.length > 0 ||
      removedAccountIds.length > 0 ||
      roleChangedAccountIds.length > 0;

    if (!changed && !forceAudit) {
      return {
        conversationId,
        addedCount: 0,
        removedCount: 0,
        roleChangedCount: 0,
      };
    }

    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      for (const account of desiredAccounts) {
        const current = currentByAccountId.get(account.id);
        const role = this.getOfficialGroupParticipantRole(account, group);

        if (current?.leftAt === null && current.role === role) {
          continue;
        }

        await transaction.conversationParticipant.upsert({
          where: {
            conversationId_accountId: {
              conversationId,
              accountId: account.id,
            },
          },
          update: {
            ...(current?.leftAt !== null
              ? {
                  joinedAt: now,
                }
              : {}),
            leftAt: null,
            role,
            isArchived: false,
          },
          create: {
            conversationId,
            accountId: account.id,
            joinedAt: now,
            role,
          },
        });
      }

      if (removedAccountIds.length > 0) {
        await transaction.conversationParticipant.updateMany({
          where: {
            conversationId,
            accountId: {
              in: removedAccountIds,
            },
            leftAt: null,
          },
          data: {
            leftAt: now,
            role: ConversationParticipantRole.MEMBER,
            isArchived: true,
          },
        });
      }

      await transaction.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          updatedAt: now,
        },
      });

      await transaction.officialGroupAuditLog.create({
        data: {
          conversationId,
          actorAccountId,
          action: forceAudit
            ? OfficialGroupAuditAction.RECONCILED
            : OfficialGroupAuditAction.MEMBERSHIP_SYNCED,
          metadata: {
            reason,
            addedAccountIds,
            removedAccountIds,
            roleChangedAccountIds,
          },
        },
      });
    });

    const notifiedAccountIds = [
      ...desiredAccounts.map((account) => account.id),
      ...conversation.participants.map((participant) => participant.accountId),
    ];

    this.messagingEventsService.emitConversationUpdated(notifiedAccountIds, {
      conversationId,
      reason: 'OFFICIAL_GROUP_SYNCED',
      occurredAt: now.toISOString(),
    });

    return {
      conversationId,
      addedCount: addedAccountIds.length,
      removedCount: removedAccountIds.length,
      roleChangedCount: roleChangedAccountIds.length,
    };
  }

  async synchronizeOfficialGroupsForAccountSafely(
    accountId: string | null | undefined,
    actorAccountId: string | null,
    reason: string,
  ): Promise<void> {
    if (!accountId) {
      return;
    }

    try {
      const account = await this.prisma.account.findUnique({
        where: {
          id: accountId,
        },
        select: {
          id: true,
          employee: {
            select: {
              divisionId: true,
              departmentId: true,
            },
          },
        },
      });

      const scopeConditions: Prisma.ConversationWhereInput[] = [
        {
          participants: {
            some: {
              accountId,
            },
          },
        },
        {
          officialScopeType: OfficialGroupScopeType.ORGANIZATION,
        },
      ];

      if (account?.employee?.divisionId) {
        scopeConditions.push({
          officialScopeType: OfficialGroupScopeType.DIVISION,
          officialDivisionId: account.employee.divisionId,
        });
      }

      if (account?.employee?.departmentId) {
        scopeConditions.push({
          officialScopeType: OfficialGroupScopeType.DEPARTMENT,
          officialDepartmentId: account.employee.departmentId,
        });
      }

      const groups = await this.prisma.conversation.findMany({
        where: {
          type: ConversationType.GROUP,
          groupKind: GroupKind.OFFICIAL,
          OR: scopeConditions,
        },
        select: {
          id: true,
        },
      });

      for (const group of groups) {
        await this.synchronizeOfficialGroup(group.id, actorAccountId, reason);
      }
    } catch (error) {
      this.logger.error(
        `Official-group membership synchronization failed for account ${accountId}.`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async synchronizeAllOfficialGroupsSafely(
    actorAccountId: string | null,
    reason: string,
  ): Promise<void> {
    try {
      const groups = await this.prisma.conversation.findMany({
        where: {
          type: ConversationType.GROUP,
          groupKind: GroupKind.OFFICIAL,
        },
        select: {
          id: true,
        },
      });

      for (const group of groups) {
        try {
          await this.synchronizeOfficialGroup(group.id, actorAccountId, reason);
        } catch (error) {
          this.logger.error(
            `Official-group synchronization failed for conversation ${group.id}.`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Official-group synchronization could not be started.',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async getMessagingAnalytics(user: AuthenticatedUser) {
    const viewer = await this.getMessagingViewer(user);

    this.ensureAnalyticsViewer(viewer);

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - 7);

    const accountWhere = this.getAnalyticsAccountWhere(viewer);

    const scopedAccounts = await this.prisma.account.findMany({
      where: accountWhere,
      select: { id: true },
    });

    const scopedAccountIds = scopedAccounts.map((account) => account.id);
    const scopedAccountFilter: Prisma.StringFilter = { in: scopedAccountIds };

    const scopedMessageWhere: Prisma.MessageWhereInput = {
      senderAccountId: scopedAccountFilter,
      deletedAt: null,
    };

    const scopedConversationWhere: Prisma.ConversationWhereInput = {
      participants: {
        some: {
          accountId: scopedAccountFilter,
          leftAt: null,
        },
      },
    };

    const [
      scope,
      totalUsers,
      enabledUsers,
      disabledUsers,
      activeEmployeeUsers,
      roleGroups,
      scopedEmployees,
      totalConversations,
      conversationGroups,
      totalMessages,
      messageGroups,
      totalAttachments,
      attachmentGroups,
      totalNotifications,
      unreadNotifications,
      activeUsersToday,
      activeUsersThisWeek,
      messagesToday,
      messagesThisWeek,
      attachmentsToday,
      notificationsToday,
      latestMessageActivity,
    ] = await Promise.all([
      this.buildAnalyticsScopeSummary(viewer),
      this.prisma.account.count({ where: accountWhere }),
      this.prisma.account.count({ where: { ...accountWhere, isEnabled: true } }),
      this.prisma.account.count({ where: { ...accountWhere, isEnabled: false } }),
      this.prisma.account.count({
        where: {
          ...accountWhere,
          isEnabled: true,
          employee: {
            is: {
              ...this.getAnalyticsEmployeeScopeWhere(viewer),
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              archivedAt: null,
              isActivated: true,
            },
          },
        },
      }),
      this.prisma.account.groupBy({
        by: ['role'],
        where: accountWhere,
        _count: { _all: true },
      }),
      this.prisma.employee.findMany({
        where: {
          account: {
            is: {
              id: scopedAccountFilter,
            },
          },
        },
        select: {
          divisionId: true,
          departmentId: true,
          division: { select: { id: true, name: true, code: true } },
          departmentUnit: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.conversation.count({ where: scopedConversationWhere }),
      this.prisma.conversation.groupBy({
        by: ['type', 'groupKind'],
        where: scopedConversationWhere,
        _count: { _all: true },
      }),
      this.prisma.message.count({ where: scopedMessageWhere }),
      this.prisma.message.groupBy({
        by: ['contentType'],
        where: scopedMessageWhere,
        _count: { _all: true },
      }),
      this.prisma.messageAttachment.count({
        where: { message: { is: scopedMessageWhere } },
      }),
      this.prisma.messageAttachment.groupBy({
        by: ['contentType'],
        where: { message: { is: scopedMessageWhere } },
        _count: { _all: true },
        _sum: { fileSizeBytes: true },
      }),
      this.prisma.messagingNotification.count({
        where: { recipientAccountId: scopedAccountFilter },
      }),
      this.prisma.messagingNotification.count({
        where: { recipientAccountId: scopedAccountFilter, isRead: false },
      }),
      this.prisma.account.count({
        where: { ...accountWhere, lastLoginAt: { gte: todayStart } },
      }),
      this.prisma.account.count({
        where: { ...accountWhere, lastLoginAt: { gte: weekStart } },
      }),
      this.prisma.message.count({
        where: { ...scopedMessageWhere, sentAt: { gte: todayStart } },
      }),
      this.prisma.message.count({
        where: { ...scopedMessageWhere, sentAt: { gte: weekStart } },
      }),
      this.prisma.messageAttachment.count({
        where: {
          createdAt: { gte: todayStart },
          message: { is: scopedMessageWhere },
        },
      }),
      this.prisma.messagingNotification.count({
        where: {
          recipientAccountId: scopedAccountFilter,
          createdAt: { gte: todayStart },
        },
      }),
      this.prisma.message.aggregate({
        where: scopedMessageWhere,
        _max: { sentAt: true },
      }),
    ]);

    const roleCountMap = new Map(
      roleGroups.map((item) => [item.role, item._count._all]),
    );

    const messageTypeCountMap = new Map(
      messageGroups.map((item) => [item.contentType, item._count._all]),
    );

    const divisionCounts = new Map<string, AnalyticsCountItem>();
    const departmentCounts = new Map<string, AnalyticsCountItem>();

    for (const employee of scopedEmployees) {
      if (employee.division) {
        const current = divisionCounts.get(employee.division.id);
        divisionCounts.set(employee.division.id, {
          key: employee.division.id,
          label: `${employee.division.name} (${employee.division.code})`,
          count: (current?.count ?? 0) + 1,
        });
      }

      if (employee.departmentUnit) {
        const current = departmentCounts.get(employee.departmentUnit.id);
        departmentCounts.set(employee.departmentUnit.id, {
          key: employee.departmentUnit.id,
          label: `${employee.departmentUnit.name} (${employee.departmentUnit.code})`,
          count: (current?.count ?? 0) + 1,
        });
      }
    }

    const conversationTypeCounts = new Map<string, number>();

    for (const item of conversationGroups) {
      const key =
        item.type === ConversationType.PRIVATE
          ? 'PRIVATE'
          : item.groupKind === GroupKind.OFFICIAL
            ? 'OFFICIAL_GROUP'
            : item.groupKind === GroupKind.PERSONAL
              ? 'PERSONAL_GROUP'
              : item.type;

      conversationTypeCounts.set(
        key,
        (conversationTypeCounts.get(key) ?? 0) + item._count._all,
      );
    }

    const attachmentCounts: AnalyticsAttachmentItem[] = attachmentGroups.map((item) => ({
      key: item.contentType,
      label: item.contentType
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      count: item._count._all,
      totalBytes: item._sum.fileSizeBytes ?? 0,
    }));

    // Keep analytics audit-safe by returning counts only, never message bodies or file previews.
    return {
      generatedAt: now.toISOString(),
      scope,
      totals: {
        users: totalUsers,
        enabledUsers,
        disabledUsers,
        activeEmployeeUsers,
        conversations: totalConversations,
        messages: totalMessages,
        attachments: totalAttachments,
        notifications: totalNotifications,
        unreadNotifications,
      },
      usersByRole: this.countMapToItems(
        Object.values(AccountRole),
        roleCountMap,
      ),
      usersByDivision: Array.from(divisionCounts.values()).sort(
        (first, second) => second.count - first.count,
      ),
      usersByDepartment: Array.from(departmentCounts.values()).sort(
        (first, second) => second.count - first.count,
      ),
      conversationsByType: this.countMapToItems(
        ['PRIVATE', 'PERSONAL_GROUP', 'OFFICIAL_GROUP', 'ANNOUNCEMENT'],
        conversationTypeCounts,
      ),
      messagesByType: this.countMapToItems(
        Object.values(MessageContentType),
        messageTypeCountMap,
      ),
      attachmentsByType: attachmentCounts,
      activeUsers: {
        today: activeUsersToday,
        thisWeek: activeUsersThisWeek,
      },
      recentActivity: {
        messagesToday,
        messagesThisWeek,
        attachmentsToday,
        notificationsToday,
        latestMessageAt: latestMessageActivity._max.sentAt?.toISOString() ?? null,
      },
      privacyNotice:
        'Analytics are limited to aggregated counts and do not expose private message content.',
    };
  }

  async listMessagingNotifications(user: AuthenticatedUser) {
    const viewer = await this.getMessagingViewer(user);

    const [notifications, unreadCount] = await Promise.all([
      this.prisma.messagingNotification.findMany({
        where: {
          recipientAccountId: viewer.accountId,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: 40,
        select: messagingNotificationSelect,
      }),
      this.prisma.messagingNotification.count({
        where: {
          recipientAccountId: viewer.accountId,
          isRead: false,
        },
      }),
    ]);

    return {
      data: notifications.map((notification) =>
        this.serializeNotification(notification),
      ),
      unreadCount,
    };
  }

  async markMessagingNotificationRead(
    user: AuthenticatedUser,
    notificationId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);

    const notification = await this.prisma.messagingNotification.findFirst({
      where: {
        id: notificationId,
        recipientAccountId: viewer.accountId,
      },
      select: {
        id: true,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification was not found.');
    }

    await this.prisma.messagingNotification.update({
      where: {
        id: notificationId,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return this.listMessagingNotifications(user);
  }

  async markAllMessagingNotificationsRead(user: AuthenticatedUser) {
    const viewer = await this.getMessagingViewer(user);

    await this.prisma.messagingNotification.updateMany({
      where: {
        recipientAccountId: viewer.accountId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    return this.listMessagingNotifications(user);
  }

  async removeMessagingNotification(
    user: AuthenticatedUser,
    notificationId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);

    // Delete is scoped to the signed-in recipient so users cannot remove another account's alerts.
    const result = await this.prisma.messagingNotification.deleteMany({
      where: {
        id: notificationId,
        recipientAccountId: viewer.accountId,
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Notification was not found.');
    }

    return this.listMessagingNotifications(user);
  }

  async removeReadMessagingNotifications(user: AuthenticatedUser) {
    const viewer = await this.getMessagingViewer(user);

    // Read notifications can be cleared without changing unread badge accuracy.
    await this.prisma.messagingNotification.deleteMany({
      where: {
        recipientAccountId: viewer.accountId,
        isRead: true,
      },
    });

    return this.listMessagingNotifications(user);
  }

  async listOfficialGroupScopes(user: AuthenticatedUser) {
    const viewer = await this.getMessagingViewer(user);

    if (viewer.role === AccountRole.EMPLOYEE) {
      return {
        canCreate: false,
        scopes: [],
      };
    }

    const divisions = await this.prisma.division.findMany({
      where: {
        isActive: true,
        ...(viewer.role === AccountRole.SUPER_ADMIN
          ? {}
          : {
              id: viewer.divisionId ?? undefined,
            }),
      },
      orderBy: {
        name: 'asc',
      },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        departments: {
          where: {
            isActive: true,
            ...(viewer.role === AccountRole.TEAM_MANAGER
              ? {
                  id: viewer.departmentId ?? undefined,
                }
              : {}),
          },
          orderBy: {
            name: 'asc',
          },
          select: {
            id: true,
            divisionId: true,
            code: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    const scopes: Array<{
      key: string;
      scopeType: OfficialGroupScopeType;
      label: string;
      defaultTitle: string;
      divisionId: string | null;
      departmentId: string | null;
      division: {
        id: string;
        code: string;
        name: string;
        isActive: boolean;
      } | null;
      department: {
        id: string;
        divisionId: string;
        code: string;
        name: string;
        isActive: boolean;
      } | null;
    }> = [];

    if (viewer.role === AccountRole.SUPER_ADMIN) {
      scopes.push({
        key: 'ORGANIZATION',
        scopeType: OfficialGroupScopeType.ORGANIZATION,
        label: 'All Nepal Telecom employees',
        defaultTitle: 'All Employees',
        divisionId: null,
        departmentId: null,
        division: null,
        department: null,
      });
    }

    for (const division of divisions) {
      if (
        viewer.role === AccountRole.SUPER_ADMIN ||
        viewer.role === AccountRole.SENIOR_MANAGEMENT
      ) {
        scopes.push({
          key: `DIVISION:${division.id}`,
          scopeType: OfficialGroupScopeType.DIVISION,
          label: `${division.name} division`,
          defaultTitle: `${division.name} Division`,
          divisionId: division.id,
          departmentId: null,
          division: {
            id: division.id,
            code: division.code,
            name: division.name,
            isActive: division.isActive,
          },
          department: null,
        });
      }

      if (
        viewer.role === AccountRole.SUPER_ADMIN ||
        viewer.role === AccountRole.TEAM_MANAGER
      ) {
        for (const department of division.departments) {
          scopes.push({
            key: `DEPARTMENT:${department.id}`,
            scopeType: OfficialGroupScopeType.DEPARTMENT,
            label: `${department.name} department`,
            defaultTitle: `${department.name} Department`,
            divisionId: division.id,
            departmentId: department.id,
            division: {
              id: division.id,
              code: division.code,
              name: division.name,
              isActive: division.isActive,
            },
            department,
          });
        }
      }
    }

    return {
      canCreate: scopes.length > 0,
      scopes,
    };
  }

  async createOfficialGroupConversation(
    user: AuthenticatedUser,
    dto: CreateOfficialGroupConversationDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const title = dto.title.trim();
    const description = dto.description?.trim() || null;

    if (!title) {
      throw new BadRequestException('Official group name cannot be empty.');
    }

    const scopeType = this.parseOfficialScopeType(dto.scopeType);
    const scope = await this.getAuthorizedOfficialGroupScope(
      viewer,
      scopeType,
      dto.divisionId,
      dto.departmentId,
    );
    const group: OfficialGroupScopeRecord = {
      id: '',
      createdByAccountId: viewer.accountId,
      officialScopeType: scope.scopeType,
      officialDivisionId: scope.division?.id ?? null,
      officialDepartmentId: scope.department?.id ?? null,
    };
    const members = await this.getDesiredOfficialGroupAccounts(group);

    if (!members.some((member) => member.id === viewer.accountId)) {
      throw new ForbiddenException(
        'Your account is not eligible for the selected official group scope.',
      );
    }

    const now = new Date();
    const conversationId = await this.prisma.$transaction(
      async (transaction) => {
        const conversation = await transaction.conversation.create({
          data: {
            type: ConversationType.GROUP,
            title,
            description,
            groupKind: GroupKind.OFFICIAL,
            officialScopeType: scope.scopeType,
            officialDivisionId: scope.division?.id ?? null,
            officialDepartmentId: scope.department?.id ?? null,
            createdByAccountId: viewer.accountId,
          },
          select: {
            id: true,
          },
        });
        const createdGroup: OfficialGroupScopeRecord = {
          ...group,
          id: conversation.id,
        };

        await transaction.conversationParticipant.createMany({
          data: members.map((member) => ({
            conversationId: conversation.id,
            accountId: member.id,
            joinedAt: now,
            role: this.getOfficialGroupParticipantRole(member, createdGroup),
          })),
        });

        await transaction.officialGroupAuditLog.create({
          data: {
            conversationId: conversation.id,
            actorAccountId: viewer.accountId,
            action: OfficialGroupAuditAction.CREATED,
            metadata: {
              scopeType: scope.scopeType,
              divisionId: scope.division?.id ?? null,
              departmentId: scope.department?.id ?? null,
              memberCount: members.length,
            },
          },
        });

        return conversation.id;
      },
    );

    const conversation = await this.getConversationRecord(conversationId);

    this.messagingEventsService.emitConversationUpdated(
      members.map((member) => member.id),
      {
        conversationId,
        reason: 'OFFICIAL_GROUP_CREATED',
        occurredAt: now.toISOString(),
      },
    );

    return {
      message: 'Official group created and synchronized successfully.',
      data: this.serializeConversation(conversation, viewer.accountId, 0),
    };
  }

  async listOfficialGroupAudit(
    user: AuthenticatedUser,
    conversationId: string,
    query: ListOfficialGroupAuditQueryDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const access = await this.getActiveGroupAccess(
      viewer.accountId,
      conversationId,
    );

    await this.assertCanManageOfficialGroup(viewer, access.conversation);

    const data = await this.prisma.officialGroupAuditLog.findMany({
      where: {
        conversationId,
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      take: query.limit,
      select: officialGroupAuditSelect,
    });

    return {
      data: data.map((entry) => ({
        id: entry.id,
        conversationId: entry.conversationId,
        actorAccountId: entry.actorAccountId,
        action: entry.action,
        metadata: entry.metadata,
        createdAt: entry.createdAt,
        actor: entry.actor ? this.serializeAccount(entry.actor) : null,
      })),
    };
  }

  async reconcileOfficialGroups(user: AuthenticatedUser) {
    const viewer = await this.getMessagingViewer(user);

    if (viewer.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can reconcile every official group.',
      );
    }

    const groups = await this.prisma.conversation.findMany({
      where: {
        type: ConversationType.GROUP,
        groupKind: GroupKind.OFFICIAL,
      },
      select: {
        id: true,
      },
    });
    const results: OfficialGroupSyncResult[] = [];

    for (const group of groups) {
      results.push(
        await this.synchronizeOfficialGroup(
          group.id,
          viewer.accountId,
          'MANUAL_RECONCILIATION',
          true,
        ),
      );
    }

    return {
      message: `${groups.length} official group${groups.length === 1 ? '' : 's'} reconciled.`,
      reconciledCount: groups.length,
      addedCount: results.reduce(
        (total, result) => total + result.addedCount,
        0,
      ),
      removedCount: results.reduce(
        (total, result) => total + result.removedCount,
        0,
      ),
      roleChangedCount: results.reduce(
        (total, result) => total + result.roleChangedCount,
        0,
      ),
    };
  }

  async getActiveParticipantAccountIds(
    user: AuthenticatedUser,
    conversationId: string,
  ): Promise<string[]> {
    await this.getMessagingViewer(user);

    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        leftAt: null,
      },

      select: {
        accountId: true,
      },
    });

    if (
      !participants.some(
        (participant) => participant.accountId === user.accountId,
      )
    ) {
      throw new NotFoundException('Conversation was not found.');
    }

    return participants.map((participant) => participant.accountId);
  }

  private async markReceiptsDelivered(
    accountId: string,
    conversationIds: string[],
  ): Promise<number> {
    if (conversationIds.length === 0) {
      return 0;
    }

    const pendingReceipts = await this.prisma.messageReceipt.findMany({
      where: {
        accountId,
        deliveredAt: null,

        message: {
          is: {
            conversationId: {
              in: conversationIds,
            },
            hiddenForAccounts: {
              none: {
                accountId,
              },
            },
          },
        },
      },

      select: {
        messageId: true,

        message: {
          select: {
            conversationId: true,
            senderAccountId: true,
          },
        },
      },
    });

    if (pendingReceipts.length === 0) {
      return 0;
    }

    const now = new Date();

    const result = await this.prisma.messageReceipt.updateMany({
      where: {
        accountId,
        deliveredAt: null,
        messageId: {
          in: pendingReceipts.map((receipt) => receipt.messageId),
        },
      },

      data: {
        deliveredAt: now,
      },
    });

    const receiptsByConversationAndSender = new Map<
      string,
      {
        conversationId: string;
        senderAccountId: string;
        messageIds: string[];
      }
    >();

    for (const receipt of pendingReceipts) {
      const key = [
        receipt.message.conversationId,
        receipt.message.senderAccountId,
      ].join(':');

      const group = receiptsByConversationAndSender.get(key) ?? {
        conversationId: receipt.message.conversationId,
        senderAccountId: receipt.message.senderAccountId,
        messageIds: [],
      };

      group.messageIds.push(receipt.messageId);
      receiptsByConversationAndSender.set(key, group);
    }

    for (const group of receiptsByConversationAndSender.values()) {
      this.messagingEventsService.emitReceiptUpdated([group.senderAccountId], {
        conversationId: group.conversationId,
        messageIds: group.messageIds,
        accountId,
        status: 'DELIVERED',
        occurredAt: now.toISOString(),
      });
    }

    return result.count;
  }

  private async getConversationRecord(
    conversationId: string,
  ): Promise<ConversationRecord> {
    const conversation = await this.prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },

      select: conversationSelect,
    });

    if (!conversation) {
      throw new NotFoundException('Conversation was not found.');
    }

    return conversation;
  }

  private getMessageRequestReason(
    viewer: MessagingViewer,
    target: MessagingAccountRecord,
  ): MessageRequestReason | null {
    if (viewer.role === AccountRole.SUPER_ADMIN) {
      return null;
    }

    if (target.role === AccountRole.SUPER_ADMIN) {
      return MessageRequestReason.PROTECTED_RECIPIENT;
    }

    if (
      target.role === AccountRole.SENIOR_MANAGEMENT &&
      viewer.role !== AccountRole.SENIOR_MANAGEMENT
    ) {
      return MessageRequestReason.PROTECTED_RECIPIENT;
    }

    if (
      viewer.role === AccountRole.SENIOR_MANAGEMENT &&
      viewer.divisionId &&
      target.employee?.divisionId === viewer.divisionId
    ) {
      return null;
    }

    if (
      (viewer.role === AccountRole.TEAM_MANAGER ||
        viewer.role === AccountRole.EMPLOYEE) &&
      viewer.departmentId &&
      target.employee?.departmentId === viewer.departmentId
    ) {
      return null;
    }

    if (
      viewer.divisionId &&
      target.employee?.divisionId &&
      viewer.divisionId !== target.employee.divisionId
    ) {
      return MessageRequestReason.CROSS_DIVISION;
    }

    return MessageRequestReason.CROSS_DEPARTMENT;
  }

  private serializeMessageRequest(
    request: MessageRequestRecord,
    viewerAccountId: string,
  ) {
    const direction =
      request.requesterAccountId === viewerAccountId ? 'SENT' : 'RECEIVED';

    const peer = direction === 'SENT' ? request.recipient : request.requester;

    return {
      id: request.id,
      participantKey: request.participantKey,
      requesterAccountId: request.requesterAccountId,
      recipientAccountId: request.recipientAccountId,
      blockedByAccountId: request.blockedByAccountId,
      conversationId: request.conversationId,
      status: request.status,
      reason: request.reason,
      direction,
      requestCount: request.requestCount,
      requestedAt: request.requestedAt,
      respondedAt: request.respondedAt,
      requester: this.serializeAccount(request.requester),
      recipient: this.serializeAccount(request.recipient),
      peer: this.serializeAccount(peer),
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    };
  }

  private async openPrivateConversation(
    viewer: MessagingViewer,
    target: MessagingAccountRecord,
    privateParticipantKey: string,
    options?: {
      messageRequestId?: string;
      createdByAccountId?: string;
    },
  ) {
    const existingConversation = await this.prisma.conversation.findUnique({
      where: {
        privateParticipantKey,
      },

      select: {
        id: true,
      },
    });

    const now = new Date();

    const conversationId = await this.prisma.$transaction(
      async (transaction) => {
        const conversation = await transaction.conversation.upsert({
          where: {
            privateParticipantKey,
          },

          update: {},

          create: {
            type: ConversationType.PRIVATE,
            privateParticipantKey,
            createdByAccountId: options?.createdByAccountId ?? viewer.accountId,
          },

          select: {
            id: true,
            type: true,
          },
        });

        if (conversation.type !== ConversationType.PRIVATE) {
          throw new ConflictException(
            'The private conversation key is already used by another conversation type.',
          );
        }

        for (const accountId of [viewer.accountId, target.id]) {
          await transaction.conversationParticipant.upsert({
            where: {
              conversationId_accountId: {
                conversationId: conversation.id,
                accountId,
              },
            },

            update: {
              leftAt: null,
              isArchived: false,
            },

            create: {
              conversationId: conversation.id,
              accountId,
            },
          });
        }

        if (options?.messageRequestId) {
          await transaction.messageRequest.update({
            where: {
              id: options.messageRequestId,
            },

            data: {
              status: MessageRequestStatus.ACCEPTED,
              conversationId: conversation.id,
              respondedAt: now,
              blockedByAccountId: null,
            },
          });
        }

        return conversation.id;
      },
    );

    const conversation = await this.getConversationRecord(conversationId);
    const serializedConversation = this.serializeConversation(
      conversation,
      viewer.accountId,
      0,
    );

    this.messagingEventsService.emitConversationUpdated(
      [viewer.accountId, target.id],
      {
        conversationId,
        reason: existingConversation ? 'REOPENED' : 'CREATED',
        occurredAt: now.toISOString(),
      },
    );

    return {
      conversationId,
      created: existingConversation === null,
      data: serializedConversation,
    };
  }

  async searchConversationMessages(
    user: AuthenticatedUser,
    conversationId: string,
    query: SearchMessagesQueryDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const filters = this.parseMessageSearchFilters(query);

    const viewerParticipant = await this.assertActiveParticipant(
      viewer.accountId,
      conversationId,
    );

    const conversation = await this.getConversationRecord(conversationId);

    const messages = await this.prisma.message.findMany({
      where: {
        AND: [
          {
            conversationId,
            sentAt: {
              gte: viewerParticipant.joinedAt,
            },
            hiddenForAccounts: {
              none: {
                accountId: viewer.accountId,
              },
            },
          },
          ...this.buildMessageSearchConditions(filters),
        ],
      },

      orderBy: [
        {
          sentAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],

      take: filters.limit,
      select: messageSelect,
    });

    return {
      data: messages.map((message) =>
        this.buildMessageSearchResult(
          message,
          conversation,
          viewer.accountId,
          filters.searchText,
        ),
      ),
      filters: {
        search: filters.searchText,
        senderAccountId: filters.senderAccountId ?? null,
        contentType: filters.contentType ?? null,
        dateFrom: filters.dateFrom?.toISOString() ?? null,
        dateTo: filters.dateTo?.toISOString() ?? null,
        limit: filters.limit,
      },
    };
  }

  async searchMessaging(
    user: AuthenticatedUser,
    query: SearchMessagesQueryDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const filters = this.parseMessageSearchFilters(query);

    await this.synchronizeOfficialGroupsForAccountSafely(
      viewer.accountId,
      viewer.accountId,
      'MESSAGING_SEARCH',
    );

    const memberships = await this.prisma.conversationParticipant.findMany({
      where: {
        accountId: viewer.accountId,
        leftAt: null,
        isArchived: false,
      },
      select: {
        conversationId: true,
        joinedAt: true,
      },
    });

    const conversationIds = memberships.map((membership) => membership.conversationId);
    const visibilityConditions = memberships.map((membership) => ({
      conversationId: membership.conversationId,
      sentAt: {
        gte: membership.joinedAt,
      },
    }));

    const messages = visibilityConditions.length === 0
      ? []
      : await this.prisma.message.findMany({
          where: {
            AND: [
              {
                OR: visibilityConditions,
                hiddenForAccounts: {
                  none: {
                    accountId: viewer.accountId,
                  },
                },
              },
              ...this.buildMessageSearchConditions(filters),
            ],
          },

          orderBy: [
            {
              sentAt: 'desc',
            },
            {
              id: 'desc',
            },
          ],

          take: filters.limit,
          select: messageSelect,
        });

    const searchedConversationIds = [
      ...new Set(messages.map((message) => message.conversationId)),
    ];

    const messageConversations = searchedConversationIds.length === 0
      ? []
      : await this.prisma.conversation.findMany({
          where: {
            id: {
              in: searchedConversationIds,
            },
          },
          select: conversationSelect,
        });

    const conversationById = new Map(
      messageConversations.map((conversation) => [conversation.id, conversation]),
    );

    const conversationMatches = filters.searchText && conversationIds.length > 0
      ? await this.prisma.conversation.findMany({
          where: {
            id: {
              in: conversationIds,
            },
            OR: [
              {
                title: {
                  contains: filters.searchText,
                  mode: 'insensitive',
                },
              },
              {
                description: {
                  contains: filters.searchText,
                  mode: 'insensitive',
                },
              },
              {
                participants: {
                  some: {
                    account: {
                      is: {
                        OR: [
                          {
                            username: {
                              contains: filters.searchText,
                              mode: 'insensitive',
                            },
                          },
                          {
                            employee: {
                              is: {
                                OR: [
                                  {
                                    empName: {
                                      contains: filters.searchText,
                                      mode: 'insensitive',
                                    },
                                  },
                                  {
                                    empId: {
                                      contains: filters.searchText,
                                      mode: 'insensitive',
                                    },
                                  },
                                  {
                                    designation: {
                                      contains: filters.searchText,
                                      mode: 'insensitive',
                                    },
                                  },
                                ],
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          },
          orderBy: [
            {
              updatedAt: 'desc',
            },
            {
              id: 'desc',
            },
          ],
          take: 10,
          select: conversationSelect,
        })
      : [];

    // Contact results reuse the existing protected directory rules and message-request policy.
    const contactResponse = filters.searchText
      ? await this.searchMessagingContacts(user, {
          search: filters.searchText,
          limit: 10,
        })
      : {
          data: [],
        };

    const messageResults = messages.flatMap((message) => {
      const conversation = conversationById.get(message.conversationId);

      if (!conversation) {
        return [];
      }

      return [this.buildMessageSearchResult(
        message,
        conversation,
        viewer.accountId,
        filters.searchText,
      )];
    });

    return {
      messages: messageResults,
      conversations: conversationMatches.map((conversation) =>
        this.serializeConversation(conversation, viewer.accountId, 0),
      ),
      contacts: contactResponse.data,
      filters: {
        search: filters.searchText,
        senderAccountId: filters.senderAccountId ?? null,
        contentType: filters.contentType ?? null,
        dateFrom: filters.dateFrom?.toISOString() ?? null,
        dateTo: filters.dateTo?.toISOString() ?? null,
        limit: filters.limit,
      },
    };
  }


  async getMyMessagingProfile(user: AuthenticatedUser) {
    const viewer = await this.getMessagingViewer(user);

    const account = await this.prisma.account.findUnique({
      where: {
        id: viewer.accountId,
      },
      select: messagingAccountSelect,
    });

    if (!account) {
      throw new NotFoundException('Profile was not found.');
    }

    return {
      data: this.serializeUserProfile(account, viewer.accountId, [], 'SELF'),
    };
  }

  async getMessagingProfile(
    user: AuthenticatedUser,
    accountId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);

    const account = await this.prisma.account.findUnique({
      where: {
        id: accountId,
      },
      select: messagingAccountSelect,
    });

    if (!account || !this.isVisibleMessagingProfile(account)) {
      throw new NotFoundException('Profile was not found.');
    }

    const [sharedGroups, contactMode, blocks] = await Promise.all([
      this.listSharedGroupsForProfile(viewer.accountId, account.id),
      this.getProfileContactMode(viewer, account),
      this.findPersonalBlockRelation(viewer.accountId, account.id),
    ]);

    return {
      data: this.serializeUserProfile(
        account,
        viewer.accountId,
        sharedGroups,
        contactMode,
        this.getBlockDirection(viewer.accountId, account.id, blocks),
      ),
    };
  }

  async updateMyMessagingProfile(
    user: AuthenticatedUser,
    dto: UpdateMessagingProfileDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const bio = dto.bio?.trim() || null;

    const account = await this.prisma.account.findUnique({
      where: {
        id: viewer.accountId,
      },
      select: {
        id: true,
        employeeId: true,
      },
    });

    if (!account) {
      throw new NotFoundException('Profile was not found.');
    }

    // Display profile updates never change official employee identity fields.
    await this.prisma.$transaction(async (transaction) => {
      await transaction.account.update({
        where: {
          id: account.id,
        },
        data: {
          profileBio: bio,
        },
      });

      if (account.employeeId) {
        await transaction.employee.update({
          where: {
            id: account.employeeId,
          },
          data: {
            profileBio: bio,
          },
        });
      }
    });

    return this.getMyMessagingProfile(user);
  }

  async updateMyMessagingProfilePhoto(
    user: AuthenticatedUser,
    file?: UploadedMessageAttachmentFile,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const photo = this.validateProfilePhoto(file);

    const account = await this.prisma.account.findUnique({
      where: {
        id: viewer.accountId,
      },
      select: {
        id: true,
        employeeId: true,
        profilePhotoKey: true,
        employee: {
          select: {
            profilePhotoKey: true,
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Profile was not found.');
    }

    const storageKey = `${viewer.accountId}/${randomUUID()}-${photo.originalFileName}`;

    await this.writeProfilePhotoFile(storageKey, file as UploadedMessageAttachmentFile);

    // Store the display photo on Account so Super Admins without employee rows can also use it.
    await this.prisma.$transaction(async (transaction) => {
      await transaction.account.update({
        where: {
          id: account.id,
        },
        data: {
          profilePhotoKey: storageKey,
        },
      });

      if (account.employeeId) {
        await transaction.employee.update({
          where: {
            id: account.employeeId,
          },
          data: {
            profilePhotoKey: storageKey,
          },
        });
      }
    });

    await this.deleteProfilePhotoIfExists(account.profilePhotoKey ?? null);

    if (account.employee?.profilePhotoKey !== account.profilePhotoKey) {
      await this.deleteProfilePhotoIfExists(account.employee?.profilePhotoKey ?? null);
    }

    return this.getMyMessagingProfile(user);
  }

  async removeMyMessagingProfilePhoto(user: AuthenticatedUser) {
    const viewer = await this.getMessagingViewer(user);

    const account = await this.prisma.account.findUnique({
      where: {
        id: viewer.accountId,
      },
      select: {
        id: true,
        employeeId: true,
        profilePhotoKey: true,
        employee: {
          select: {
            profilePhotoKey: true,
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Profile was not found.');
    }

    // Removing a photo clears only display profile fields, never official identity data.
    await this.prisma.$transaction(async (transaction) => {
      await transaction.account.update({
        where: {
          id: account.id,
        },
        data: {
          profilePhotoKey: null,
        },
      });

      if (account.employeeId) {
        await transaction.employee.update({
          where: {
            id: account.employeeId,
          },
          data: {
            profilePhotoKey: null,
          },
        });
      }
    });

    await this.deleteProfilePhotoIfExists(account.profilePhotoKey ?? null);

    if (account.employee?.profilePhotoKey !== account.profilePhotoKey) {
      await this.deleteProfilePhotoIfExists(account.employee?.profilePhotoKey ?? null);
    }

    return this.getMyMessagingProfile(user);
  }

  async getMessagingProfilePhotoDownload(
    user: AuthenticatedUser,
    accountId: string,
  ) {
    await this.getMessagingViewer(user);

    const account = await this.prisma.account.findUnique({
      where: {
        id: accountId,
      },
      select: messagingAccountSelect,
    });

    if (!account || !this.isVisibleMessagingProfile(account)) {
      throw new NotFoundException('Profile photo was not found.');
    }

    const profilePhotoKey = this.getAccountProfilePhotoKey(account);

    if (!profilePhotoKey) {
      throw new NotFoundException('Profile photo was not found.');
    }

    // Any active messaging user may view another active profile photo, but only through this protected route.
    const absolutePath = this.resolveProfilePhotoPath(profilePhotoKey);

    try {
      await fs.access(absolutePath);
    } catch {
      throw new NotFoundException('Profile photo file was not found in storage.');
    }

    return {
      absolutePath,
      mimeType: this.getPhotoMimeType(profilePhotoKey),
    };
  }

  async getMessagingProfilePhotoByEmployeeDownload(
    user: AuthenticatedUser,
    employeeId: string,
  ) {
    await this.getMessagingViewer(user);

    const account = await this.prisma.account.findFirst({
      where: {
        employeeId,
      },
      select: messagingAccountSelect,
    });

    if (!account || !this.isVisibleMessagingProfile(account)) {
      throw new NotFoundException('Profile photo was not found.');
    }

    return this.getMessagingProfilePhotoDownload(user, account.id);
  }

  async searchMessagingContacts(
    user: AuthenticatedUser,
    query: SearchMessagingContactsQueryDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const search = query.search?.trim() ?? '';

    const andConditions: Prisma.AccountWhereInput[] = [
      {
        id: {
          not: viewer.accountId,
        },
      },
      {
        isEnabled: true,
      },
      {
        OR: [
          {
            role: AccountRole.SUPER_ADMIN,
          },
          {
            employee: {
              is: {
                status: EmployeeStatus.ACTIVE,
                employmentStatus: EmploymentStatus.ACTIVE,
                archivedAt: null,
                isActivated: true,

                division: {
                  is: {
                    isActive: true,
                  },
                },

                OR: [
                  {
                    departmentId: null,
                  },
                  {
                    departmentUnit: {
                      is: {
                        isActive: true,
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    ];

    if (search) {
      andConditions.push({
        OR: [
          {
            username: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            employee: {
              is: {
                OR: [
                  {
                    empId: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    empName: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    designation: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    officialEmail: {
                      contains: search,
                      mode: 'insensitive',
                    },
                  },
                ],
              },
            },
          },
        ],
      });
    }

    const candidates = await this.prisma.account.findMany({
      where: {
        AND: andConditions,
      },

      take: Math.min(query.limit * 3, 100),

      orderBy: [
        {
          username: 'asc',
        },
        {
          id: 'asc',
        },
      ],

      select: messagingAccountSelect,
    });

    const selectedCandidates = candidates
      .filter((account) => this.isActiveEmployeeAccount(account))
      .sort((first, second) => {
        const firstName = this.serializeAccount(first).displayName;
        const secondName = this.serializeAccount(second).displayName;

        return firstName.localeCompare(secondName, undefined, {
          sensitivity: 'base',
        });
      })
      .slice(0, query.limit);

    const participantKeys = selectedCandidates.map((account) =>
      this.buildPrivateParticipantKey(viewer.accountId, account.id),
    );

    const candidateAccountIds = selectedCandidates.map((candidate) => candidate.id);

    const [existingConversations, existingRequests, existingBlocks] = await Promise.all([
      this.prisma.conversation.findMany({
        where: {
          privateParticipantKey: {
            in: participantKeys,
          },
        },

        select: {
          privateParticipantKey: true,
        },
      }),
      this.prisma.messageRequest.findMany({
        where: {
          participantKey: {
            in: participantKeys,
          },
        },

        select: {
          participantKey: true,
          requesterAccountId: true,
          recipientAccountId: true,
          status: true,
          reason: true,
        },
      }),
      this.prisma.messagingAccountBlock.findMany({
        where: {
          OR: [
            {
              blockerAccountId: viewer.accountId,
              blockedAccountId: {
                in: candidateAccountIds,
              },
            },
            {
              blockerAccountId: {
                in: candidateAccountIds,
              },
              blockedAccountId: viewer.accountId,
            },
          ],
        },
        select: {
          blockerAccountId: true,
          blockedAccountId: true,
        },
      }),
    ]);

    const conversationKeys = new Set(
      existingConversations
        .map((conversation) => conversation.privateParticipantKey)
        .filter((key): key is string => Boolean(key)),
    );
    const requestsByKey = new Map(
      existingRequests.map((request) => [request.participantKey, request]),
    );

    const data = selectedCandidates.map((candidate) => {
      const participantKey = this.buildPrivateParticipantKey(
        viewer.accountId,
        candidate.id,
      );
      const request = requestsByKey.get(participantKey);
      const requestReason = this.getMessageRequestReason(viewer, candidate);

      let contactMode:
        | 'DIRECT'
        | 'REQUEST_REQUIRED'
        | 'REQUEST_SENT'
        | 'REQUEST_RECEIVED'
        | 'BLOCKED';

      const blockDirection = this.getBlockDirection(
        viewer.accountId,
        candidate.id,
        existingBlocks,
      );

      if (blockDirection || request?.status === MessageRequestStatus.BLOCKED) {
        contactMode = 'BLOCKED';
      } else if (conversationKeys.has(participantKey)) {
        contactMode = 'DIRECT';
      } else if (request?.status === MessageRequestStatus.PENDING) {
        contactMode =
          request.requesterAccountId === viewer.accountId
            ? 'REQUEST_SENT'
            : 'REQUEST_RECEIVED';
      } else {
        contactMode = requestReason ? 'REQUEST_REQUIRED' : 'DIRECT';
      }

      return {
        ...this.serializeAccount(candidate),
        contactMode,
        requestReason: request?.reason ?? requestReason,
        blockDirection,
      };
    });

    return {
      data,
      filters: {
        search: search || null,
        limit: query.limit,
      },
    };
  }

  async createGroupConversation(
    user: AuthenticatedUser,
    dto: CreateGroupConversationDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const title = dto.title.trim();
    const description = dto.description?.trim() || null;

    if (!title) {
      throw new BadRequestException('Group name cannot be empty.');
    }

    const members = await this.getEligibleGroupAccounts(
      viewer,
      dto.memberAccountIds,
    );
    const participantAccountIds = [
      viewer.accountId,
      ...members.map((member) => member.id),
    ];

    await this.assertNoPersonalGroupBlocks(participantAccountIds);

    const conversationId = await this.prisma.$transaction(
      async (transaction) => {
        const conversation = await transaction.conversation.create({
          data: {
            type: ConversationType.GROUP,
            title,
            description,
            groupKind: GroupKind.PERSONAL,
            createdByAccountId: viewer.accountId,
            participants: {
              create: [
                {
                  accountId: viewer.accountId,
                  role: ConversationParticipantRole.OWNER,
                },
                ...members.map((member) => ({
                  accountId: member.id,
                  role: ConversationParticipantRole.MEMBER,
                })),
              ],
            },
          },
          select: {
            id: true,
          },
        });

        return conversation.id;
      },
    );

    const conversation = await this.getConversationRecord(conversationId);
    const now = new Date();

    this.messagingEventsService.emitConversationUpdated(participantAccountIds, {
      conversationId,
      reason: 'GROUP_CREATED',
      occurredAt: now.toISOString(),
    });

    return {
      message: 'Group created successfully.',
      data: this.serializeConversation(conversation, viewer.accountId, 0),
    };
  }

  async updateGroupConversation(
    user: AuthenticatedUser,
    conversationId: string,
    dto: UpdateGroupConversationDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const access = await this.getActiveGroupAccess(
      viewer.accountId,
      conversationId,
    );

    if (access.conversation.groupKind === GroupKind.OFFICIAL) {
      await this.assertCanManageOfficialGroup(viewer, access.conversation);
    } else {
      this.assertGroupManager(access.viewerParticipant.role);
    }

    if (dto.title === undefined && dto.description === undefined) {
      throw new BadRequestException(
        'Provide a group name or description to update.',
      );
    }

    const title = dto.title?.trim();

    if (dto.title !== undefined && !title) {
      throw new BadRequestException('Group name cannot be empty.');
    }

    const nextDescription =
      dto.description !== undefined
        ? dto.description.trim() || null
        : undefined;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(nextDescription !== undefined
            ? {
                description: nextDescription,
              }
            : {}),
        },
      });

      if (access.conversation.groupKind === GroupKind.OFFICIAL) {
        await transaction.officialGroupAuditLog.create({
          data: {
            conversationId,
            actorAccountId: viewer.accountId,
            action: OfficialGroupAuditAction.DETAILS_UPDATED,
            metadata: {
              previousTitle: access.conversation.title,
              nextTitle: title ?? access.conversation.title,
              previousDescription: access.conversation.description,
              nextDescription:
                nextDescription !== undefined
                  ? nextDescription
                  : access.conversation.description,
            },
          },
        });
      }
    });

    const conversation = await this.getConversationRecord(conversationId);
    const participantAccountIds = access.conversation.participants.map(
      (participant) => participant.accountId,
    );

    this.messagingEventsService.emitConversationUpdated(participantAccountIds, {
      conversationId,
      reason: 'GROUP_UPDATED',
      occurredAt: new Date().toISOString(),
    });

    return {
      message: 'Group details updated successfully.',
      data: this.serializeConversation(conversation, viewer.accountId, 0),
    };
  }


  private async assertCanUpdateGroupPhoto(
    viewer: MessagingViewer,
    access: {
      conversation: {
        groupKind: GroupKind | null;
        officialScopeType: OfficialGroupScopeType | null;
        officialDivisionId: string | null;
        officialDepartmentId: string | null;
      };
      viewerParticipant: {
        role: ConversationParticipantRole;
      };
    },
  ): Promise<void> {
    if (access.conversation.groupKind === GroupKind.OFFICIAL) {
      await this.assertCanManageOfficialGroup(viewer, access.conversation);
      return;
    }

    this.assertGroupManager(access.viewerParticipant.role);
  }

  async updateGroupPhoto(
    user: AuthenticatedUser,
    conversationId: string,
    file?: UploadedMessageAttachmentFile,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const access = await this.getActiveGroupAccess(
      viewer.accountId,
      conversationId,
    );

    await this.assertCanUpdateGroupPhoto(viewer, access);

    const photo = this.validateGroupPhoto(file);
    const storageKey = `${conversationId}/${randomUUID()}-${photo.originalFileName}`;

    await this.writeGroupPhotoFile(storageKey, file as UploadedMessageAttachmentFile);

    await this.prisma.conversation.update({
      where: {
        id: conversationId,
      },
      data: {
        groupPhotoKey: storageKey,
      },
    });

    await this.deleteGroupPhotoIfExists(access.conversation.groupPhotoKey ?? null);

    const conversation = await this.getConversationRecord(conversationId);
    const participantAccountIds = access.conversation.participants.map(
      (participant) => participant.accountId,
    );

    this.messagingEventsService.emitConversationUpdated(participantAccountIds, {
      conversationId,
      reason: 'GROUP_UPDATED',
      occurredAt: new Date().toISOString(),
    });

    return {
      message: 'Group photo updated successfully.',
      data: this.serializeConversation(conversation, viewer.accountId, 0),
    };
  }

  async removeGroupPhoto(
    user: AuthenticatedUser,
    conversationId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const access = await this.getActiveGroupAccess(
      viewer.accountId,
      conversationId,
    );

    await this.assertCanUpdateGroupPhoto(viewer, access);

    await this.prisma.conversation.update({
      where: {
        id: conversationId,
      },
      data: {
        groupPhotoKey: null,
      },
    });

    await this.deleteGroupPhotoIfExists(access.conversation.groupPhotoKey ?? null);

    const conversation = await this.getConversationRecord(conversationId);
    const participantAccountIds = access.conversation.participants.map(
      (participant) => participant.accountId,
    );

    this.messagingEventsService.emitConversationUpdated(participantAccountIds, {
      conversationId,
      reason: 'GROUP_UPDATED',
      occurredAt: new Date().toISOString(),
    });

    return {
      message: 'Group photo removed successfully.',
      data: this.serializeConversation(conversation, viewer.accountId, 0),
    };
  }

  async getGroupPhotoDownload(
    user: AuthenticatedUser,
    conversationId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        type: ConversationType.GROUP,
        participants: {
          some: {
            accountId: viewer.accountId,
            leftAt: null,
          },
        },
      },
      select: {
        groupPhotoKey: true,
      },
    });

    if (!conversation?.groupPhotoKey) {
      throw new NotFoundException('Group photo was not found.');
    }

    const absolutePath = this.resolveGroupPhotoPath(conversation.groupPhotoKey);

    try {
      await fs.access(absolutePath);
    } catch {
      throw new NotFoundException('Group photo file was not found in storage.');
    }

    return {
      absolutePath,
      mimeType: this.getPhotoMimeType(conversation.groupPhotoKey),
    };
  }

  async addGroupMembers(
    user: AuthenticatedUser,
    conversationId: string,
    dto: AddGroupMembersDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const access = await this.getActiveGroupAccess(
      viewer.accountId,
      conversationId,
    );

    if (access.conversation.groupKind === GroupKind.OFFICIAL) {
      throw new ForbiddenException(
        'Official group membership is synchronized from organizational assignments.',
      );
    }

    this.assertGroupManager(access.viewerParticipant.role);

    const activeAccountIds = new Set(
      access.conversation.participants.map(
        (participant) => participant.accountId,
      ),
    );
    const requestedAccountIds = [...new Set(dto.memberAccountIds)].filter(
      (accountId) => !activeAccountIds.has(accountId),
    );

    if (requestedAccountIds.length === 0) {
      const conversation = await this.getConversationRecord(conversationId);

      return {
        message: 'The selected accounts are already group members.',
        addedCount: 0,
        data: this.serializeConversation(conversation, viewer.accountId, 0),
      };
    }

    if (
      access.conversation.participants.length + requestedAccountIds.length >
      100
    ) {
      throw new BadRequestException(
        'A personal group can contain at most 100 active members.',
      );
    }

    const members = await this.getEligibleGroupAccounts(
      viewer,
      requestedAccountIds,
    );

    await this.assertNoPersonalGroupBlocks([
      ...access.conversation.participants.map((participant) => participant.accountId),
      ...members.map((member) => member.id),
    ]);

    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      for (const member of members) {
        await transaction.conversationParticipant.upsert({
          where: {
            conversationId_accountId: {
              conversationId,
              accountId: member.id,
            },
          },
          update: {
            joinedAt: now,
            leftAt: null,
            role: ConversationParticipantRole.MEMBER,
            isArchived: false,
          },
          create: {
            conversationId,
            accountId: member.id,
            joinedAt: now,
            role: ConversationParticipantRole.MEMBER,
          },
        });
      }

      await transaction.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          updatedAt: now,
        },
      });
    });

    const conversation = await this.getConversationRecord(conversationId);
    const participantAccountIds = [
      ...access.conversation.participants.map(
        (participant) => participant.accountId,
      ),
      ...members.map((member) => member.id),
    ];

    this.messagingEventsService.emitConversationUpdated(participantAccountIds, {
      conversationId,
      reason: 'MEMBERS_CHANGED',
      occurredAt: now.toISOString(),
    });

    return {
      message: `${members.length} member${members.length === 1 ? '' : 's'} added successfully.`,
      addedCount: members.length,
      data: this.serializeConversation(conversation, viewer.accountId, 0),
    };
  }

  async updateGroupMemberRole(
    user: AuthenticatedUser,
    conversationId: string,
    accountId: string,
    dto: UpdateGroupMemberRoleDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const access = await this.getActiveGroupAccess(
      viewer.accountId,
      conversationId,
    );

    if (access.conversation.groupKind === GroupKind.OFFICIAL) {
      throw new ForbiddenException(
        'Official group roles are synchronized from organizational assignments.',
      );
    }

    if (access.viewerParticipant.role !== ConversationParticipantRole.OWNER) {
      throw new ForbiddenException(
        'Only the group owner can change administrator roles.',
      );
    }

    const target = access.conversation.participants.find(
      (participant) => participant.accountId === accountId,
    );

    if (!target) {
      throw new NotFoundException('Group member was not found.');
    }

    if (target.role === ConversationParticipantRole.OWNER) {
      throw new ForbiddenException(
        'The group owner role cannot be changed here.',
      );
    }

    const role =
      dto.role === 'ADMIN'
        ? ConversationParticipantRole.ADMIN
        : ConversationParticipantRole.MEMBER;

    await this.prisma.$transaction([
      this.prisma.conversationParticipant.update({
        where: {
          conversationId_accountId: {
            conversationId,
            accountId,
          },
        },
        data: {
          role,
        },
      }),
      this.prisma.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          updatedAt: new Date(),
        },
      }),
    ]);

    const conversation = await this.getConversationRecord(conversationId);
    const participantAccountIds = access.conversation.participants.map(
      (participant) => participant.accountId,
    );

    this.messagingEventsService.emitConversationUpdated(participantAccountIds, {
      conversationId,
      reason: 'MEMBERS_CHANGED',
      occurredAt: new Date().toISOString(),
    });

    return {
      message:
        role === ConversationParticipantRole.ADMIN
          ? 'Member promoted to group administrator.'
          : 'Group administrator changed to member.',
      data: this.serializeConversation(conversation, viewer.accountId, 0),
    };
  }

  async removeGroupMember(
    user: AuthenticatedUser,
    conversationId: string,
    accountId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const access = await this.getActiveGroupAccess(
      viewer.accountId,
      conversationId,
    );

    if (access.conversation.groupKind === GroupKind.OFFICIAL) {
      throw new ForbiddenException(
        'Official group membership is synchronized from organizational assignments.',
      );
    }

    this.assertGroupManager(access.viewerParticipant.role);

    if (accountId === viewer.accountId) {
      throw new BadRequestException(
        'Use the leave-group action to remove your own account.',
      );
    }

    const target = access.conversation.participants.find(
      (participant) => participant.accountId === accountId,
    );

    if (!target) {
      throw new NotFoundException('Group member was not found.');
    }

    if (target.role === ConversationParticipantRole.OWNER) {
      throw new ForbiddenException('The group owner cannot be removed.');
    }

    if (
      access.viewerParticipant.role === ConversationParticipantRole.ADMIN &&
      target.role === ConversationParticipantRole.ADMIN
    ) {
      throw new ForbiddenException(
        'Only the group owner can remove another administrator.',
      );
    }

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.conversationParticipant.update({
        where: {
          conversationId_accountId: {
            conversationId,
            accountId,
          },
        },
        data: {
          leftAt: now,
          role: ConversationParticipantRole.MEMBER,
          isArchived: true,
        },
      }),
      this.prisma.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          updatedAt: now,
        },
      }),
    ]);

    const participantAccountIds = access.conversation.participants.map(
      (participant) => participant.accountId,
    );

    this.messagingEventsService.emitConversationUpdated(participantAccountIds, {
      conversationId,
      reason: 'MEMBERS_CHANGED',
      occurredAt: now.toISOString(),
    });

    return {
      message: 'Member removed from the group.',
      conversationId,
      accountId,
      removedAt: now,
    };
  }

  async leaveGroupConversation(
    user: AuthenticatedUser,
    conversationId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const access = await this.getActiveGroupAccess(
      viewer.accountId,
      conversationId,
    );
    if (access.conversation.groupKind === GroupKind.OFFICIAL) {
      throw new ForbiddenException(
        'Official group membership is controlled by organizational assignments and cannot be left manually.',
      );
    }

    const now = new Date();
    let newOwnerAccountId: string | null = null;

    if (access.viewerParticipant.role === ConversationParticipantRole.OWNER) {
      const successor =
        access.conversation.participants.find(
          (participant) =>
            participant.accountId !== viewer.accountId &&
            participant.role === ConversationParticipantRole.ADMIN,
        ) ??
        access.conversation.participants.find(
          (participant) => participant.accountId !== viewer.accountId,
        );

      if (!successor) {
        throw new ConflictException(
          'The only remaining group member cannot leave the group.',
        );
      }

      newOwnerAccountId = successor.accountId;

      await this.prisma.$transaction(async (transaction) => {
        await transaction.conversationParticipant.update({
          where: {
            conversationId_accountId: {
              conversationId,
              accountId: viewer.accountId,
            },
          },
          data: {
            leftAt: now,
            role: ConversationParticipantRole.MEMBER,
            isArchived: true,
          },
        });

        await transaction.conversationParticipant.update({
          where: {
            conversationId_accountId: {
              conversationId,
              accountId: successor.accountId,
            },
          },
          data: {
            role: ConversationParticipantRole.OWNER,
          },
        });

        await transaction.conversation.update({
          where: {
            id: conversationId,
          },
          data: {
            updatedAt: now,
          },
        });
      });
    } else {
      await this.prisma.$transaction([
        this.prisma.conversationParticipant.update({
          where: {
            conversationId_accountId: {
              conversationId,
              accountId: viewer.accountId,
            },
          },
          data: {
            leftAt: now,
            role: ConversationParticipantRole.MEMBER,
            isArchived: true,
          },
        }),
        this.prisma.conversation.update({
          where: {
            id: conversationId,
          },
          data: {
            updatedAt: now,
          },
        }),
      ]);
    }

    this.messagingEventsService.emitConversationUpdated(
      access.conversation.participants.map(
        (participant) => participant.accountId,
      ),
      {
        conversationId,
        reason: 'LEFT',
        occurredAt: now.toISOString(),
      },
    );

    return {
      message: 'You left the group.',
      conversationId,
      leftAt: now,
      newOwnerAccountId,
    };
  }

  async createPrivateConversation(
    user: AuthenticatedUser,
    dto: CreatePrivateConversationDto,
  ) {
    const viewer = await this.getMessagingViewer(user);

    if (dto.participantAccountId === viewer.accountId) {
      throw new BadRequestException(
        'You cannot start a private conversation with yourself.',
      );
    }

    const target = await this.prisma.account.findUnique({
      where: {
        id: dto.participantAccountId,
      },

      select: messagingAccountSelect,
    });

    if (!target || !target.isEnabled || !this.isActiveEmployeeAccount(target)) {
      throw new NotFoundException(
        'The selected messaging account was not found.',
      );
    }

    const privateParticipantKey = this.buildPrivateParticipantKey(
      viewer.accountId,
      target.id,
    );

    await this.assertNoPersonalBlock(
      viewer.accountId,
      target.id,
      'start a private conversation',
    );

    const existingConversation = await this.prisma.conversation.findUnique({
      where: {
        privateParticipantKey,
      },

      select: {
        id: true,
      },
    });

    if (existingConversation) {
      const opened = await this.openPrivateConversation(
        viewer,
        target,
        privateParticipantKey,
      );

      return {
        outcome: 'CONVERSATION' as const,
        message: 'Private conversation reopened successfully.',
        created: false,
        data: opened.data,
        request: null,
      };
    }

    const existingRequest = await this.prisma.messageRequest.findUnique({
      where: {
        participantKey: privateParticipantKey,
      },

      select: messageRequestSelect,
    });

    if (existingRequest?.status === MessageRequestStatus.BLOCKED) {
      throw new ForbiddenException(
        'Private contact is blocked for this account.',
      );
    }

    if (existingRequest?.status === MessageRequestStatus.PENDING) {
      return {
        outcome: 'REQUEST' as const,
        message:
          existingRequest.requesterAccountId === viewer.accountId
            ? 'Your message request is still pending.'
            : 'This account already sent you a message request. Review it before starting a conversation.',
        created: false,
        data: null,
        request: this.serializeMessageRequest(
          existingRequest,
          viewer.accountId,
        ),
      };
    }

    const requestReason = this.getMessageRequestReason(viewer, target);
    const viewerPreviouslyDeclined =
      existingRequest?.status === MessageRequestStatus.DECLINED &&
      existingRequest.recipientAccountId === viewer.accountId;

    if (
      requestReason === null ||
      viewerPreviouslyDeclined ||
      existingRequest?.status === MessageRequestStatus.ACCEPTED
    ) {
      const opened = await this.openPrivateConversation(
        viewer,
        target,
        privateParticipantKey,
        existingRequest
          ? {
              messageRequestId: existingRequest.id,
              createdByAccountId: existingRequest.requesterAccountId,
            }
          : undefined,
      );

      if (existingRequest) {
        this.messagingEventsService.emitMessageRequestUpdated(
          [viewer.accountId, target.id],
          {
            requestId: existingRequest.id,
            status: 'ACCEPTED',
            conversationId: opened.conversationId,
            occurredAt: new Date().toISOString(),
          },
        );
      }

      return {
        outcome: 'CONVERSATION' as const,
        message: opened.created
          ? 'Private conversation created successfully.'
          : 'Private conversation reopened successfully.',
        created: opened.created,
        data: opened.data,
        request: null,
      };
    }

    if (
      existingRequest?.status === MessageRequestStatus.DECLINED &&
      existingRequest.requesterAccountId === viewer.accountId &&
      existingRequest.respondedAt
    ) {
      const availableAt = new Date(
        existingRequest.respondedAt.getTime() + MESSAGE_REQUEST_COOLDOWN_MS,
      );

      if (availableAt.getTime() > Date.now()) {
        throw new ForbiddenException(
          `This request was declined. You can try again after ${availableAt.toISOString()}.`,
        );
      }
    }

    const now = new Date();
    const request = await this.prisma.messageRequest.upsert({
      where: {
        participantKey: privateParticipantKey,
      },

      create: {
        participantKey: privateParticipantKey,
        requesterAccountId: viewer.accountId,
        recipientAccountId: target.id,
        status: MessageRequestStatus.PENDING,
        reason: requestReason,
        requestedAt: now,
      },

      update: {
        requesterAccountId: viewer.accountId,
        recipientAccountId: target.id,
        blockedByAccountId: null,
        conversationId: null,
        status: MessageRequestStatus.PENDING,
        reason: requestReason,
        requestCount: {
          increment: 1,
        },
        requestedAt: now,
        respondedAt: null,
      },

      select: messageRequestSelect,
    });

    this.messagingEventsService.emitMessageRequestUpdated(
      [viewer.accountId, target.id],
      {
        requestId: request.id,
        status: 'PENDING',
        conversationId: null,
        occurredAt: now.toISOString(),
      },
    );

    return {
      outcome: 'REQUEST' as const,
      message: existingRequest
        ? 'Message request sent again.'
        : 'Message request sent successfully.',
      created: true,
      data: null,
      request: this.serializeMessageRequest(request, viewer.accountId),
    };
  }

  async listMessageRequests(user: AuthenticatedUser) {
    const viewer = await this.getMessagingViewer(user);

    const requests = await this.prisma.messageRequest.findMany({
      where: {
        status: MessageRequestStatus.PENDING,
        OR: [
          {
            requesterAccountId: viewer.accountId,
          },
          {
            recipientAccountId: viewer.accountId,
          },
        ],
      },

      orderBy: [
        {
          requestedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],

      select: messageRequestSelect,
    });

    const serialized = requests.map((request) =>
      this.serializeMessageRequest(request, viewer.accountId),
    );
    const received = serialized.filter(
      (request) => request.direction === 'RECEIVED',
    );
    const sent = serialized.filter((request) => request.direction === 'SENT');

    return {
      received,
      sent,
      counts: {
        receivedPending: received.length,
        sentPending: sent.length,
      },
    };
  }

  async acceptMessageRequest(user: AuthenticatedUser, requestId: string) {
    const viewer = await this.getMessagingViewer(user);
    const request = await this.prisma.messageRequest.findUnique({
      where: {
        id: requestId,
      },

      select: messageRequestSelect,
    });

    if (!request || request.recipientAccountId !== viewer.accountId) {
      throw new NotFoundException('Message request was not found.');
    }

    if (
      request.status === MessageRequestStatus.ACCEPTED &&
      request.conversationId
    ) {
      const conversation = await this.getConversationRecord(
        request.conversationId,
      );

      return {
        message: 'Message request was already accepted.',
        data: this.serializeConversation(conversation, viewer.accountId, 0),
        request: this.serializeMessageRequest(request, viewer.accountId),
      };
    }

    if (request.status !== MessageRequestStatus.PENDING) {
      throw new ConflictException(
        'Only a pending message request can be accepted.',
      );
    }

    if (
      !request.requester.isEnabled ||
      !this.isActiveEmployeeAccount(request.requester)
    ) {
      throw new NotFoundException(
        'The requesting account is no longer available.',
      );
    }

    await this.assertNoPersonalBlock(
      viewer.accountId,
      request.requesterAccountId,
      'accept this private message request',
    );

    const opened = await this.openPrivateConversation(
      viewer,
      request.requester,
      request.participantKey,
      {
        messageRequestId: request.id,
        createdByAccountId: request.requesterAccountId,
      },
    );
    const updatedRequest = await this.prisma.messageRequest.findUniqueOrThrow({
      where: {
        id: request.id,
      },

      select: messageRequestSelect,
    });

    this.messagingEventsService.emitMessageRequestUpdated(
      [request.requesterAccountId, request.recipientAccountId],
      {
        requestId: request.id,
        status: 'ACCEPTED',
        conversationId: opened.conversationId,
        occurredAt: new Date().toISOString(),
      },
    );

    return {
      message: 'Message request accepted.',
      data: opened.data,
      request: this.serializeMessageRequest(updatedRequest, viewer.accountId),
    };
  }

  async declineMessageRequest(user: AuthenticatedUser, requestId: string) {
    const viewer = await this.getMessagingViewer(user);
    const request = await this.prisma.messageRequest.findUnique({
      where: {
        id: requestId,
      },

      select: messageRequestSelect,
    });

    if (!request || request.recipientAccountId !== viewer.accountId) {
      throw new NotFoundException('Message request was not found.');
    }

    if (request.status !== MessageRequestStatus.PENDING) {
      throw new ConflictException(
        'Only a pending message request can be declined.',
      );
    }

    const now = new Date();
    const updatedRequest = await this.prisma.messageRequest.update({
      where: {
        id: request.id,
      },

      data: {
        status: MessageRequestStatus.DECLINED,
        respondedAt: now,
        blockedByAccountId: null,
      },

      select: messageRequestSelect,
    });

    this.messagingEventsService.emitMessageRequestUpdated(
      [request.requesterAccountId, request.recipientAccountId],
      {
        requestId: request.id,
        status: 'DECLINED',
        conversationId: null,
        occurredAt: now.toISOString(),
      },
    );

    return {
      message: 'Message request declined.',
      request: this.serializeMessageRequest(updatedRequest, viewer.accountId),
    };
  }

  async blockMessageRequest(user: AuthenticatedUser, requestId: string) {
    const viewer = await this.getMessagingViewer(user);
    const request = await this.prisma.messageRequest.findUnique({
      where: {
        id: requestId,
      },

      select: messageRequestSelect,
    });

    if (!request || request.recipientAccountId !== viewer.accountId) {
      throw new NotFoundException('Message request was not found.');
    }

    if (request.status !== MessageRequestStatus.PENDING) {
      throw new ConflictException(
        'Only a pending message request can be blocked.',
      );
    }

    this.assertCanBlockAccount(viewer, request.requester);

    const now = new Date();
    const updatedRequest = await this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.messageRequest.update({
        where: {
          id: request.id,
        },

        data: {
          status: MessageRequestStatus.BLOCKED,
          respondedAt: now,
          blockedByAccountId: viewer.accountId,
        },

        select: messageRequestSelect,
      });

      await transaction.messagingAccountBlock.upsert({
        where: {
          blockerAccountId_blockedAccountId: {
            blockerAccountId: viewer.accountId,
            blockedAccountId: request.requesterAccountId,
          },
        },
        create: {
          blockerAccountId: viewer.accountId,
          blockedAccountId: request.requesterAccountId,
        },
        update: {},
      });

      await transaction.conversationParticipant.updateMany({
        where: {
          accountId: viewer.accountId,
          conversation: {
            privateParticipantKey: request.participantKey,
          },
        },
        data: {
          isArchived: true,
          isMuted: true,
        },
      });

      return updated;
    });

    this.messagingEventsService.emitMessageRequestUpdated(
      [request.requesterAccountId, request.recipientAccountId],
      {
        requestId: request.id,
        status: 'BLOCKED',
        conversationId: null,
        occurredAt: now.toISOString(),
      },
    );

    return {
      message: 'Message request blocked.',
      request: this.serializeMessageRequest(updatedRequest, viewer.accountId),
    };
  }

  async listConversations(
    user: AuthenticatedUser,
    query: ListConversationsQueryDto,
  ) {
    const viewer = await this.getMessagingViewer(user);

    await this.synchronizeOfficialGroupsForAccountSafely(
      viewer.accountId,
      viewer.accountId,
      'MESSAGING_ACCESS',
    );

    const take = query.limit + 1;
    const archivedFilter =
      query.view === 'ALL'
        ? {}
        : {
            isArchived: query.view === 'ARCHIVED',
          };

    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            accountId: viewer.accountId,
            leftAt: null,
            ...archivedFilter,
          },
        },
      },

      orderBy: [
        {
          updatedAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],

      take,

      ...(query.cursor
        ? {
            cursor: {
              id: query.cursor,
            },
            skip: 1,
          }
        : {}),

      select: conversationSelect,
    });

    const sortedConversations = [...conversations].sort((first, second) => {
      const firstParticipant = first.participants.find(
        (participant) => participant.accountId === viewer.accountId,
      );
      const secondParticipant = second.participants.find(
        (participant) => participant.accountId === viewer.accountId,
      );

      if ((firstParticipant?.isPinned ?? false) !== (secondParticipant?.isPinned ?? false)) {
        return firstParticipant?.isPinned ? -1 : 1;
      }

      return new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
    });

    const hasMore = sortedConversations.length > query.limit;
    const page = hasMore
      ? sortedConversations.slice(0, query.limit)
      : sortedConversations;

    const conversationIds = page.map((conversation) => conversation.id);

    await this.markReceiptsDelivered(viewer.accountId, conversationIds);

    const [unreadCounts, visibleLastMessages] = await Promise.all([
      Promise.all(
        page.map((conversation) => {
          const joinedAt = conversation.participants.find(
            (participant) => participant.accountId === viewer.accountId,
          )?.joinedAt;

          return this.prisma.messageReceipt.count({
            where: {
              accountId: viewer.accountId,
              readAt: null,

              message: {
                is: {
                  conversationId: conversation.id,
                  deletedAt: null,
                  ...(joinedAt
                    ? {
                        sentAt: {
                          gte: joinedAt,
                        },
                      }
                    : {}),
                  hiddenForAccounts: {
                    none: {
                      accountId: viewer.accountId,
                    },
                  },
                },
              },
            },
          });
        }),
      ),
      Promise.all(
        page.map((conversation) => {
          const joinedAt = conversation.participants.find(
            (participant) => participant.accountId === viewer.accountId,
          )?.joinedAt;

          return this.prisma.message.findFirst({
            where: {
              conversationId: conversation.id,
              ...(joinedAt
                ? {
                    sentAt: {
                      gte: joinedAt,
                    },
                  }
                : {}),
              hiddenForAccounts: {
                none: {
                  accountId: viewer.accountId,
                },
              },
            },
            orderBy: [
              {
                sentAt: 'desc',
              },
              {
                id: 'desc',
              },
            ],
            select: messageSelect,
          });
        }),
      ),
    ]);

    return {
      data: page.map((conversation, index) => {
        const visibleLastMessage = visibleLastMessages[index];

        return this.serializeConversation(
          {
            ...conversation,
            messages: visibleLastMessage ? [visibleLastMessage] : [],
          },
          viewer.accountId,
          unreadCounts[index] ?? 0,
        );
      }),
      pagination: {
        limit: query.limit,
        hasMore,
        nextCursor:
          hasMore && page.length > 0 ? page[page.length - 1].id : null,
      },
    };
  }

  async listMessages(
    user: AuthenticatedUser,
    conversationId: string,
    query: ListMessagesQueryDto,
  ) {
    const viewer = await this.getMessagingViewer(user);

    const viewerParticipant = await this.assertActiveParticipant(
      viewer.accountId,
      conversationId,
    );

    await this.markReceiptsDelivered(viewer.accountId, [conversationId]);

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        sentAt: {
          gte: viewerParticipant.joinedAt,
        },
        hiddenForAccounts: {
          none: {
            accountId: viewer.accountId,
          },
        },
      },

      orderBy: [
        {
          sentAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],

      take: query.limit + 1,

      ...(query.cursor
        ? {
            cursor: {
              id: query.cursor,
            },
            skip: 1,
          }
        : {}),

      select: messageSelect,
    });

    const hasMore = messages.length > query.limit;
    const pageDescending = hasMore ? messages.slice(0, query.limit) : messages;
    const nextCursor =
      hasMore && pageDescending.length > 0
        ? pageDescending[pageDescending.length - 1].id
        : null;

    return {
      data: [...pageDescending]
        .reverse()
        .map((message) => this.serializeMessage(message, viewer.accountId)),
      pagination: {
        limit: query.limit,
        hasMore,
        nextCursor,
      },
    };
  }

  async getMessageInformation(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const participant = await this.assertActiveParticipant(
      viewer.accountId,
      conversationId,
    );

    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        sentAt: {
          gte: participant.joinedAt,
        },
        hiddenForAccounts: {
          none: {
            accountId: viewer.accountId,
          },
        },
      },

      select: messageInformationSelect,
    });

    if (!message) {
      throw new NotFoundException('Message was not found.');
    }

    if (message.senderAccountId !== viewer.accountId) {
      throw new ForbiddenException('Only the sender can view message information.');
    }

    return {
      data: this.serializeMessageInformation(message, viewer.accountId),
    };
  }

  private getNotificationTypeForMessage(
    message: MessageRecord,
  ): MessagingNotificationType {
    if (message.replyToMessageId) {
      return MessagingNotificationType.REPLY;
    }

    if (message.contentType === MessageContentType.IMAGE) {
      return MessagingNotificationType.IMAGE;
    }

    if (message.contentType === MessageContentType.VIDEO) {
      return MessagingNotificationType.VIDEO;
    }

    if (message.contentType === MessageContentType.AUDIO) {
      const payload = this.getPlainMessagePayload(message.payload);

      return payload.attachmentKind === 'VOICE_NOTE'
        ? MessagingNotificationType.VOICE_NOTE
        : MessagingNotificationType.AUDIO;
    }

    if (message.contentType === MessageContentType.FILE) {
      return MessagingNotificationType.FILE;
    }

    return MessagingNotificationType.MESSAGE;
  }

  private buildNotificationBody(message: MessageRecord): string {
    if (message.textContent) {
      return message.textContent.length > 140
        ? `${message.textContent.slice(0, 137)}...`
        : message.textContent;
    }

    const attachment = message.attachments[0];

    if (attachment) {
      return attachment.originalFileName;
    }

    return 'New message';
  }

  private async createAndEmitMessageNotifications(
    input: MessageNotificationInput,
  ): Promise<void> {
    const notificationType =
      input.notificationType ?? this.getNotificationTypeForMessage(input.message);
    const actor = this.serializeAccount(input.message.sender);
    const mentionedAccountIds = new Set(
      input.mentionedAccountIds ??
        this.getPayloadMentions(input.message.payload).map((mention) => mention.accountId),
    );
    const recipients = input.participants.filter(
      (participant) =>
        participant.accountId !== input.message.senderAccountId &&
        !this.isMuteActive({
          isMuted: participant.isMuted ?? false,
          mutedUntil: participant.mutedUntil ?? null,
        }),
    );

    if (recipients.length === 0) {
      return;
    }

    const unreadCounts = new Map<string, number>();

    for (const recipient of recipients) {
      const recipientNotificationType = mentionedAccountIds.has(recipient.accountId)
        ? MessagingNotificationType.MENTION
        : notificationType;

      // Muted conversations keep unread receipts but suppress active notification rows.
      const notification = await this.prisma.messagingNotification.create({
        data: {
          recipientAccountId: recipient.accountId,
          actorAccountId: input.message.senderAccountId,
          conversationId: input.message.conversationId,
          messageId: input.message.id,
          type: recipientNotificationType,
          title:
            recipientNotificationType === MessagingNotificationType.MENTION
              ? `${actor.displayName} mentioned you`
              : recipientNotificationType === MessagingNotificationType.REPLY
                ? `${actor.displayName} replied`
                : `${actor.displayName} sent a message`,
          body: this.buildNotificationBody(input.message),
          metadata: {
            contentType: input.message.contentType,
            replyToMessageId: input.message.replyToMessageId,
            mentionedAccountIds: [...mentionedAccountIds],
          },
        },
        select: messagingNotificationSelect,
      });

      const unreadCount =
        unreadCounts.get(recipient.accountId) ??
        (await this.prisma.messagingNotification.count({
          where: {
            recipientAccountId: recipient.accountId,
            isRead: false,
          },
        }));
      unreadCounts.set(recipient.accountId, unreadCount);

      this.messagingEventsService.emitNotificationCreated(recipient.accountId, {
        notification: this.serializeNotification(notification),
        unreadCount,
        occurredAt: new Date().toISOString(),
      });
    }
  }

  private async createAndEmitReactionNotification(
    actorAccountId: string,
    conversationId: string,
    message: MessageRecord,
    reactionValue: string | null,
  ): Promise<void> {
    if (!reactionValue || message.senderAccountId === actorAccountId) {
      return;
    }

    const recipient = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId,
        accountId: message.senderAccountId,
        leftAt: null,
        isMuted: false,
      },
      select: {
        accountId: true,
      },
    });

    if (!recipient) {
      return;
    }

    const actorAccount = await this.prisma.account.findUnique({
      where: {
        id: actorAccountId,
      },
      select: messagingAccountSelect,
    });

    if (!actorAccount) {
      return;
    }

    const actor = this.serializeAccount(actorAccount);
    // Reaction notifications are sent only to the original sender, never to all participants.
    const notification = await this.prisma.messagingNotification.create({
      data: {
        recipientAccountId: message.senderAccountId,
        actorAccountId,
        conversationId,
        messageId: message.id,
        type: MessagingNotificationType.REACTION,
        title: `${actor.displayName} reacted ${reactionValue}`,
        body: this.buildNotificationBody(message),
        metadata: {
          reactionValue,
        },
      },
      select: messagingNotificationSelect,
    });

    const unreadCount = await this.prisma.messagingNotification.count({
      where: {
        recipientAccountId: message.senderAccountId,
        isRead: false,
      },
    });

    this.messagingEventsService.emitNotificationCreated(message.senderAccountId, {
      notification: this.serializeNotification(notification),
      unreadCount,
      occurredAt: new Date().toISOString(),
    });
  }

  async sendTextMessage(
    user: AuthenticatedUser,
    conversationId: string,
    dto: SendTextMessageDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const textContent = dto.text.trim();

    if (!textContent) {
      throw new BadRequestException('Message text cannot be empty.');
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,

        participants: {
          some: {
            accountId: viewer.accountId,
            leftAt: null,
          },
        },
      },

      select: {
        id: true,
        type: true,
        groupKind: true,

        participants: {
          where: {
            leftAt: null,
          },

          select: {
            accountId: true,
            isMuted: true,
            mutedUntil: true,
            account: {
              select: messagingAccountSelect,
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation was not found.');
    }

    if (
      conversation.type === ConversationType.PRIVATE &&
      conversation.participants.length !== 2
    ) {
      throw new ConflictException(
        'The private conversation does not have exactly two active participants.',
      );
    }

    if (conversation.type === ConversationType.PRIVATE) {
      const recipient = conversation.participants.find(
        (participant) => participant.accountId !== viewer.accountId,
      );

      if (recipient) {
        await this.assertNoPersonalBlock(
          viewer.accountId,
          recipient.accountId,
          'send a private message',
        );
      }
    }

    const existingMessage = await this.prisma.message.findUnique({
      where: {
        senderAccountId_clientMessageId: {
          senderAccountId: viewer.accountId,
          clientMessageId: dto.clientMessageId,
        },
      },

      select: messageSelect,
    });

    if (existingMessage) {
      if (existingMessage.conversationId !== conversationId) {
        throw new ConflictException(
          'This client message ID was already used in another conversation.',
        );
      }

      return {
        message: 'Message was already accepted.',
        duplicate: true,
        data: this.serializeMessage(existingMessage),
      };
    }

    if (dto.replyToMessageId) {
      const replyTarget = await this.prisma.message.findFirst({
        where: {
          id: dto.replyToMessageId,
          conversationId,
          deletedAt: null,
          hiddenForAccounts: {
            none: {
              accountId: viewer.accountId,
            },
          },
        },

        select: {
          id: true,
        },
      });

      if (!replyTarget) {
        throw new BadRequestException(
          'The message selected for reply was not found in this conversation.',
        );
      }
    }

    const mentions = conversation.type === ConversationType.GROUP
      ? this.resolveTextMentions(
          textContent,
          dto.mentionedAccountIds,
          conversation.participants,
          viewer.accountId,
        )
      : [];

    const recipientAccountIds = conversation.participants
      .map((participant) => participant.accountId)
      .filter((accountId) => accountId !== viewer.accountId);

    try {
      const createdMessage = await this.prisma.$transaction(
        async (transaction) => {
          const created = await transaction.message.create({
            data: {
              conversationId,
              senderAccountId: viewer.accountId,
              clientMessageId: dto.clientMessageId,
              contentType: MessageContentType.TEXT,
              textContent,
              replyToMessageId: dto.replyToMessageId ?? null,
              payload: this.buildTextMessagePayload(mentions),

              receipts: {
                create: recipientAccountIds.map((accountId) => ({
                  accountId,
                })),
              },
            },

            select: {
              id: true,
              sentAt: true,
            },
          });

          await transaction.conversation.update({
            where: {
              id: conversationId,
            },

            data: {
              lastMessageAt: created.sentAt,
            },
          });

          await transaction.conversationParticipant.updateMany({
            where: {
              conversationId,
              accountId: {
                in: conversation.participants.map(
                  (participant) => participant.accountId,
                ),
              },
            },

            data: {
              isArchived: false,
            },
          });

          return transaction.message.findUniqueOrThrow({
            where: {
              id: created.id,
            },

            select: messageSelect,
          });
        },
      );

      const serializedMessage = this.serializeMessage(createdMessage);
      const participantAccountIds = conversation.participants.map(
        (participant) => participant.accountId,
      );

      this.messagingEventsService.emitMessageCreated(participantAccountIds, {
        conversationId,
        message: serializedMessage,
        occurredAt: new Date().toISOString(),
      });

      await this.createAndEmitMessageNotifications({
        message: createdMessage,
        participants: conversation.participants,
        mentionedAccountIds: mentions.map((mention) => mention.accountId),
      });

      return {
        message: 'Message sent successfully.',
        duplicate: false,
        data: serializedMessage,
      };
    } catch (error) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const duplicateMessage = await this.prisma.message.findUnique({
        where: {
          senderAccountId_clientMessageId: {
            senderAccountId: viewer.accountId,
            clientMessageId: dto.clientMessageId,
          },
        },

        select: messageSelect,
      });

      if (!duplicateMessage) {
        throw error;
      }

      if (duplicateMessage.conversationId !== conversationId) {
        throw new ConflictException(
          'This client message ID was already used in another conversation.',
        );
      }

      return {
        message: 'Message was already accepted.',
        duplicate: true,
        data: this.serializeMessage(duplicateMessage),
      };
    }
  }

  async sendLocationMessage(
    user: AuthenticatedUser,
    conversationId: string,
    dto: SendLocationMessageDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const isLive = dto.live === true;
    const liveDurationMinutes = dto.liveDurationMinutes ?? 15;
    const liveExpiresAt = isLive
      ? new Date(Date.now() + liveDurationMinutes * 60 * 1000)
      : null;
    const textContent = isLive ? 'Started live location' : 'Shared current location';

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        participants: {
          some: {
            accountId: viewer.accountId,
            leftAt: null,
          },
        },
      },
      select: {
        id: true,
        type: true,
        groupKind: true,
        participants: {
          where: {
            leftAt: null,
          },
          select: {
            accountId: true,
            isMuted: true,
            mutedUntil: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation was not found.');
    }

    if (
      conversation.type === ConversationType.PRIVATE &&
      conversation.participants.length !== 2
    ) {
      throw new ConflictException(
        'The private conversation does not have exactly two active participants.',
      );
    }

    if (conversation.type === ConversationType.PRIVATE) {
      const recipient = conversation.participants.find(
        (participant) => participant.accountId !== viewer.accountId,
      );

      if (recipient) {
        await this.assertNoPersonalBlock(
          viewer.accountId,
          recipient.accountId,
          'share a location privately',
        );
      }
    }

    const existingMessage = await this.prisma.message.findUnique({
      where: {
        senderAccountId_clientMessageId: {
          senderAccountId: viewer.accountId,
          clientMessageId: dto.clientMessageId,
        },
      },
      select: messageSelect,
    });

    if (existingMessage) {
      if (existingMessage.conversationId !== conversationId) {
        throw new ConflictException(
          'This client message ID was already used in another conversation.',
        );
      }

      return {
        message: 'Location message was already accepted.',
        duplicate: true,
        data: this.serializeMessage(existingMessage),
      };
    }

    const recipientAccountIds = conversation.participants
      .map((participant) => participant.accountId)
      .filter((accountId) => accountId !== viewer.accountId);

    const createdMessage = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.message.create({
        data: {
          conversationId,
          senderAccountId: viewer.accountId,
          clientMessageId: dto.clientMessageId,
          contentType: MessageContentType.LOCATION,
          textContent,
          payload: this.buildLocationPayload(
            dto,
            isLive ? 'LIVE' : 'CURRENT',
            liveExpiresAt,
          ),
          receipts: {
            create: recipientAccountIds.map((accountId) => ({
              accountId,
            })),
          },
        },
        select: {
          id: true,
          sentAt: true,
        },
      });

      await transaction.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          lastMessageAt: created.sentAt,
        },
      });

      await transaction.conversationParticipant.updateMany({
        where: {
          conversationId,
          accountId: {
            in: conversation.participants.map(
              (participant) => participant.accountId,
            ),
          },
        },
        data: {
          isArchived: false,
        },
      });

      return transaction.message.findUniqueOrThrow({
        where: {
          id: created.id,
        },
        select: messageSelect,
      });
    });

    const serializedMessage = this.serializeMessage(createdMessage);
    const participantAccountIds = conversation.participants.map(
      (participant) => participant.accountId,
    );

    this.messagingEventsService.emitMessageCreated(participantAccountIds, {
      conversationId,
      message: serializedMessage,
      occurredAt: new Date().toISOString(),
    });

    await this.createAndEmitMessageNotifications({
      message: createdMessage,
      participants: conversation.participants,
    });

    return {
      message: isLive
        ? 'Live location started successfully.'
        : 'Current location sent successfully.',
      duplicate: false,
      data: serializedMessage,
    };
  }

  async updateLiveLocationMessage(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
    dto: UpdateLiveLocationDto,
  ) {
    const viewer = await this.getMessagingViewer(user);

    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        senderAccountId: viewer.accountId,
        contentType: MessageContentType.LOCATION,
        deletedAt: null,
        conversation: {
          participants: {
            some: {
              accountId: viewer.accountId,
              leftAt: null,
            },
          },
        },
      },
      select: messageSelect,
    });

    if (!message) {
      throw new NotFoundException('Live location message was not found.');
    }

    const currentLocation = this.getLocationPayload(message.payload);

    if (!this.isLiveLocationActive(currentLocation)) {
      throw new BadRequestException('Live location is not active.');
    }

    const activeLocation = currentLocation as MessageLocationPayload;

    const updatedMessage = await this.prisma.message.update({
      where: {
        id: message.id,
      },
      data: {
        payload: this.buildLocationPayload(
          dto,
          'LIVE',
          activeLocation.liveExpiresAt ? new Date(activeLocation.liveExpiresAt) : null,
          activeLocation.liveStoppedAt ? new Date(activeLocation.liveStoppedAt) : null,
        ),
      },
      select: messageSelect,
    });

    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        leftAt: null,
      },
      select: {
        accountId: true,
      },
    });

    const serializedMessage = this.serializeMessage(updatedMessage);

    this.messagingEventsService.emitMessageUpdated(
      participants.map((participant) => participant.accountId),
      {
        conversationId,
        message: serializedMessage,
        action: 'LIVE_LOCATION_UPDATED',
        occurredAt: new Date().toISOString(),
      },
    );

    return {
      message: 'Live location updated successfully.',
      data: serializedMessage,
    };
  }

  async stopLiveLocationMessage(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);

    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        senderAccountId: viewer.accountId,
        contentType: MessageContentType.LOCATION,
        deletedAt: null,
        conversation: {
          participants: {
            some: {
              accountId: viewer.accountId,
              leftAt: null,
            },
          },
        },
      },
      select: messageSelect,
    });

    if (!message) {
      throw new NotFoundException('Live location message was not found.');
    }

    const currentLocation = this.getLocationPayload(message.payload);

    if (!currentLocation || currentLocation.kind !== 'LIVE') {
      throw new BadRequestException('This message is not a live location.');
    }

    const stoppedAt = currentLocation.liveStoppedAt
      ? new Date(currentLocation.liveStoppedAt)
      : new Date();

    const updatedMessage = await this.prisma.message.update({
      where: {
        id: message.id,
      },
      data: {
        payload: this.buildLocationPayload(
          {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            accuracyMeters: currentLocation.accuracyMeters ?? undefined,
            headingDegrees: currentLocation.headingDegrees ?? undefined,
            speedMetersPerSecond: currentLocation.speedMetersPerSecond ?? undefined,
          },
          'LIVE',
          currentLocation.liveExpiresAt ? new Date(currentLocation.liveExpiresAt) : null,
          stoppedAt,
        ),
      },
      select: messageSelect,
    });

    const participants = await this.prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        leftAt: null,
      },
      select: {
        accountId: true,
      },
    });

    const serializedMessage = this.serializeMessage(updatedMessage);

    this.messagingEventsService.emitMessageUpdated(
      participants.map((participant) => participant.accountId),
      {
        conversationId,
        message: serializedMessage,
        action: 'LIVE_LOCATION_STOPPED',
        occurredAt: new Date().toISOString(),
      },
    );

    return {
      message: 'Live location stopped successfully.',
      data: serializedMessage,
    };
  }

  async sendAttachmentMessage(
    user: AuthenticatedUser,
    conversationId: string,
    dto: SendAttachmentMessageDto,
    file?: UploadedMessageAttachmentFile,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const attachment = this.validateMessageAttachment(file);
    const uploadedFile = file as UploadedMessageAttachmentFile;
    const caption = dto.caption?.trim() || null;
    const attachmentKind = dto.attachmentKind ?? null;

    if (attachmentKind === 'VOICE_NOTE' && attachment.contentType !== MessageContentType.AUDIO) {
      throw new BadRequestException('Voice notes must be uploaded as an audio file.');
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,

        participants: {
          some: {
            accountId: viewer.accountId,
            leftAt: null,
          },
        },
      },

      select: {
        id: true,
        type: true,
        groupKind: true,

        participants: {
          where: {
            leftAt: null,
          },

          select: {
            accountId: true,
            isMuted: true,
            mutedUntil: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException('Conversation was not found.');
    }

    if (
      conversation.type === ConversationType.PRIVATE &&
      conversation.participants.length !== 2
    ) {
      throw new ConflictException(
        'The private conversation does not have exactly two active participants.',
      );
    }

    if (conversation.type === ConversationType.PRIVATE) {
      const recipient = conversation.participants.find(
        (participant) => participant.accountId !== viewer.accountId,
      );

      if (recipient) {
        await this.assertNoPersonalBlock(
          viewer.accountId,
          recipient.accountId,
          'send a private message',
        );
      }
    }

    const existingMessage = await this.prisma.message.findUnique({
      where: {
        senderAccountId_clientMessageId: {
          senderAccountId: viewer.accountId,
          clientMessageId: dto.clientMessageId,
        },
      },

      select: messageSelect,
    });

    if (existingMessage) {
      if (existingMessage.conversationId !== conversationId) {
        throw new ConflictException(
          'This client message ID was already used in another conversation.',
        );
      }

      return {
        message: 'Attachment message was already accepted.',
        duplicate: true,
        data: this.serializeMessage(existingMessage),
      };
    }

    if (dto.replyToMessageId) {
      const replyTarget = await this.prisma.message.findFirst({
        where: {
          id: dto.replyToMessageId,
          conversationId,
          deletedAt: null,
          hiddenForAccounts: {
            none: {
              accountId: viewer.accountId,
            },
          },
        },

        select: {
          id: true,
        },
      });

      if (!replyTarget) {
        throw new BadRequestException(
          'The message selected for reply was not found in this conversation.',
        );
      }
    }

    const recipientAccountIds = conversation.participants
      .map((participant) => participant.accountId)
      .filter((accountId) => accountId !== viewer.accountId);

    const storageKey = [
      conversationId,
      `${randomUUID()}-${attachment.originalFileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
    ].join('/');

    await this.writeAttachmentFile(storageKey, uploadedFile);

    try {
      const createdMessage = await this.prisma.$transaction(
        async (transaction) => {
          const created = await transaction.message.create({
            data: {
              conversationId,
              senderAccountId: viewer.accountId,
              clientMessageId: dto.clientMessageId,
              contentType: attachment.contentType,
              textContent: caption,
              replyToMessageId: dto.replyToMessageId ?? null,
              payload: {
                attachmentCount: 1,
                // The payload marks browser-recorded audio so clients can show voice-note UI.
                ...(attachmentKind ? { attachmentKind } : {}),
              },

              attachments: {
                create: {
                  storageKey,
                  originalFileName: attachment.originalFileName,
                  mimeType: uploadedFile.mimetype,
                  fileSizeBytes: uploadedFile.size,
                  contentType: attachment.contentType,
                  scanStatus: 'PENDING',
                },
              },

              receipts: {
                create: recipientAccountIds.map((accountId) => ({
                  accountId,
                })),
              },
            },

            select: {
              id: true,
              sentAt: true,
            },
          });

          await transaction.conversation.update({
            where: {
              id: conversationId,
            },

            data: {
              lastMessageAt: created.sentAt,
            },
          });

          await transaction.conversationParticipant.updateMany({
            where: {
              conversationId,
              accountId: {
                in: conversation.participants.map(
                  (participant) => participant.accountId,
                ),
              },
            },

            data: {
              isArchived: false,
            },
          });

          return transaction.message.findUniqueOrThrow({
            where: {
              id: created.id,
            },

            select: messageSelect,
          });
        },
      );

      const serializedMessage = this.serializeMessage(createdMessage);
      const participantAccountIds = conversation.participants.map(
        (participant) => participant.accountId,
      );

      this.messagingEventsService.emitMessageCreated(participantAccountIds, {
        conversationId,
        message: serializedMessage,
        occurredAt: new Date().toISOString(),
      });

      await this.createAndEmitMessageNotifications({
        message: createdMessage,
        participants: conversation.participants,
      });

      return {
        message: 'Attachment sent successfully.',
        duplicate: false,
        data: serializedMessage,
      };
    } catch (error) {
      await this.deleteAttachmentFileIfExists(storageKey);

      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const duplicateMessage = await this.prisma.message.findUnique({
        where: {
          senderAccountId_clientMessageId: {
            senderAccountId: viewer.accountId,
            clientMessageId: dto.clientMessageId,
          },
        },

        select: messageSelect,
      });

      if (!duplicateMessage) {
        throw error;
      }

      if (duplicateMessage.conversationId !== conversationId) {
        throw new ConflictException(
          'This client message ID was already used in another conversation.',
        );
      }

      return {
        message: 'Attachment message was already accepted.',
        duplicate: true,
        data: this.serializeMessage(duplicateMessage),
      };
    }
  }

  async getAttachmentDownload(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
    attachmentId: string,
  ) {
    await this.assertActiveParticipant(user.accountId, conversationId);

    const attachment = await this.prisma.messageAttachment.findFirst({
      where: {
        id: attachmentId,
        messageId,
        message: {
          id: messageId,
          conversationId,
          deletedAt: null,
          hiddenForAccounts: {
            none: {
              accountId: user.accountId,
            },
          },
        },
      },

      select: {
        storageKey: true,
        originalFileName: true,
        mimeType: true,
        fileSizeBytes: true,
        scanStatus: true,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment was not found.');
    }

    if (attachment.scanStatus === 'FAILED') {
      throw new ForbiddenException('This attachment is not available for download.');
    }

    const absolutePath = this.resolveAttachmentPath(attachment.storageKey);

    try {
      await fs.access(absolutePath);
    } catch {
      throw new NotFoundException('Attachment file was not found in storage.');
    }

    return {
      absolutePath,
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSizeBytes: attachment.fileSizeBytes,
    };
  }

  async forwardTextMessage(
    user: AuthenticatedUser,
    sourceConversationId: string,
    sourceMessageId: string,
    dto: ForwardTextMessageDto,
  ) {
    const viewer = await this.getMessagingViewer(user);

    await this.assertActiveParticipant(viewer.accountId, sourceConversationId);

    const sourceMessage = await this.prisma.message.findFirst({
      where: {
        id: sourceMessageId,
        conversationId: sourceConversationId,
        deletedAt: null,
        hiddenForAccounts: {
          none: {
            accountId: viewer.accountId,
          },
        },
      },
      select: messageSelect,
    });

    if (!sourceMessage) {
      throw new NotFoundException(
        'The message selected for forwarding was not found.',
      );
    }

    const sourceAttachments = sourceMessage.attachments ?? [];
    // Forwarding is allowed only for active visible content that the requester can read.
    const isTextForward =
      sourceMessage.contentType === MessageContentType.TEXT &&
      Boolean(sourceMessage.textContent);
    const forwardableAttachmentTypes = new Set<MessageContentType>([
      MessageContentType.IMAGE,
      MessageContentType.VIDEO,
      MessageContentType.FILE,
      MessageContentType.AUDIO,
    ]);
    const isAttachmentForward =
      sourceAttachments.length > 0 &&
      forwardableAttachmentTypes.has(sourceMessage.contentType);

    if (!isTextForward && !isAttachmentForward) {
      throw new BadRequestException(
        'Only active text, image, video, audio and document messages can be forwarded.',
      );
    }

    if (sourceAttachments.some((attachment) => attachment.scanStatus === 'FAILED')) {
      throw new ForbiddenException(
        'A failed or quarantined attachment cannot be forwarded.',
      );
    }

    // Reuse the same stored object for forwarded media instead of uploading a duplicate file.
    const forwardedAttachments = sourceAttachments.map((attachment) => ({
      storageKey: attachment.storageKey,
      originalFileName: attachment.originalFileName,
      mimeType: attachment.mimeType,
      fileSizeBytes: attachment.fileSizeBytes,
      contentType: attachment.contentType,
      scanStatus: attachment.scanStatus,
    }));
    const sourcePayload = this.getPlainMessagePayload(sourceMessage.payload);
    const forwardedTextContent = sourceMessage.textContent;
    const forwardedPreviewText =
      forwardedTextContent ??
      forwardedAttachments[0]?.originalFileName ??
      sourceMessage.contentType;
    const destinationConversationIds = [
      ...new Set(dto.destinationConversationIds),
    ];
    // Every destination must already include the sender as an active participant.
    const destinationConversations = await this.prisma.conversation.findMany({
      where: {
        id: {
          in: destinationConversationIds,
        },
        participants: {
          some: {
            accountId: viewer.accountId,
            leftAt: null,
          },
        },
      },
      select: {
        id: true,
        type: true,
        groupKind: true,
        participants: {
          where: {
            leftAt: null,
          },
          select: {
            accountId: true,
            isMuted: true,
            mutedUntil: true,
          },
        },
      },
    });

    if (destinationConversations.length !== destinationConversationIds.length) {
      throw new BadRequestException(
        'One or more forwarding destinations are unavailable.',
      );
    }

    for (const conversation of destinationConversations) {
      if (
        conversation.type === ConversationType.PRIVATE &&
        conversation.participants.length !== 2
      ) {
        throw new ConflictException(
          'A forwarding destination has an invalid participant state.',
        );
      }

      if (conversation.type === ConversationType.PRIVATE) {
        const recipient = conversation.participants.find(
          (participant) => participant.accountId !== viewer.accountId,
        );

        if (recipient) {
          await this.assertNoPersonalBlock(
            viewer.accountId,
            recipient.accountId,
            'forward a private message',
          );
        }
      }
    }

    const existingMetadata = this.getForwardedMessageMetadata(
      sourceMessage.payload,
    );
    const sourceSender = this.serializeAccount(sourceMessage.sender);
    const forwardedFrom: ForwardedMessageMetadata = existingMetadata ?? {
      sourceMessageId: sourceMessage.id,
      sourceConversationId: sourceMessage.conversationId,
      originalSenderAccountId: sourceMessage.senderAccountId,
      originalSenderDisplayName: sourceSender.displayName,
      originalSentAt: sourceMessage.sentAt.toISOString(),
      originalTextContent: forwardedPreviewText,
    };

    const forwardedMessages = await this.prisma.$transaction(
      async (transaction) => {
        const results: Array<{
          message: MessageRecord;
          duplicate: boolean;
          participantAccountIds: string[];
          participants: NotificationParticipant[];
        }> = [];

        for (const conversation of destinationConversations) {
          const clientMessageId = [dto.clientForwardId, conversation.id].join(
            ':',
          );
          const participantAccountIds = conversation.participants.map(
            (participant) => participant.accountId,
          );
          const recipientAccountIds = participantAccountIds.filter(
            (accountId) => accountId !== viewer.accountId,
          );
          // Client forward ID keeps retry requests idempotent per destination conversation.
          const existingMessage = await transaction.message.findUnique({
            where: {
              senderAccountId_clientMessageId: {
                senderAccountId: viewer.accountId,
                clientMessageId,
              },
            },
            select: messageSelect,
          });

          if (existingMessage) {
            const existingForward = this.getForwardedMessageMetadata(
              existingMessage.payload,
            );

            if (
              existingMessage.conversationId !== conversation.id ||
              existingForward?.sourceMessageId !== forwardedFrom.sourceMessageId
            ) {
              throw new ConflictException(
                'This forwarding request ID was already used for different content.',
              );
            }

            results.push({
              message: existingMessage,
              duplicate: true,
              participantAccountIds,
              participants: conversation.participants,
            });
            continue;
          }

          const createdMessage = await transaction.message.upsert({
            where: {
              senderAccountId_clientMessageId: {
                senderAccountId: viewer.accountId,
                clientMessageId,
              },
            },
            update: {},
            create: {
              conversationId: conversation.id,
              senderAccountId: viewer.accountId,
              clientMessageId,
              contentType: sourceMessage.contentType,
              textContent: forwardedTextContent,
              payload: {
                ...sourcePayload,
                attachmentCount: forwardedAttachments.length,
                forwardedFrom: {
                  sourceMessageId: forwardedFrom.sourceMessageId,
                  sourceConversationId: forwardedFrom.sourceConversationId,
                  originalSenderAccountId:
                    forwardedFrom.originalSenderAccountId,
                  originalSenderDisplayName:
                    forwardedFrom.originalSenderDisplayName,
                  originalSentAt: forwardedFrom.originalSentAt,
                  originalTextContent: forwardedFrom.originalTextContent,
                },
              },
              // Create new attachment rows that point to the existing protected file object.
              ...(forwardedAttachments.length > 0
                ? {
                    attachments: {
                      create: forwardedAttachments,
                    },
                  }
                : {}),
              receipts: {
                create: recipientAccountIds.map((accountId) => ({
                  accountId,
                })),
              },
            },
            select: messageSelect,
          });

          await transaction.conversation.update({
            where: {
              id: conversation.id,
            },
            data: {
              lastMessageAt: createdMessage.sentAt,
            },
          });

          await transaction.conversationParticipant.updateMany({
            where: {
              conversationId: conversation.id,
              accountId: {
                in: participantAccountIds,
              },
            },
            data: {
              isArchived: false,
            },
          });

          results.push({
            message: createdMessage,
            duplicate: false,
            participantAccountIds,
            participants: conversation.participants,
          });
        }

        return results;
      },
    );

    for (const result of forwardedMessages) {
      if (result.duplicate) {
        continue;
      }

      this.messagingEventsService.emitMessageCreated(
        result.participantAccountIds,
        {
          conversationId: result.message.conversationId,
          message: this.serializeMessage(result.message),
          occurredAt: new Date().toISOString(),
        },
      );

      await this.createAndEmitMessageNotifications({
        message: result.message,
        participants: result.participants,
      });
    }

    const createdCount = forwardedMessages.filter(
      (result) => !result.duplicate,
    ).length;
    const duplicateCount = forwardedMessages.length - createdCount;

    return {
      message:
        createdCount === 0
          ? 'This forwarding request was already completed.'
          : `Message forwarded to ${createdCount} conversation${
              createdCount === 1 ? '' : 's'
            }.`,
      createdCount,
      duplicateCount,
      data: forwardedMessages.map((result) =>
        this.serializeMessage(result.message),
      ),
    };
  }

  async editTextMessage(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
    dto: UpdateTextMessageDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    const textContent = dto.text.trim();

    if (!textContent) {
      throw new BadRequestException('Message text cannot be empty.');
    }

    await this.assertActiveParticipant(viewer.accountId, conversationId);

    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
      },

      select: messageSelect,
    });

    if (!message) {
      throw new NotFoundException('Message was not found.');
    }

    if (message.senderAccountId !== viewer.accountId) {
      throw new ForbiddenException('You can edit only messages that you sent.');
    }

    if (message.deletedAt) {
      throw new ConflictException('A deleted message cannot be edited.');
    }

    if (message.contentType !== MessageContentType.TEXT) {
      throw new BadRequestException('Only text messages can be edited.');
    }

    if (this.getForwardedMessageMetadata(message.payload)) {
      throw new ForbiddenException('Forwarded messages cannot be edited.');
    }

    if (Date.now() - message.sentAt.getTime() > MESSAGE_EDIT_WINDOW_MS) {
      throw new ForbiddenException(
        'The 15-minute message editing period has ended.',
      );
    }

    const [updatedMessage, participants] = await this.prisma.$transaction([
      this.prisma.message.update({
        where: {
          id: message.id,
        },

        data: {
          textContent,
          editedAt: new Date(),
        },

        select: messageSelect,
      }),
      this.prisma.conversationParticipant.findMany({
        where: {
          conversationId,
          leftAt: null,
        },

        select: {
          accountId: true,
        },
      }),
    ]);

    const serializedMessage = this.serializeMessage(updatedMessage);

    this.messagingEventsService.emitMessageUpdated(
      participants.map((participant) => participant.accountId),
      {
        conversationId,
        message: serializedMessage,
        action: 'EDITED',
        occurredAt: new Date().toISOString(),
      },
    );

    return {
      message: 'Message edited successfully.',
      data: serializedMessage,
    };
  }

  async reactToMessage(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
    dto: ReactMessageDto,
  ) {
    return this.mutateMessageReaction(
      user,
      conversationId,
      messageId,
      dto.reaction,
    );
  }

  async removeMessageReaction(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ) {
    return this.mutateMessageReaction(user, conversationId, messageId, null);
  }

  private async mutateMessageReaction(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
    reactionValue: ReactMessageDto['reaction'] | null,
  ) {
    await this.assertActiveParticipant(user.accountId, conversationId);

    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
        deletedAt: null,
        hiddenForAccounts: {
          none: {
            accountId: user.accountId,
          },
        },
      },

      select: {
        id: true,
        senderAccountId: true,
      },
    });

    if (!message) {
      throw new NotFoundException('Message was not found.');
    }

    const now = new Date();

    const result = await this.prisma.$transaction(async (transaction) => {
      const existingReaction = await transaction.messageReaction.findUnique({
        where: {
          messageId_accountId: {
            messageId,
            accountId: user.accountId,
          },
        },

        select: {
          reactionValue: true,
        },
      });

      let action: MessageReactionMutationAction;

      if (!reactionValue || existingReaction?.reactionValue === reactionValue) {
        if (existingReaction) {
          await transaction.messageReaction.delete({
            where: {
              messageId_accountId: {
                messageId,
                accountId: user.accountId,
              },
            },
          });
        }

        action = 'REMOVED';
      } else if (existingReaction) {
        await transaction.messageReaction.update({
          where: {
            messageId_accountId: {
              messageId,
              accountId: user.accountId,
            },
          },

          data: {
            reactionValue,
          },
        });

        action = 'UPDATED';
      } else {
        await transaction.messageReaction.create({
          data: {
            messageId,
            accountId: user.accountId,
            reactionValue,
          },
        });

        action = 'ADDED';
      }

      const [updatedMessage, participants] = await Promise.all([
        transaction.message.findUnique({
          where: {
            id: messageId,
          },
          select: messageSelect,
        }),
        transaction.conversationParticipant.findMany({
          where: {
            conversationId,
            leftAt: null,
          },

          select: {
            accountId: true,
          },
        }),
      ]);

      if (!updatedMessage) {
        throw new NotFoundException('Message was not found.');
      }

      return {
        action,
        message: updatedMessage,
        participantAccountIds: participants.map(
          (participant) => participant.accountId,
        ),
      };
    });

    const serializedMessage = this.serializeMessage(result.message);

    this.messagingEventsService.emitMessageUpdated(
      result.participantAccountIds,
      {
        conversationId,
        message: serializedMessage,
        action: 'REACTION_UPDATED',
        occurredAt: now.toISOString(),
      },
    );

    await this.createAndEmitReactionNotification(
      user.accountId,
      conversationId,
      result.message,
      reactionValue,
    );

    return {
      message:
        result.action === 'ADDED'
          ? 'Reaction added.'
          : result.action === 'UPDATED'
            ? 'Reaction updated.'
            : 'Reaction removed.',
      action: result.action,
      data: serializedMessage,
    };
  }

  async listStarredMessages(user: AuthenticatedUser) {
    const viewer = await this.getMessagingViewer(user);

    const starredMessages = await this.prisma.messageStar.findMany({
      where: {
        accountId: viewer.accountId,
        message: {
          deletedAt: null,
          hiddenForAccounts: {
            none: {
              accountId: viewer.accountId,
            },
          },
          conversation: {
            participants: {
              some: {
                accountId: viewer.accountId,
                leftAt: null,
              },
            },
          },
        },
      },

      orderBy: {
        starredAt: 'desc',
      },

      take: 100,

      select: {
        starredAt: true,
        message: {
          select: messageSelect,
        },
      },
    });

    const conversationIds = [
      ...new Set(starredMessages.map((star) => star.message.conversationId)),
    ];

    const conversations = await this.prisma.conversation.findMany({
      where: {
        id: {
          in: conversationIds,
        },
      },
      select: conversationSelect,
    });

    const conversationById = new Map(
      conversations.map((conversation) => [conversation.id, conversation]),
    );

    return {
      data: starredMessages.flatMap((star) => {
        const conversation = conversationById.get(star.message.conversationId);

        if (!conversation) {
          return [];
        }

        return [
          {
            starredAt: star.starredAt,
            message: this.serializeMessage(star.message, viewer.accountId),
            conversation: this.serializeConversation(
              conversation,
              viewer.accountId,
              0,
            ),
          },
        ];
      }),
    };
  }

  async listPinnedMessages(
    user: AuthenticatedUser,
    conversationId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);
    await this.assertActiveParticipant(viewer.accountId, conversationId);

    const pinnedMessages = await this.prisma.messagePin.findMany({
      where: {
        conversationId,
        unpinnedAt: null,
        message: {
          deletedAt: null,
          hiddenForAccounts: {
            none: {
              accountId: viewer.accountId,
            },
          },
        },
      },

      orderBy: {
        pinnedAt: 'desc',
      },

      take: 20,

      select: {
        message: {
          select: messageSelect,
        },
      },
    });

    return {
      data: pinnedMessages.map((pin) =>
        this.serializeMessage(pin.message, viewer.accountId),
      ),
    };
  }

  async starMessage(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);
    await this.findVisibleConversationMessageOrThrow(
      viewer.accountId,
      conversationId,
      messageId,
    );

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.messageStar.upsert({
        where: {
          messageId_accountId: {
            messageId,
            accountId: viewer.accountId,
          },
        },
        update: {
          starredAt: new Date(),
        },
        create: {
          messageId,
          accountId: viewer.accountId,
        },
      });

      const message = await transaction.message.findUnique({
        where: {
          id: messageId,
        },
        select: messageSelect,
      });

      if (!message) {
        throw new NotFoundException('Message was not found.');
      }

      return message;
    });

    return {
      message: 'Message starred.',
      data: this.serializeMessage(result, viewer.accountId),
    };
  }

  async unstarMessage(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);
    await this.findVisibleConversationMessageOrThrow(
      viewer.accountId,
      conversationId,
      messageId,
    );

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.messageStar.deleteMany({
        where: {
          messageId,
          accountId: viewer.accountId,
        },
      });

      const message = await transaction.message.findUnique({
        where: {
          id: messageId,
        },
        select: messageSelect,
      });

      if (!message) {
        throw new NotFoundException('Message was not found.');
      }

      return message;
    });

    return {
      message: 'Message unstarred.',
      data: this.serializeMessage(result, viewer.accountId),
    };
  }

  async pinMessage(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);
    await this.findVisibleConversationMessageOrThrow(
      viewer.accountId,
      conversationId,
      messageId,
    );

    const now = new Date();

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.messagePin.upsert({
        where: {
          messageId_conversationId: {
            messageId,
            conversationId,
          },
        },
        update: {
          pinnedByAccountId: viewer.accountId,
          pinnedAt: now,
          unpinnedAt: null,
          unpinnedByAccountId: null,
        },
        create: {
          messageId,
          conversationId,
          pinnedByAccountId: viewer.accountId,
          pinnedAt: now,
        },
      });

      const [message, participants] = await Promise.all([
        transaction.message.findUnique({
          where: {
            id: messageId,
          },
          select: messageSelect,
        }),
        transaction.conversationParticipant.findMany({
          where: {
            conversationId,
            leftAt: null,
          },
          select: {
            accountId: true,
          },
        }),
      ]);

      if (!message) {
        throw new NotFoundException('Message was not found.');
      }

      return {
        message,
        participantAccountIds: participants.map((participant) => participant.accountId),
      };
    });

    const serializedMessage = this.serializeMessage(result.message, viewer.accountId);

    this.messagingEventsService.emitMessageUpdated(
      result.participantAccountIds,
      {
        conversationId,
        message: this.serializeMessage(result.message),
        action: 'PINNED',
        occurredAt: now.toISOString(),
      },
    );

    return {
      message: 'Message pinned.',
      data: serializedMessage,
    };
  }

  async unpinMessage(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);
    await this.findVisibleConversationMessageOrThrow(
      viewer.accountId,
      conversationId,
      messageId,
    );

    const now = new Date();

    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.messagePin.updateMany({
        where: {
          messageId,
          conversationId,
          unpinnedAt: null,
        },
        data: {
          unpinnedAt: now,
          unpinnedByAccountId: viewer.accountId,
        },
      });

      const [message, participants] = await Promise.all([
        transaction.message.findUnique({
          where: {
            id: messageId,
          },
          select: messageSelect,
        }),
        transaction.conversationParticipant.findMany({
          where: {
            conversationId,
            leftAt: null,
          },
          select: {
            accountId: true,
          },
        }),
      ]);

      if (!message) {
        throw new NotFoundException('Message was not found.');
      }

      return {
        message,
        participantAccountIds: participants.map((participant) => participant.accountId),
      };
    });

    const serializedMessage = this.serializeMessage(result.message, viewer.accountId);

    this.messagingEventsService.emitMessageUpdated(
      result.participantAccountIds,
      {
        conversationId,
        message: this.serializeMessage(result.message),
        action: 'UNPINNED',
        occurredAt: now.toISOString(),
      },
    );

    return {
      message: 'Message unpinned.',
      data: serializedMessage,
    };
  }

  async deleteMessageForMe(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);

    await this.assertActiveParticipant(viewer.accountId, conversationId);

    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
      },
      select: {
        id: true,
        senderAccountId: true,
      },
    });

    if (!message) {
      throw new NotFoundException('Message was not found.');
    }

    const now = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.messageHiddenForAccount.upsert({
        where: {
          messageId_accountId: {
            messageId: message.id,
            accountId: viewer.accountId,
          },
        },
        update: {
          hiddenAt: now,
        },
        create: {
          messageId: message.id,
          accountId: viewer.accountId,
          hiddenAt: now,
        },
      });

      await transaction.messageReceipt.updateMany({
        where: {
          messageId: message.id,
          accountId: viewer.accountId,
        },
        data: {
          deliveredAt: now,
          readAt: now,
        },
      });
    });

    this.messagingEventsService.emitMessageHidden(viewer.accountId, {
      conversationId,
      messageId: message.id,
      accountId: viewer.accountId,
      occurredAt: now.toISOString(),
    });

    if (message.senderAccountId !== viewer.accountId) {
      this.messagingEventsService.emitReceiptUpdated(
        [message.senderAccountId],
        {
          conversationId,
          messageIds: [message.id],
          accountId: viewer.accountId,
          status: 'READ',
          occurredAt: now.toISOString(),
        },
      );
    }

    return {
      message: 'Message deleted for you.',
      conversationId,
      messageId: message.id,
      hiddenAt: now,
    };
  }

  async deleteMessageForEveryone(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);

    await this.assertActiveParticipant(viewer.accountId, conversationId);

    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        conversationId,
      },

      select: messageSelect,
    });

    if (!message) {
      throw new NotFoundException('Message was not found.');
    }

    if (message.senderAccountId !== viewer.accountId) {
      throw new ForbiddenException(
        'You can delete only messages that you sent.',
      );
    }

    if (message.deletedAt) {
      return {
        message: 'Message was already deleted.',
        data: this.serializeMessage(message),
      };
    }

    const now = new Date();
    const [deletedMessage, participants] = await this.prisma.$transaction([
      this.prisma.message.update({
        where: {
          id: message.id,
        },

        data: {
          deletedAt: now,
          deletedByAccountId: viewer.accountId,
        },

        select: messageSelect,
      }),
      this.prisma.conversationParticipant.findMany({
        where: {
          conversationId,
          leftAt: null,
        },

        select: {
          accountId: true,
        },
      }),
    ]);

    const serializedMessage = this.serializeMessage(deletedMessage);

    this.messagingEventsService.emitMessageUpdated(
      participants.map((participant) => participant.accountId),
      {
        conversationId,
        message: serializedMessage,
        action: 'DELETED',
        occurredAt: now.toISOString(),
      },
    );

    return {
      message: 'Message deleted for everyone.',
      data: serializedMessage,
    };
  }

  async updateConversationPreference(
    user: AuthenticatedUser,
    conversationId: string,
    dto: UpdateConversationPreferenceDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
    await this.assertActiveParticipant(viewer.accountId, conversationId);

    const now = new Date();
    const data: Prisma.ConversationParticipantUpdateInput = {};

    if (dto.isPinned !== undefined) {
      data.isPinned = dto.isPinned;
      data.pinnedAt = dto.isPinned ? now : null;
    }

    if (dto.isArchived !== undefined) {
      data.isArchived = dto.isArchived;
      data.archivedAt = dto.isArchived ? now : null;
    }

    if (dto.markUnread !== undefined) {
      // Manual unread is personal and clears the next time the user opens the chat.
      data.markedUnreadAt = dto.markUnread ? now : null;
    }

    if (dto.mute !== undefined) {
      data.isMuted = dto.mute !== 'OFF';
      data.mutedUntil = dto.mute === 'OFF' ? null : this.getMuteUntil(dto.mute, now);
    }

    if (dto.draftText !== undefined) {
      const draftText = dto.draftText?.trim() ? dto.draftText : null;

      // Drafts belong to the viewer and never affect the recipient's composer.
      data.draftText = draftText;
      data.draftUpdatedAt = draftText ? now : null;
    }

    const participant = await this.prisma.conversationParticipant.update({
      where: {
        conversationId_accountId: {
          conversationId,
          accountId: viewer.accountId,
        },
      },
      data,
      select: {
        conversationId: true,
        accountId: true,
        isPinned: true,
        pinnedAt: true,
        isArchived: true,
        archivedAt: true,
        isMuted: true,
        mutedUntil: true,
        markedUnreadAt: true,
        draftText: true,
        draftUpdatedAt: true,
      },
    });

    return {
      message: 'Conversation preferences updated.',
      data: {
        conversationId: participant.conversationId,
        accountId: participant.accountId,
        isPinned: participant.isPinned,
        pinnedAt: participant.pinnedAt,
        isArchived: participant.isArchived,
        archivedAt: participant.archivedAt,
        isMuted: this.isMuteActive(participant),
        mutedUntil: participant.mutedUntil,
        isMarkedUnread: participant.markedUnreadAt !== null,
        markedUnreadAt: participant.markedUnreadAt,
        draftText: participant.draftText,
        draftUpdatedAt: participant.draftUpdatedAt,
      },
    };
  }

  async markConversationRead(user: AuthenticatedUser, conversationId: string) {
    const viewer = await this.getMessagingViewer(user);

    await this.assertActiveParticipant(viewer.accountId, conversationId);

    const pendingReceipts = await this.prisma.messageReceipt.findMany({
      where: {
        accountId: viewer.accountId,
        readAt: null,

        message: {
          is: {
            conversationId,
            hiddenForAccounts: {
              none: {
                accountId: viewer.accountId,
              },
            },
          },
        },
      },

      select: {
        messageId: true,

        message: {
          select: {
            senderAccountId: true,
          },
        },
      },
    });

    const now = new Date();

    const readResult = await this.prisma.$transaction(async (transaction) => {
      await transaction.conversationParticipant.update({
        where: {
          conversationId_accountId: {
            conversationId,
            accountId: viewer.accountId,
          },
        },
        data: {
          markedUnreadAt: null,
        },
      });

      await transaction.messageReceipt.updateMany({
        where: {
          accountId: viewer.accountId,
          deliveredAt: null,

          message: {
            is: {
              conversationId,
              hiddenForAccounts: {
                none: {
                  accountId: viewer.accountId,
                },
              },
            },
          },
        },

        data: {
          deliveredAt: now,
        },
      });

      return transaction.messageReceipt.updateMany({
        where: {
          accountId: viewer.accountId,
          readAt: null,

          message: {
            is: {
              conversationId,
              hiddenForAccounts: {
                none: {
                  accountId: viewer.accountId,
                },
              },
            },
          },
        },

        data: {
          readAt: now,
        },
      });
    });

    const receiptsBySender = new Map<string, string[]>();

    for (const receipt of pendingReceipts) {
      const messageIds =
        receiptsBySender.get(receipt.message.senderAccountId) ?? [];

      messageIds.push(receipt.messageId);
      receiptsBySender.set(receipt.message.senderAccountId, messageIds);
    }

    if (viewer.showReadReceipts) {
      for (const [senderAccountId, messageIds] of receiptsBySender) {
        this.messagingEventsService.emitReceiptUpdated([senderAccountId], {
          conversationId,
          messageIds,
          accountId: viewer.accountId,
          status: 'READ',
          occurredAt: now.toISOString(),
        });
      }
    }

    return {
      message: 'Conversation marked as read.',
      conversationId,
      readMessages: readResult.count,
      readAt: now,
    };
  }
}
