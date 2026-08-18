import {
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import * as webPush from 'web-push';
import type { WebPushError } from 'web-push';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import type { DeleteMessagingPushSubscriptionDto } from './dto/delete-messaging-push-subscription.dto';
import type { UpsertMessagingPushSubscriptionDto } from './dto/upsert-messaging-push-subscription.dto';

interface PushableMessagingNotification {
  id: string;
  title: string;
  body: string;
  conversationId: string | null;
  messageId: string | null;
  announcementId: string | null;
}

function asPushableNotification(value: unknown): PushableMessagingNotification | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    typeof record.title !== 'string' ||
    typeof record.body !== 'string'
  ) {
    return null;
  }

  return {
    id: record.id,
    title: record.title,
    body: record.body,
    conversationId:
      typeof record.conversationId === 'string' ? record.conversationId : null,
    messageId: typeof record.messageId === 'string' ? record.messageId : null,
    announcementId:
      typeof record.announcementId === 'string' ? record.announcementId : null,
  };
}

@Injectable()
export class MessagingPushService {
  private readonly logger = new Logger(MessagingPushService.name);
  private readonly publicKey: string;
  private readonly privateKey: string;
  private readonly subject: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.publicKey = config.get<string>('WEB_PUSH_VAPID_PUBLIC_KEY')?.trim() ?? '';
    this.privateKey = config.get<string>('WEB_PUSH_VAPID_PRIVATE_KEY')?.trim() ?? '';
    this.subject = config.get<string>('WEB_PUSH_VAPID_SUBJECT')?.trim() ?? '';

    const configuredTtl = Number(config.get<string>('WEB_PUSH_TTL_SECONDS'));
    this.ttlSeconds = Number.isFinite(configuredTtl) && configuredTtl > 0
      ? Math.min(Math.floor(configuredTtl), 86_400)
      : 300;

    if (process.env.NODE_ENV === 'production' && !this.isConfigured()) {
      this.logger.warn(
        'Background browser notifications are disabled because WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, or WEB_PUSH_VAPID_SUBJECT is missing.',
      );
    }
  }

  getPublicConfig() {
    return {
      enabled: this.isConfigured(),
      publicKey: this.isConfigured() ? this.publicKey : null,
    };
  }

  async upsertSubscription(
    user: AuthenticatedUser,
    dto: UpsertMessagingPushSubscriptionDto,
    userAgent: string | undefined,
  ) {
    if (!this.isConfigured()) {
      return {
        enabled: false,
        subscribed: false,
      };
    }

    const now = new Date();
    const session = await this.prisma.authSession.findFirst({
      where: {
        id: user.sessionId,
        accountId: user.accountId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      select: { id: true },
    });

    if (!session) {
      throw new UnauthorizedException('The current session is no longer active.');
    }

    await this.prisma.messagingPushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        accountId: user.accountId,
        authSessionId: user.sessionId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        showPreview: dto.showPreview,
        isMuted: dto.isMuted,
        userAgent: userAgent?.slice(0, 500) || null,
      },
      update: {
        accountId: user.accountId,
        authSessionId: user.sessionId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        showPreview: dto.showPreview,
        isMuted: dto.isMuted,
        userAgent: userAgent?.slice(0, 500) || null,
      },
    });

    return {
      enabled: true,
      subscribed: true,
    };
  }

  async deleteSubscription(
    user: AuthenticatedUser,
    dto: DeleteMessagingPushSubscriptionDto,
  ) {
    await this.prisma.messagingPushSubscription.deleteMany({
      where: {
        endpoint: dto.endpoint,
        accountId: user.accountId,
      },
    });

    return { subscribed: false };
  }

  async sendNotification(accountId: string, notificationValue: unknown): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    const notification = asPushableNotification(notificationValue);
    if (!notification) {
      return;
    }

    const now = new Date();
    const subscriptions = await this.prisma.messagingPushSubscription.findMany({
      where: {
        accountId,
        isMuted: false,
        account: { is: { isEnabled: true } },
        authSession: {
          is: {
            revokedAt: null,
            expiresAt: { gt: now },
          },
        },
      },
      select: {
        id: true,
        endpoint: true,
        p256dh: true,
        auth: true,
        showPreview: true,
      },
    });

    if (subscriptions.length === 0) {
      return;
    }

    await Promise.allSettled(
      subscriptions.map(async (subscription) => {
        const payload = JSON.stringify({
          notificationId: notification.id,
          title: notification.title,
          body: subscription.showPreview
            ? notification.body
            : 'Open NT Message to view this notification.',
          url: this.notificationUrl(notification),
        });

        try {
          await webPush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.p256dh,
                auth: subscription.auth,
              },
            },
            payload,
            {
              TTL: this.ttlSeconds,
              urgency: 'high',
              topic: createHash('sha256')
                .update(notification.id)
                .digest('base64url')
                .slice(0, 32),
              vapidDetails: {
                subject: this.subject,
                publicKey: this.publicKey,
                privateKey: this.privateKey,
              },
            },
          );

          await this.prisma.messagingPushSubscription.updateMany({
            where: { id: subscription.id },
            data: { lastSuccessfulPushAt: new Date() },
          });
        } catch (error) {
          const statusCode = (error as WebPushError | undefined)?.statusCode;

          if (statusCode === 404 || statusCode === 410) {
            // Push services use 404/410 when the browser subscription no longer exists.
            await this.prisma.messagingPushSubscription.deleteMany({
              where: { id: subscription.id },
            });
            return;
          }

          this.logger.warn(
            `Background notification delivery failed for subscription ${subscription.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );
  }

  private isConfigured(): boolean {
    return Boolean(this.publicKey && this.privateKey && this.subject);
  }

  private notificationUrl(notification: PushableMessagingNotification): string {
    if (notification.announcementId) {
      return `/messages/announcements?announcement=${encodeURIComponent(notification.announcementId)}`;
    }

    if (notification.conversationId) {
      const params = new URLSearchParams({
        conversation: notification.conversationId,
      });

      if (notification.messageId) {
        params.set('message', notification.messageId);
      }

      return `/messages?${params.toString()}`;
    }

    return '/messages/notifications';
  }
}
