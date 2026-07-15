import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { PrismaService } from '../../database/prisma.service';

const KATHMANDU_OFFSET_MINUTES = 5 * 60 + 45;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const LOGOUT_HOUR = 18;

@Injectable()
export class DailySessionLogoutService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DailySessionLogoutService.name);

  private logoutTimer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.scheduleNextLogout();
  }

  onModuleDestroy(): void {
    if (this.logoutTimer) {
      clearTimeout(this.logoutTimer);
    }
  }

  private scheduleNextLogout(): void {
    const nextLogoutAt = this.getNextKathmanduLogoutAt();
    const delay = nextLogoutAt.getTime() - Date.now();

    this.logger.log(
      `Next daily session logout scheduled for ${nextLogoutAt.toISOString()}.`,
    );

    this.logoutTimer = setTimeout(() => {
      void this.revokeActiveSessionsForDailyLogout().finally(() => {
        this.scheduleNextLogout();
      });
    }, delay);
  }

  private async revokeActiveSessionsForDailyLogout(): Promise<void> {
    const now = new Date();

    // Revoking sessions keeps after-hours login possible while ending current workday sessions.
    const result = await this.prisma.authSession.updateMany({
      where: {
        revokedAt: null,
        expiresAt: {
          gt: now,
        },
      },

      data: {
        revokedAt: now,
      },
    });

    this.logger.log(
      `Daily 6 PM logout revoked ${result.count} active session(s).`,
    );
  }

  private getNextKathmanduLogoutAt(now = new Date()): Date {
    const kathmanduNow = new Date(
      now.getTime() + KATHMANDU_OFFSET_MINUTES * 60 * 1000,
    );

    const logoutLocalTimestamp = Date.UTC(
      kathmanduNow.getUTCFullYear(),
      kathmanduNow.getUTCMonth(),
      kathmanduNow.getUTCDate(),
      LOGOUT_HOUR,
      0,
      0,
      0,
    );

    let logoutUtcTimestamp =
      logoutLocalTimestamp - KATHMANDU_OFFSET_MINUTES * 60 * 1000;

    if (logoutUtcTimestamp <= now.getTime()) {
      logoutUtcTimestamp += DAY_IN_MILLISECONDS;
    }

    return new Date(logoutUtcTimestamp);
  }
}
