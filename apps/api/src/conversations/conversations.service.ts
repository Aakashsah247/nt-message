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
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';

import { CreatePrivateConversationDto } from './dto/create-private-conversation.dto';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { ListMessagesQueryDto } from './dto/list-messages-query.dto';
import { SendTextMessageDto } from './dto/send-text-message.dto';

interface MessagingViewer {
  accountId: string;
  role: AccountRole;
  divisionId: string | null;
  departmentId: string | null;
}

type DeliveryStatus = 'SENT' | 'DELIVERED' | 'READ';

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

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

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

  private assertTargetInsideViewerScope(
    viewer: MessagingViewer,
    target: MessagingAccountRecord,
  ): void {
    if (target.role === AccountRole.SUPER_ADMIN) {
      return;
    }

    const employee = target.employee;

    if (!employee) {
      throw new NotFoundException(
        'The selected messaging account was not found.',
      );
    }

    if (
      viewer.role === AccountRole.SENIOR_MANAGEMENT &&
      employee.divisionId !== viewer.divisionId
    ) {
      throw new ForbiddenException(
        'You can start private conversations only inside your assigned division.',
      );
    }

    if (
      viewer.role === AccountRole.TEAM_MANAGER &&
      (employee.divisionId !== viewer.divisionId ||
        employee.departmentId !== viewer.departmentId)
    ) {
      throw new ForbiddenException(
        'You can start private conversations only inside your assigned department.',
      );
    }
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
      lastMessageAt: conversation.lastMessageAt,
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

  private async markReceiptsDelivered(
    accountId: string,
    conversationIds: string[],
  ): Promise<number> {
    if (conversationIds.length === 0) {
      return 0;
    }

    const now = new Date();

    const result = await this.prisma.messageReceipt.updateMany({
      where: {
        accountId,
        deliveredAt: null,

        message: {
          is: {
            conversationId: {
              in: conversationIds,
            },
          },
        },
      },

      data: {
        deliveredAt: now,
      },
    });

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

    this.assertTargetInsideViewerScope(viewer, target);

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

    const conversationId = await this.prisma.$transaction(async (transaction) => {
      const conversation = await transaction.conversation.upsert({
        where: {
          privateParticipantKey,
        },

        update: {},

        create: {
          type: ConversationType.PRIVATE,
          privateParticipantKey,
          createdByAccountId: viewer.accountId,
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

      return conversation.id;
    });

    const conversation = await this.getConversationRecord(conversationId);

    return {
      message: existingConversation
        ? 'Private conversation reopened successfully.'
        : 'Private conversation created successfully.',
      created: existingConversation === null,
      data: this.serializeConversation(
        conversation,
        viewer.accountId,
        0,
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

    const unreadCounts = await Promise.all(
      conversationIds.map((conversationId) =>
        this.prisma.messageReceipt.count({
          where: {
            accountId: viewer.accountId,
            readAt: null,

            message: {
              is: {
                conversationId,
                deletedAt: null,
              },
            },
          },
        }),
      ),
    );

    return {
      data: page.map((conversation, index) =>
        this.serializeConversation(
          conversation,
          viewer.accountId,
          unreadCounts[index] ?? 0,
        ),
      ),
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

      return {
        message: 'Message sent successfully.',
        duplicate: false,
        data: this.serializeMessage(createdMessage),
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

  async markConversationRead(
    user: AuthenticatedUser,
    conversationId: string,
  ) {
    const viewer = await this.getMessagingViewer(user);

    await this.assertActiveParticipant(
      viewer.accountId,
      conversationId,
    );

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
              },
            },
          },

          data: {
            readAt: now,
          },
        });
      },
    );

    return {
      message: 'Conversation marked as read.',
      conversationId,
      readMessages: readResult.count,
      readAt: now,
    };
  }
}
