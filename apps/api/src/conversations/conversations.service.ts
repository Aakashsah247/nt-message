import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  ConversationType,
  EmployeeStatus,
  EmploymentStatus,
  MessageContentType,
  MessageRequestReason,
  MessageRequestStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { MessagingEventsService } from '../realtime/messaging-events.service';

import { CreatePrivateConversationDto } from './dto/create-private-conversation.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { SearchMessagingContactsQueryDto } from './dto/search-messaging-contacts-query.dto';
import { SendTextMessageDto } from './dto/send-text-message.dto';
import { UpdateTextMessageDto } from './dto/update-text-message.dto';

interface MessagingViewer {
  accountId: string;
  role: AccountRole;
  divisionId: string | null;
  departmentId: string | null;
}

type DeliveryStatus = 'SENT' | 'DELIVERED' | 'READ';

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
} satisfies Prisma.MessageSelect;

type MessageRecord = Prisma.MessageGetPayload<{
  select: typeof messageSelect;
}>;

const conversationSelect = {
  id: true,
  type: true,
  title: true,
  privateParticipantKey: true,
  createdByAccountId: true,
  lastMessageAt: true,
  createdAt: true,
  updatedAt: true,

  participants: {
    orderBy: {
      joinedAt: 'asc',
    },

    select: {
      accountId: true,
      joinedAt: true,
      leftAt: true,
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

@Injectable()
export class ConversationsService {
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

  private getAggregateReceiptDate(
    dates: Array<Date | null>,
  ): Date | null {
    if (dates.length === 0 || dates.some((date) => date === null)) {
      return null;
    }

    return dates.reduce<Date>((latest, date) => {
      const nonNullDate = date as Date;

      return nonNullDate.getTime() > latest.getTime()
        ? nonNullDate
        : latest;
    }, dates[0] as Date);
  }

  private getDeliveryStatus(message: MessageRecord): DeliveryStatus {
    if (message.receipts.length === 0) {
      return 'SENT';
    }

    if (message.receipts.every((receipt) => receipt.readAt !== null)) {
      return 'READ';
    }

    if (
      message.receipts.every(
        (receipt) => receipt.deliveredAt !== null,
      )
    ) {
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
        read: message.receipts.filter(
          (receipt) => receipt.readAt !== null,
        ).length,
      },
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
      createdByAccountId: conversation.createdByAccountId,
      lastMessageAt: conversation.messages[0]?.sentAt ?? null,
      unreadCount,
      isMuted: viewerParticipant?.isMuted ?? false,
      isArchived: viewerParticipant?.isArchived ?? false,
      participants: activeParticipants.map((participant) => ({
        ...this.serializeAccount(participant.account),
        joinedAt: participant.joinedAt,
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
  ): Promise<void> {
    const participant = await this.prisma.conversationParticipant.findUnique({
      where: {
        conversationId_accountId: {
          conversationId,
          accountId,
        },
      },

      select: {
        leftAt: true,
      },
    });

    if (!participant || participant.leftAt !== null) {
      throw new NotFoundException('Conversation was not found.');
    }
  }

  async getActiveParticipantAccountIds(
    user: AuthenticatedUser,
    conversationId: string,
  ): Promise<string[]> {
    await this.getMessagingViewer(user);

    const participants =
      await this.prisma.conversationParticipant.findMany({
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
      this.messagingEventsService.emitReceiptUpdated(
        [group.senderAccountId],
        {
          conversationId: group.conversationId,
          messageIds: group.messageIds,
          accountId,
          status: 'DELIVERED',
          occurredAt: now.toISOString(),
        },
      );
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
      request.requesterAccountId === viewerAccountId
        ? 'SENT'
        : 'RECEIVED';

    const peer =
      direction === 'SENT'
        ? request.recipient
        : request.requester;

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
            createdByAccountId:
              options?.createdByAccountId ?? viewer.accountId,
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

    if (
      !target ||
      !target.isEnabled ||
      !this.isActiveEmployeeAccount(target)
    ) {
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
        existingRequest.respondedAt.getTime() +
          MESSAGE_REQUEST_COOLDOWN_MS,
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
    const sent = serialized.filter(
      (request) => request.direction === 'SENT',
    );

    return {
      received,
      sent,
      counts: {
        receivedPending: received.length,
        sentPending: sent.length,
      },
    };
  }

  async acceptMessageRequest(
    user: AuthenticatedUser,
    requestId: string,
  ) {
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
        data: this.serializeConversation(
          conversation,
          viewer.accountId,
          0,
        ),
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
      request: this.serializeMessageRequest(
        updatedRequest,
        viewer.accountId,
      ),
    };
  }

  async declineMessageRequest(
    user: AuthenticatedUser,
    requestId: string,
  ) {
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
      request: this.serializeMessageRequest(
        updatedRequest,
        viewer.accountId,
      ),
    };
  }

  async blockMessageRequest(
    user: AuthenticatedUser,
    requestId: string,
  ) {
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
      request: this.serializeMessageRequest(
        updatedRequest,
        viewer.accountId,
      ),
    };
  }

  async listConversations(
    user: AuthenticatedUser,
    query: ListConversationsQueryDto,
  ) {
    const viewer = await this.getMessagingViewer(user);
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
    const page = hasMore
      ? conversations.slice(0, query.limit)
      : conversations;

    const conversationIds = page.map((conversation) => conversation.id);

    await this.markReceiptsDelivered(
      viewer.accountId,
      conversationIds,
    );

    const [unreadCounts, visibleLastMessages] = await Promise.all([
      Promise.all(
        conversationIds.map((conversationId) =>
          this.prisma.messageReceipt.count({
            where: {
              accountId: viewer.accountId,
              readAt: null,

              message: {
                is: {
                  conversationId,
                  deletedAt: null,
                  hiddenForAccounts: {
                    none: {
                      accountId: viewer.accountId,
                    },
                  },
                },
              },
            },
          }),
        ),
      ),
      Promise.all(
        conversationIds.map((conversationId) =>
          this.prisma.message.findFirst({
            where: {
              conversationId,
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
          }),
        ),
      ),
    ]);

    return {
      data: page.map((conversation, index) => {
        const visibleLastMessage = visibleLastMessages[index];

        return this.serializeConversation(
          {
            ...conversation,
            messages: visibleLastMessage
              ? [visibleLastMessage]
              : [],
          },
          viewer.accountId,
          unreadCounts[index] ?? 0,
        );
      }),
      pagination: {
        limit: query.limit,
        hasMore,
        nextCursor:
          hasMore && page.length > 0
            ? page[page.length - 1].id
            : null,
      },
    };
  }

  async listMessages(
    user: AuthenticatedUser,
    conversationId: string,
    query: ListMessagesQueryDto,
  ) {
    const viewer = await this.getMessagingViewer(user);

    await this.assertActiveParticipant(
      viewer.accountId,
      conversationId,
    );

    await this.markReceiptsDelivered(
      viewer.accountId,
      [conversationId],
    );

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
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
    const pageDescending = hasMore
      ? messages.slice(0, query.limit)
      : messages;
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

      this.messagingEventsService.emitMessageCreated(
        participantAccountIds,
        {
          conversationId,
          message: serializedMessage,
          occurredAt: new Date().toISOString(),
        },
      );

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

    await this.assertActiveParticipant(
      viewer.accountId,
      conversationId,
    );

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
        'You can edit only messages that you sent.',
      );
    }

    if (message.deletedAt) {
      throw new ConflictException('A deleted message cannot be edited.');
    }

    if (message.contentType !== MessageContentType.TEXT) {
      throw new BadRequestException(
        'Only text messages can be edited.',
      );
    }

    if (
      Date.now() - message.sentAt.getTime() >
      MESSAGE_EDIT_WINDOW_MS
    ) {
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

  async deleteMessageForMe(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);

    await this.assertActiveParticipant(
      viewer.accountId,
      conversationId,
    );

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

    this.messagingEventsService.emitMessageHidden(
      viewer.accountId,
      {
        conversationId,
        messageId: message.id,
        accountId: viewer.accountId,
        occurredAt: now.toISOString(),
      },
    );

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

    await this.assertActiveParticipant(
      viewer.accountId,
      conversationId,
    );

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

  async markConversationRead(
    user: AuthenticatedUser,
    conversationId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);

    await this.assertActiveParticipant(
      viewer.accountId,
      conversationId,
    );

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

    const readResult = await this.prisma.$transaction(
      async (transaction) => {
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
      },
    );

    const receiptsBySender = new Map<string, string[]>();

    for (const receipt of pendingReceipts) {
      const messageIds =
        receiptsBySender.get(receipt.message.senderAccountId) ?? [];

      messageIds.push(receipt.messageId);
      receiptsBySender.set(receipt.message.senderAccountId, messageIds);
    }

    for (const [senderAccountId, messageIds] of receiptsBySender) {
      this.messagingEventsService.emitReceiptUpdated(
        [senderAccountId],
        {
          conversationId,
          messageIds,
          accountId: viewer.accountId,
          status: 'READ',
          occurredAt: now.toISOString(),
        },
      );
    }

    return {
      message: 'Conversation marked as read.',
      conversationId,
      readMessages: readResult.count,
      readAt: now,
    };
  }
}
