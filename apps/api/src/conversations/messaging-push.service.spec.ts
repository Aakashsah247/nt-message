import * as webPush from 'web-push';

import { MessagingPushService } from './messaging-push.service';

jest.mock('web-push', () => ({
  __esModule: true,
  sendNotification: jest.fn(),
}));

function makeConfig(values: Record<string, string>) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

describe('MessagingPushService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not expose a public key until all VAPID settings are configured', () => {
    const service = new MessagingPushService(
      {} as never,
      makeConfig({ WEB_PUSH_VAPID_PUBLIC_KEY: 'public-only' }) as never,
    );

    expect(service.getPublicConfig()).toEqual({
      enabled: false,
      publicKey: null,
    });
  });

  it('uses device preview preference and removes expired browser subscriptions', async () => {
    const prisma = {
      messagingPushSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sub-1',
            endpoint: 'https://fcm.googleapis.com/fcm/send/subscription',
            p256dh: 'p256dh-key',
            auth: 'auth-key',
            showPreview: false,
          },
        ]),
        updateMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    (webPush.sendNotification as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Gone'), { statusCode: 410 }),
    );

    const service = new MessagingPushService(
      prisma as never,
      makeConfig({
        WEB_PUSH_VAPID_PUBLIC_KEY: 'public-key',
        WEB_PUSH_VAPID_PRIVATE_KEY: 'private-key',
        WEB_PUSH_VAPID_SUBJECT: 'mailto:ops@example.com',
      }) as never,
    );

    await service.sendNotification('account-1', {
      id: 'notification-1',
      title: 'Aakash sent a message',
      body: 'Sensitive preview text',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      announcementId: null,
    });

    expect(webPush.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: 'https://fcm.googleapis.com/fcm/send/subscription',
      }),
      expect.stringContaining('Open NT Message to view this notification.'),
      expect.objectContaining({ urgency: 'high', timeout: 10_000 }),
    );
    expect(prisma.messagingPushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
    });
  });

  it('removes a previously stored untrusted endpoint without contacting it', async () => {
    const prisma = {
      messagingPushSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sub-internal',
            endpoint: 'https://127.0.0.1:8443/private',
            p256dh: 'p256dh-key',
            auth: 'auth-key',
            showPreview: true,
          },
        ]),
        updateMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const service = new MessagingPushService(
      prisma as never,
      makeConfig({
        WEB_PUSH_VAPID_PUBLIC_KEY: 'public-key',
        WEB_PUSH_VAPID_PRIVATE_KEY: 'private-key',
        WEB_PUSH_VAPID_SUBJECT: 'mailto:ops@example.com',
      }) as never,
    );

    await service.sendNotification('account-1', {
      id: 'notification-1',
      title: 'Aakash sent a message',
      body: 'Sensitive preview text',
      conversationId: 'conversation-1',
      messageId: 'message-1',
      announcementId: null,
    });

    expect(webPush.sendNotification).not.toHaveBeenCalled();
    expect(prisma.messagingPushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { id: 'sub-internal' },
    });
  });
});
