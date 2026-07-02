import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

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
import { SendTextMessageDto } from './dto/send-text-message.dto';
import { UpdateGroupConversationDto } from './dto/update-group-conversation.dto';
import { UpdateGroupMemberRoleDto } from './dto/update-group-member-role.dto';
import { UpdateTextMessageDto } from './dto/update-text-message.dto';
import { ReactMessageDto } from './dto/react-message.dto';

interface MessagingViewer {
  accountId: string;
  role: AccountRole;
  divisionId: string | null;
  departmentId: string | null;
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

export interface ForwardedMessageMetadata {
  sourceMessageId: string;
  sourceConversationId: string;
  originalSenderAccountId: string;
  originalSenderDisplayName: string;
  originalSentAt: string;
  originalTextContent: string;
}

const MESSAGE_REQUEST_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

const messagingAccountSelect = {
  id: true,
  username: true,
  role: true,
  isEnabled: true,

  employee: {
    select: {
      id: true,
      empId: true,
      empName: true,
      designation: true,
      profilePhotoKey: true,
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
} satisfies Prisma.MessageSelect;

type MessageRecord = Prisma.MessageGetPayload<{
  select: typeof messageSelect;
}>;

const conversationSelect = {
  id: true,
  type: true,
  title: true,
  description: true,
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

@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messagingEventsService: MessagingEventsService,
  ) {}

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
    };
  }

  private serializeAccount(account: MessagingAccountRecord) {
    const employee = account.employee;

    return {
      accountId: account.id,
      username: account.username,
      role: account.role,
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
            profilePhotoKey: employee.profilePhotoKey,
            division: employee.division,
            department: employee.departmentUnit,
          }
        : null,
    };
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

  private getDeliveryStatus(message: MessageRecord): DeliveryStatus {
    if (message.receipts.length === 0) {
      return 'SENT';
    }

    if (message.receipts.every((receipt) => receipt.readAt !== null)) {
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

  private serializeMessage(message: MessageRecord) {
    const deliveredAt = this.getAggregateReceiptDate(
      message.receipts.map((receipt) => receipt.deliveredAt),
    );

    const readAt = this.getAggregateReceiptDate(
      message.receipts.map((receipt) => receipt.readAt),
    );

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
      sentAt: message.sentAt,
      editedAt: message.editedAt,
      deletedAt: message.deletedAt,
      isDeleted: message.deletedAt !== null,
      deliveryStatus: this.getDeliveryStatus(message),
      deliveredAt,
      readAt,
      receiptSummary: {
        total: message.receipts.length,
        delivered: message.receipts.filter(
          (receipt) => receipt.deliveredAt !== null,
        ).length,
        read: message.receipts.filter((receipt) => receipt.readAt !== null)
          .length,
      },

      reactions:
        message.reactions?.map((reaction) => ({
          accountId: reaction.accountId,
          reactionValue: reaction.reactionValue,
          account: this.serializeAccount(reaction.account),
          createdAt: reaction.createdAt,
          updatedAt: reaction.updatedAt,
        })) ?? [],

      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
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

    return {
      id: conversation.id,
      type: conversation.type,
      title:
        conversation.type === ConversationType.PRIVATE && privatePeer
          ? this.serializeAccount(privatePeer).displayName
          : conversation.title,
      description: conversation.description,
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
      unreadCount,
      isMuted: viewerParticipant?.isMuted ?? false,
      isArchived: viewerParticipant?.isArchived ?? false,
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
        ? this.serializeMessage(conversation.messages[0])
        : null,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
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

    const [existingConversations, existingRequests] = await Promise.all([
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

      if (conversationKeys.has(participantKey)) {
        contactMode = 'DIRECT';
      } else if (request?.status === MessageRequestStatus.BLOCKED) {
        contactMode = 'BLOCKED';
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

    const now = new Date();
    const updatedRequest = await this.prisma.messageRequest.update({
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

    const conversations = await this.prisma.conversation.findMany({
      where: {
        participants: {
          some: {
            accountId: viewer.accountId,
            leftAt: null,
            isArchived: false,
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

    const hasMore = conversations.length > query.limit;
    const page = hasMore ? conversations.slice(0, query.limit) : conversations;

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
        .map((message) => this.serializeMessage(message)),
      pagination: {
        limit: query.limit,
        hasMore,
        nextCursor,
      },
    };
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

    if (
      sourceMessage.contentType !== MessageContentType.TEXT ||
      !sourceMessage.textContent
    ) {
      throw new BadRequestException(
        'Only active text messages can be forwarded.',
      );
    }

    const forwardedTextContent = sourceMessage.textContent;
    const destinationConversationIds = [
      ...new Set(dto.destinationConversationIds),
    ];
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
      originalTextContent: forwardedTextContent,
    };

    const forwardedMessages = await this.prisma.$transaction(
      async (transaction) => {
        const results: Array<{
          message: MessageRecord;
          duplicate: boolean;
          participantAccountIds: string[];
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
              contentType: MessageContentType.TEXT,
              textContent: forwardedTextContent,
              payload: {
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

    for (const [senderAccountId, messageIds] of receiptsBySender) {
      this.messagingEventsService.emitReceiptUpdated([senderAccountId], {
        conversationId,
        messageIds,
        accountId: viewer.accountId,
        status: 'READ',
        occurredAt: now.toISOString(),
      });
    }

    return {
      message: 'Conversation marked as read.',
      conversationId,
      readMessages: readResult.count,
      readAt: now,
    };
  }
}
