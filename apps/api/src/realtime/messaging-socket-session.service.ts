import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

import { PrismaService } from '../database/prisma.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';

interface MessagingSocketSessionRegistration {
  socketId: string;
  user: AuthenticatedUser;
  accessTokenExpiresAt: Date;
  invalidate: () => void;
}

interface RegisteredMessagingSocketSession
  extends MessagingSocketSessionRegistration {
  accessTokenExpiresAtMs: number;
}

const SESSION_REVALIDATION_INTERVAL_MS = 5_000;

@Injectable()
export class MessagingSocketSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(MessagingSocketSessionService.name);
  private readonly registrations = new Map<
    string,
    RegisteredMessagingSocketSession
  >();
  private validationTimer: ReturnType<typeof setInterval> | null = null;
  private validationInFlight = false;

  constructor(private readonly prisma: PrismaService) {}

  register(input: MessagingSocketSessionRegistration): void {
    this.registrations.set(input.socketId, {
      ...input,
      accessTokenExpiresAtMs: input.accessTokenExpiresAt.getTime(),
    });

    this.ensureValidationTimer();
  }

  unregister(socketId: string): void {
    this.registrations.delete(socketId);

    if (this.registrations.size === 0) {
      this.clearValidationTimer();
    }
  }

  async validateNow(): Promise<void> {
    if (this.validationInFlight || this.registrations.size === 0) {
      return;
    }

    this.validationInFlight = true;

    try {
      await this.validateRegisteredSessions();
    } catch {
      /*
       * A transient database failure must not mass-disconnect authenticated
       * employees. The next scheduled validation retries automatically.
       */
      this.logger.warn(
        'Messaging socket sessions could not be revalidated; retrying on the next interval.',
      );
    } finally {
      this.validationInFlight = false;
    }
  }

  onModuleDestroy(): void {
    this.clearValidationTimer();
    this.registrations.clear();
  }

  private ensureValidationTimer(): void {
    if (this.validationTimer) {
      return;
    }

    this.validationTimer = setInterval(() => {
      void this.validateNow();
    }, SESSION_REVALIDATION_INTERVAL_MS);

    this.validationTimer.unref?.();
  }

  private clearValidationTimer(): void {
    if (!this.validationTimer) {
      return;
    }

    clearInterval(this.validationTimer);
    this.validationTimer = null;
  }

  private async validateRegisteredSessions(): Promise<void> {
    const now = Date.now();
    const activeRegistrations = [...this.registrations.values()].filter(
      (registration) => {
        if (registration.accessTokenExpiresAtMs <= now) {
          this.invalidateRegistration(registration);
          return false;
        }

        return true;
      },
    );

    if (activeRegistrations.length === 0) {
      return;
    }

    const sessionIds = [
      ...new Set(
        activeRegistrations.map((registration) => registration.user.sessionId),
      ),
    ];

    /*
     * One indexed query validates every connected messaging socket. This avoids
     * a per-socket polling query while still closing revoked/disabled sessions
     * quickly enough for realtime authorization boundaries.
     */
    const sessions = await this.prisma.authSession.findMany({
      where: {
        id: {
          in: sessionIds,
        },
      },
      select: {
        id: true,
        accountId: true,
        revokedAt: true,
        expiresAt: true,
        account: {
          select: {
            isEnabled: true,
            role: true,
          },
        },
      },
    });

    const sessionById = new Map(sessions.map((session) => [session.id, session]));

    for (const registration of activeRegistrations) {
      const session = sessionById.get(registration.user.sessionId);
      const invalid =
        !session ||
        session.accountId !== registration.user.accountId ||
        session.revokedAt !== null ||
        session.expiresAt.getTime() <= now ||
        !session.account.isEnabled ||
        session.account.role !== registration.user.role;

      if (invalid) {
        this.invalidateRegistration(registration);
      }
    }
  }

  private invalidateRegistration(
    registration: RegisteredMessagingSocketSession,
  ): void {
    if (!this.registrations.delete(registration.socketId)) {
      return;
    }

    try {
      registration.invalidate();
    } catch {
      this.logger.warn(
        `Messaging socket ${registration.socketId} could not be disconnected after session invalidation.`,
      );
    }

    if (this.registrations.size === 0) {
      this.clearValidationTimer();
    }
  }
}
