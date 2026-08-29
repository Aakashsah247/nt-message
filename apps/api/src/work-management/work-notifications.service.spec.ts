import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  MessagingNotificationType,
  WorkItemStatus,
} from '../generated/prisma/enums';
import type { MessagingEventsService } from '../realtime/messaging-events.service';
import { WorkNotificationsService } from './work-notifications.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('WorkNotificationsService', () => {
  const prisma = {
    messagingNotification: {
      create: jest.fn(),
      count: jest.fn(),
    },
    workItem: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    departmentTeamMember: {
      findMany: jest.fn(),
    },
  } as unknown as PrismaService;
  const events = {
    emitNotificationCreated: jest.fn(),
    emitWorkItemUpdated: jest.fn(),
  } as unknown as MessagingEventsService;
  const service = new WorkNotificationsService(prisma, events);

  beforeEach(() => {
    // Restore service spies so one deadline test cannot replace later realtime behavior.
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('creates recipient notifications and emits an account-scoped work update', async () => {
    jest.mocked(prisma.messagingNotification.create).mockResolvedValue({
      id: 'notification-1',
      recipientAccountId: 'employee',
      actorAccountId: 'manager',
      conversationId: null,
      messageId: null,
      announcementId: null,
      type: MessagingNotificationType.WORK_ITEM,
      title: 'New work assigned',
      body: 'NT-PAT-NET-2026-000001: Repair wire',
      isRead: false,
      readAt: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
      actor: {
        id: 'manager',
        username: 'manager@ntc.test',
        role: AccountRole.TEAM_MANAGER,
        profilePhotoKey: null,
        profileBio: null,
        showOnlineStatus: true,
        showReadReceipts: true,
        employee: null,
      },
    } as never);
    jest.mocked(prisma.messagingNotification.count).mockResolvedValue(2);

    await service.publishWorkUpdate({
      workItem: {
        id: 'work-1',
        ticketNumber: 'NT-PAT-NET-2026-000001',
        title: 'Repair wire',
        status: WorkItemStatus.ASSIGNED,
      },
      action: 'CREATED',
      actorAccountId: 'manager',
      recipientAccountIds: ['manager', 'employee', 'employee'],
      title: 'New work assigned',
      body: 'NT-PAT-NET-2026-000001: Repair wire',
    });

    expect(prisma.messagingNotification.create).toHaveBeenCalledTimes(1);
    expect(prisma.messagingNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          recipientAccountId: 'employee',
          type: MessagingNotificationType.WORK_ITEM,
        }),
      }),
    );
    expect(events.emitNotificationCreated).toHaveBeenCalledWith(
      'employee',
      expect.objectContaining({ unreadCount: 2 }),
    );
    expect(events.emitWorkItemUpdated).toHaveBeenCalledWith(
      ['manager', 'employee'],
      expect.objectContaining({ action: 'CREATED', workItemId: 'work-1' }),
    );
  });

  it('notifies the whole Primary Team, Sales Member and Supporting Staff once when work is created', async () => {
    jest.mocked(prisma.departmentTeamMember.findMany).mockResolvedValue([
      { employee: { account: { id: 'team-member' } } },
      { employee: { account: { id: 'team-admin' } } },
    ] as never);
    jest.mocked(prisma.messagingNotification.create).mockImplementation(
      async ({ data }: { data: { recipientAccountId: string } }) =>
        ({
          id: `notification-${data.recipientAccountId}`,
          recipientAccountId: data.recipientAccountId,
          actorAccountId: 'manager',
          conversationId: null,
          messageId: null,
          announcementId: null,
          type: MessagingNotificationType.WORK_ITEM,
          title: 'New work assigned',
          body: 'NT-PAT-NET-2026-000001: Repair wire',
          isRead: false,
          readAt: null,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          actor: null,
        }) as never,
    );
    jest.mocked(prisma.messagingNotification.count).mockResolvedValue(1);

    await service.publishWorkUpdate({
      workItem: {
        id: 'work-1',
        ticketNumber: 'NT-PAT-NET-2026-000001',
        title: 'Repair wire',
        status: WorkItemStatus.ASSIGNED,
        assignedTeamId: 'team-a',
        salesMemberAccountId: 'sales-member',
      },
      action: 'CREATED',
      actorAccountId: 'manager',
      recipientAccountIds: [
        'manager',
        'team-admin',
        'sales-member',
        'support-member',
        'support-member',
      ],
      title: 'New work assigned',
      body: 'NT-PAT-NET-2026-000001: Repair wire',
    });

    expect(prisma.messagingNotification.create).toHaveBeenCalledTimes(4);
    expect(prisma.messagingNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipientAccountId: 'support-member' }),
      }),
    );
    expect(events.emitWorkItemUpdated).toHaveBeenCalledWith(
      [
        'manager',
        'team-admin',
        'sales-member',
        'support-member',
        'team-member',
      ],
      expect.objectContaining({ workItemId: 'work-1' }),
    );
  });

  it('keeps shared team Start realtime for everyone without creating noisy participant notifications', async () => {
    jest.mocked(prisma.departmentTeamMember.findMany).mockResolvedValue([
      { employee: { account: { id: 'starter' } } },
      { employee: { account: { id: 'team-member' } } },
    ] as never);
    jest.mocked(prisma.messagingNotification.create).mockImplementation(
      async ({ data }: { data: { recipientAccountId: string } }) =>
        ({
          id: `notification-${data.recipientAccountId}`,
          recipientAccountId: data.recipientAccountId,
          actorAccountId: 'starter',
          conversationId: null,
          messageId: null,
          announcementId: null,
          type: MessagingNotificationType.WORK_ITEM,
          title: 'Work started',
          body: 'NT-PAT-NET-2026-000001: Repair wire',
          isRead: false,
          readAt: null,
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
          actor: null,
        }) as never,
    );
    jest.mocked(prisma.messagingNotification.count).mockResolvedValue(1);

    await service.publishWorkUpdate({
      workItem: {
        id: 'work-1',
        ticketNumber: 'NT-PAT-NET-2026-000001',
        title: 'Repair wire',
        status: WorkItemStatus.IN_PROGRESS,
        assignedTeamId: 'team-a',
        salesMemberAccountId: 'sales-member',
      },
      action: 'STARTED',
      actorAccountId: 'starter',
      recipientAccountIds: [
        'starter',
        'manager',
        'support-member',
        'sales-member',
      ],
      notificationRecipientAccountIds: ['manager'],
      title: 'Work started',
      body: 'NT-PAT-NET-2026-000001: Repair wire',
    });

    expect(prisma.messagingNotification.create).toHaveBeenCalledTimes(1);
    expect(prisma.messagingNotification.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ recipientAccountId: 'manager' }),
      }),
    );
    expect(events.emitWorkItemUpdated).toHaveBeenCalledWith(
      [
        'starter',
        'manager',
        'support-member',
        'sales-member',
        'team-member',
      ],
      expect.objectContaining({ action: 'STARTED', workItemId: 'work-1' }),
    );
  });

  it('marks due-soon reminders after publishing them once', async () => {
    const dueAt = new Date(Date.now() + 30 * 60 * 1000);
    jest.mocked(prisma.workItem.findMany).mockResolvedValue([
      {
        id: 'work-1',
        ticketNumber: 'NT-PAT-NET-2026-000001',
        title: 'Repair wire',
        status: WorkItemStatus.IN_PROGRESS,
        dueAt,
        dueSoonNotifiedAt: null,
        overdueNotifiedAt: null,
        responsibleManagerAccountId: 'manager',
        assignments: [{ assigneeAccountId: 'employee' }],
      },
    ] as never);
    jest.mocked(prisma.workItem.updateMany).mockResolvedValue({ count: 1 });
    const publish = jest
      .spyOn(service, 'publishWorkUpdate')
      .mockResolvedValue(undefined);

    await service.processDeadlineNotifications();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DUE_SOON',
        recipientAccountIds: ['manager', 'employee'],
      }),
    );
    expect(prisma.workItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'work-1',
        dueSoonNotifiedAt: null,
      },
      data: {
        dueSoonNotifiedAt: expect.any(Date),
      },
    });
  });

  it('marks overdue reminders independently from due-soon delivery', async () => {
    const dueAt = new Date(Date.now() - 5 * 60 * 1000);
    jest.mocked(prisma.workItem.findMany).mockResolvedValue([
      {
        id: 'work-2',
        ticketNumber: 'NT-PAT-NET-2026-000002',
        title: 'Inspect distribution box',
        status: WorkItemStatus.IN_PROGRESS,
        dueAt,
        dueSoonNotifiedAt: new Date(Date.now() - 60 * 60 * 1000),
        overdueNotifiedAt: null,
        responsibleManagerAccountId: 'manager',
        assignments: [{ assigneeAccountId: 'employee' }],
      },
    ] as never);
    jest.mocked(prisma.workItem.updateMany).mockResolvedValue({ count: 1 });
    const publish = jest
      .spyOn(service, 'publishWorkUpdate')
      .mockResolvedValue(undefined);

    await service.processDeadlineNotifications();

    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'OVERDUE' }),
    );
    expect(prisma.workItem.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'work-2',
        overdueNotifiedAt: null,
      },
      data: {
        overdueNotifiedAt: expect.any(Date),
      },
    });
  });

  it('keeps realtime delivery available when a notification record fails', async () => {
    jest
      .mocked(prisma.messagingNotification.create)
      .mockRejectedValue(new Error('temporary database error'));

    await expect(
      service.publishWorkUpdate({
        workItem: {
          id: 'work-1',
          ticketNumber: 'NT-PAT-NET-2026-000001',
          title: 'Repair wire',
          status: WorkItemStatus.IN_PROGRESS,
        },
        action: 'STARTED',
        actorAccountId: 'employee',
        recipientAccountIds: ['employee', 'manager'],
        title: 'Work started',
        body: 'NT-PAT-NET-2026-000001: Repair wire',
      }),
    ).resolves.toBeUndefined();

    expect(events.emitWorkItemUpdated).toHaveBeenCalledWith(
      ['employee', 'manager'],
      expect.objectContaining({ action: 'STARTED' }),
    );
  });
});
