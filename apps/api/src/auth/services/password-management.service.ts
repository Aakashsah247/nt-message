import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';

import { PrismaService } from '../../database/prisma.service';
import { ActivityEventType } from '../../generated/prisma/enums';
import { MailService } from '../../mail/mail.service';
import { ChangePasswordDto } from '../dto/change-password.dto';

export interface ChangePasswordResult {
  message: string;
  revokedSessions: number;
}

@Injectable()
export class PasswordManagementService {
  private readonly logger = new Logger(PasswordManagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async changePassword(
    accountId: string,
    sessionId: string,
    dto: ChangePasswordDto,
  ): Promise<ChangePasswordResult> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('Password confirmation does not match.');
    }

    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        username: true,
        passwordHash: true,
        isEnabled: true,
        employee: { select: { empName: true, officialEmail: true } },
        superAdminProfile: { select: { fullName: true, email: true } },
      },
    });

    if (!account || !account.isEnabled) {
      throw new UnauthorizedException('Authenticated account is unavailable.');
    }

    /*
     * Passwords are opaque secrets. Never trim, lowercase or Unicode-normalize
     * them because any transformation changes the credential being verified.
     */
    const currentPasswordMatches = await argon2.verify(
      account.passwordHash,
      dto.currentPassword,
    );

    if (!currentPasswordMatches) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const reusesCurrentPassword = await argon2.verify(
      account.passwordHash,
      dto.newPassword,
    );

    if (reusesCurrentPassword) {
      throw new BadRequestException(
        'New password must be different from the current password.',
      );
    }

    /*
     * Argon2id is intentionally executed before the transaction. Password
     * hashing is CPU-intensive and must not hold database locks open.
     */
    const replacementHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });

    const now = new Date();

    const revokedSessions = await this.prisma.$transaction(
      async (transaction) => {
        /*
         * The old hash is part of the update condition. Two concurrent
         * requests cannot both replace the same password successfully.
         */
        const passwordUpdate = await transaction.account.updateMany({
          where: {
            id: account.id,
            passwordHash: account.passwordHash,
            isEnabled: true,
          },
          data: {
            passwordHash: replacementHash,
            passwordChangedAt: now,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });

        if (passwordUpdate.count !== 1) {
          throw new ConflictException(
            'Password changed concurrently. Sign in again and retry.',
          );
        }

        /*
         * Revoke every device, including the current one. Access-token
         * validation checks this row on every protected request, so a
         * revoked session becomes unusable immediately.
         */
        const sessionUpdate = await transaction.authSession.updateMany({
          where: { accountId: account.id, revokedAt: null },
          data: { revokedAt: now },
        });

        /*
         * Audit metadata is deliberately limited to safe operational data.
         * Passwords, hashes, OTPs, email bodies and provider errors must
         * never be persisted here.
         */
        await transaction.activityEvent.create({
          data: {
            accountId: account.id,
            sessionId,
            eventType: ActivityEventType.PASSWORD_CHANGED,
            pagePath: 'Settings',
            elementLabel: 'Password changed',
            metadata: { revokedSessions: sessionUpdate.count },
            occurredAt: now,
          },
        });

        return sessionUpdate.count;
      },
    );

    /*
     * Resolve notification identity from persisted account data. The Super
     * Admin bootstrap values in .env are never a runtime password source.
     */
    const notificationEmail =
      account.superAdminProfile?.email ??
      account.employee?.officialEmail ??
      account.username;

    const displayName =
      account.superAdminProfile?.fullName ??
      account.employee?.empName ??
      'NT Message user';

    if (notificationEmail) {
      try {
        /*
         * Email delivery happens after commit. A mail outage must never
         * restore the old password or reactivate revoked sessions.
         */
        await this.mailService.sendPasswordChangedNotification({
          to: notificationEmail,
          displayName,
          changedAt: now,
        });
      } catch {
        // Keep logs free of SMTP responses, credentials and stack traces.
        this.logger.warn(
          'Password changed, but the security notification email was not delivered.',
        );
      }
    } else {
      this.logger.warn(
        'Password changed, but the account has no security notification email.',
      );
    }

    /*
     * SUPER_ADMIN_INITIAL_PASSWORD is bootstrap-only. Normal password
     * management updates PostgreSQL and never reads or rewrites .env.
     */
    return {
      message: 'Password changed successfully. Sign in again on every device.',
      revokedSessions,
    };
  }
}
