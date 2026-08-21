import type { PrismaService } from '../database/prisma.service';
import { DutyNotificationsService } from './duty-notifications.service';
import type { MessagingEventsService } from '../realtime/messaging-events.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('DutyNotificationsService M20 Phase 5', () => {
  const prisma = {
    messagingNotification: {
      create: jest.fn(),
      count: jest.fn(),
    },
  } as unknown as PrismaService;
  const events = {
    emitNotificationCreated: jest.fn(),
    emitDutyScheduleUpdated: jest.fn(),
  } as unknown as MessagingEventsService;
  const service = new DutyNotificationsService(prisma, events);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes account-scoped realtime duty updates', async () => {
    jest.mocked(prisma.messagingNotification.create).mockResolvedValue({
      id: 'notification',
      recipientAccountId: 'employee',
      actorAccountId: 'manager',
      conversationId: null,
      messageId: null,
      announcementId: null,
      type: 'DUTY',
      title: 'Duty assigned',
      body: 'Office Shift',
      isRead: false,
      readAt: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      actor: null,
    } as never);
    jest.mocked(prisma.messagingNotification.count).mockResolvedValue(1);

    await service.publishDutyUpdate({
      assignmentId: 'duty-1',
      employeeAccountId: 'employee',
      action: 'ASSIGNED',
      actorAccountId: 'manager',
      recipientAccountIds: ['employee', 'manager', 'employee'],
      title: 'Duty assigned',
      body: 'Office Shift',
    });

    expect(events.emitDutyScheduleUpdated).toHaveBeenCalledWith(
      ['employee', 'manager'],
      expect.objectContaining({ action: 'ASSIGNED' }),
    );
  });

  it('keeps realtime delivery available when notification persistence fails', async () => {
    jest
      .mocked(prisma.messagingNotification.create)
      .mockRejectedValue(new Error('temporary database error'));

    await expect(
      service.publishDutyUpdate({
        assignmentId: 'duty-1',
        employeeAccountId: 'employee',
        action: 'CHANGED',
        actorAccountId: 'manager',
        recipientAccountIds: ['employee'],
        title: 'Duty changed',
        body: 'Updated shift',
      }),
    ).resolves.toBeUndefined();

    expect(events.emitDutyScheduleUpdated).toHaveBeenCalledWith(
      ['employee'],
      expect.objectContaining({ action: 'CHANGED' }),
    );
  });
});
