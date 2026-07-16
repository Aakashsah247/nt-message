import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

import {
  normalizeOfficialEmailForLookup,
  sanitizeOfficialEmail,
} from '../../common/normalization/account-identity-normalization';
import { PrismaService } from '../../database/prisma.service';
import {
  AccountRole,
  ActivityEventType,
  EmployeeStatus,
  EmploymentStatus,
} from '../../generated/prisma/enums';
import { MailService } from '../../mail/mail.service';
import { CompletePasswordResetDto } from '../dto/complete-password-reset.dto';
import {
  generatePasswordResetOtp,
  generatePasswordResetToken,
  hashPasswordResetOtp,
  hashPasswordResetToken,
  secureHexHashesMatch,
} from './password-recovery-security';

const GENERIC_REQUEST_MESSAGE =
  'If an eligible account exists, a password recovery code has been sent.';

const GENERIC_INVALID_CODE_MESSAGE =
  'The recovery code is invalid, expired or no longer available.';

const GENERIC_INVALID_TOKEN_MESSAGE =
  'The password reset session is invalid, expired or already used.';

interface RecoveryAccount {
  id: string;
  username: string | null;
  role: AccountRole;
  passwordHash: string;
  isEnabled: boolean;
  employee: {
    empName: string;
    officialEmail: string;
    status: EmployeeStatus;
    employmentStatus: EmploymentStatus;
    isActivated: boolean;
    archivedAt: Date | null;
  } | null;
  superAdminProfile: {
    fullName: string;
    email: string;
  } | null;
}

export interface PasswordResetRequestResult {
  message: string;
  resendAfterSeconds: number;
}

export interface PasswordResetVerificationResult {
  message: string;
  resetToken: string;
  expiresInSeconds: number;
}

export interface PasswordResetCompletionResult {
  message: string;
  revokedSessions: number;
}

@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);

  private readonly otpHashSecret: string;
  private readonly otpTtlMinutes: number;
  private readonly resendCooldownSeconds: number;
  private readonly maxAttempts: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    configService: ConfigService,
  ) {
    this.otpHashSecret =
      configService.getOrThrow<string>('OTP_HASH_SECRET');

    this.otpTtlMinutes = this.readPositiveInteger(
      configService,
      'OTP_TTL_MINUTES',
    );

    this.resendCooldownSeconds = this.readPositiveInteger(
      configService,
      'OTP_RESEND_COOLDOWN_SECONDS',
    );

    this.maxAttempts = this.readPositiveInteger(
      configService,
      'OTP_MAX_ATTEMPTS',
    );
  }

  async requestPasswordReset(
    officialEmailInput: string,
  ): Promise<PasswordResetRequestResult> {
    const genericResponse = this.createGenericRequestResponse();

    let officialEmailLookup: string;

    try {
      officialEmailLookup = normalizeOfficialEmailForLookup(
        sanitizeOfficialEmail(officialEmailInput),
      );
    } catch {
      return genericResponse;
    }

    const account = await this.findEligibleAccount(officialEmailLookup);

    if (!account) {
      /*
       * Run the same local HMAC path before returning. Response body and
       * status remain identical for known and unknown email addresses.
       */
      hashPasswordResetOtp(
        randomUUID(),
        randomUUID(),
        generatePasswordResetOtp(),
        this.otpHashSecret,
      );

      return genericResponse;
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.otpTtlMinutes * 60 * 1000,
    );
    const cooldownStart = new Date(
      now.getTime() - this.resendCooldownSeconds * 1000,
    );

    const challengeId = randomUUID();
    const otp = generatePasswordResetOtp();
    const otpHash = hashPasswordResetOtp(
      challengeId,
      account.id,
      otp,
      this.otpHashSecret,
    );

    let challengeCreated = false;

    try {
      challengeCreated = await this.prisma.$transaction(
        async (transaction) => {
          const recentChallenge =
            await transaction.passwordResetChallenge.findFirst({
              where: {
                accountId: account.id,
                consumedAt: null,
                createdAt: {
                  gte: cooldownStart,
                },
              },
              select: {
                id: true,
              },
            });

          if (recentChallenge) {
            return false;
          }

          /*
           * Resend invalidates both the previous OTP and any reset token
           * derived from it. The partial unique index blocks concurrent
           * creation of multiple active challenges.
           */
          await transaction.passwordResetChallenge.updateMany({
            where: {
              accountId: account.id,
              consumedAt: null,
            },
            data: {
              consumedAt: now,
            },
          });

          await transaction.passwordResetChallenge.create({
            data: {
              id: challengeId,
              accountId: account.id,
              otpHash,
              maxAttempts: this.maxAttempts,
              expiresAt,
            },
          });

          return true;
        },
      );
    } catch {
      /*
       * Public recovery requests deliberately return a generic response.
       * Database/provider details stay in server operations, not the UI.
       */
      this.logger.warn(
        'Password recovery request could not be prepared.',
      );

      return genericResponse;
    }

    if (!challengeCreated) {
      return genericResponse;
    }

    try {
      await this.mailService.sendPasswordResetOtp({
        to: this.getNotificationEmail(account),
        displayName: this.getDisplayName(account),
        otp,
        expiresInMinutes: this.otpTtlMinutes,
      });
    } catch {
      /*
       * An undelivered OTP must never remain usable. The response remains
       * generic so mail failure cannot reveal whether the account exists.
       */
      await this.prisma.passwordResetChallenge.updateMany({
        where: {
          id: challengeId,
          consumedAt: null,
        },
        data: {
          consumedAt: new Date(),
        },
      });

      this.logger.warn(
        'Password recovery code was prepared but not delivered.',
      );
    }

    return genericResponse;
  }

  async verifyPasswordResetOtp(
    officialEmailInput: string,
    otpInput: string,
  ): Promise<PasswordResetVerificationResult> {
    const officialEmailLookup = normalizeOfficialEmailForLookup(
      sanitizeOfficialEmail(officialEmailInput),
    );

    const account = await this.findEligibleAccount(officialEmailLookup);

    if (!account) {
      throw new BadRequestException(GENERIC_INVALID_CODE_MESSAGE);
    }

    const otp = otpInput.trim();
    const now = new Date();
    const resetToken = generatePasswordResetToken();
    const resetTokenHash = hashPasswordResetToken(resetToken);
    const resetTokenExpiresAt = new Date(
      now.getTime() + this.otpTtlMinutes * 60 * 1000,
    );

    const verified = await this.prisma.$transaction(
      async (transaction) => {
        const challenge =
          await transaction.passwordResetChallenge.findFirst({
            where: {
              accountId: account.id,
              consumedAt: null,
              verifiedAt: null,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });

        if (!challenge) {
          return false;
        }

        if (
          challenge.expiresAt <= now ||
          challenge.attemptCount >= challenge.maxAttempts
        ) {
          await transaction.passwordResetChallenge.updateMany({
            where: {
              id: challenge.id,
              consumedAt: null,
            },
            data: {
              consumedAt: now,
            },
          });

          return false;
        }

        const incomingHash = hashPasswordResetOtp(
          challenge.id,
          account.id,
          otp,
          this.otpHashSecret,
        );

        if (!secureHexHashesMatch(challenge.otpHash, incomingHash)) {
          /*
           * Increment inside PostgreSQL rather than calculating from the
           * previously read value. Parallel wrong attempts are serialized
           * by the row update and cannot bypass the maximum-attempt limit.
           */
          const attemptUpdate =
            await transaction.passwordResetChallenge.updateMany({
              where: {
                id: challenge.id,
                attemptCount: {
                  lt: challenge.maxAttempts,
                },
                consumedAt: null,
                verifiedAt: null,
              },
              data: {
                attemptCount: {
                  increment: 1,
                },
              },
            });

          if (attemptUpdate.count === 1) {
            const updatedChallenge =
              await transaction.passwordResetChallenge.findUnique({
                where: {
                  id: challenge.id,
                },
                select: {
                  attemptCount: true,
                  maxAttempts: true,
                },
              });

            if (
              updatedChallenge &&
              updatedChallenge.attemptCount >=
                updatedChallenge.maxAttempts
            ) {
              await transaction.passwordResetChallenge.updateMany({
                where: {
                  id: challenge.id,
                  consumedAt: null,
                  verifiedAt: null,
                },
                data: {
                  consumedAt: now,
                },
              });
            }
          }

          return false;
        }

        /*
         * OTP becomes single-use at verification. Only a hash of the new
         * opaque reset token is persisted; the raw token is returned once.
         */
        const claim = await transaction.passwordResetChallenge.updateMany({
          where: {
            id: challenge.id,
            otpHash: challenge.otpHash,
            attemptCount: challenge.attemptCount,
            consumedAt: null,
            verifiedAt: null,
            expiresAt: {
              gt: now,
            },
          },
          data: {
            verifiedAt: now,
            resetTokenHash,
            resetTokenExpiresAt,
          },
        });

        return claim.count === 1;
      },
    );

    if (!verified) {
      throw new BadRequestException(GENERIC_INVALID_CODE_MESSAGE);
    }

    return {
      message: 'Recovery code verified. Create your new password.',
      resetToken,
      expiresInSeconds: this.otpTtlMinutes * 60,
    };
  }

  async completePasswordReset(
    dto: CompletePasswordResetDto,
  ): Promise<PasswordResetCompletionResult> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException(
        'Password confirmation does not match.',
      );
    }

    const resetTokenHash = hashPasswordResetToken(dto.resetToken);
    const now = new Date();

    const challenge =
      await this.prisma.passwordResetChallenge.findUnique({
        where: {
          resetTokenHash,
        },
        include: {
          account: {
            include: {
              employee: true,
              superAdminProfile: true,
            },
          },
        },
      });

    if (
      !challenge ||
      !challenge.verifiedAt ||
      challenge.consumedAt ||
      !challenge.resetTokenExpiresAt ||
      challenge.resetTokenExpiresAt <= now ||
      !this.isEligibleAccount(challenge.account)
    ) {
      throw new BadRequestException(GENERIC_INVALID_TOKEN_MESSAGE);
    }

    const reusesCurrentPassword = await argon2.verify(
      challenge.account.passwordHash,
      dto.newPassword,
    );

    if (reusesCurrentPassword) {
      throw new BadRequestException(
        'New password must be different from the current password.',
      );
    }

    /*
     * Argon2id runs before the transaction because hashing is CPU-intensive
     * and must not extend database lock duration.
     */
    const replacementHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });

    const completion = await this.prisma.$transaction(
      async (transaction) => {
        const challengeClaim =
          await transaction.passwordResetChallenge.updateMany({
            where: {
              id: challenge.id,
              resetTokenHash,
              verifiedAt: {
                not: null,
              },
              consumedAt: null,
              resetTokenExpiresAt: {
                gt: now,
              },
            },
            data: {
              consumedAt: now,
            },
          });

        if (challengeClaim.count !== 1) {
          throw new ConflictException(
            GENERIC_INVALID_TOKEN_MESSAGE,
          );
        }

        /*
         * Previous hash is part of the condition. Concurrent password
         * changes cannot silently overwrite each other.
         */
        const passwordUpdate = await transaction.account.updateMany({
          where: {
            id: challenge.account.id,
            passwordHash: challenge.account.passwordHash,
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
            'The account changed during recovery. Request a new code.',
          );
        }

        const sessionUpdate = await transaction.authSession.updateMany({
          where: {
            accountId: challenge.account.id,
            revokedAt: null,
          },
          data: {
            revokedAt: now,
          },
        });

        /*
         * Consume every outstanding challenge so an older OTP or reset
         * token cannot be used after the password has changed.
         */
        await transaction.passwordResetChallenge.updateMany({
          where: {
            accountId: challenge.account.id,
            consumedAt: null,
          },
          data: {
            consumedAt: now,
          },
        });

        /*
         * Audit contains only the recovery method and session count.
         * Email, OTP, token, password and hash values are excluded.
         */
        await transaction.activityEvent.create({
          data: {
            accountId: challenge.account.id,
            sessionId: null,
            eventType: ActivityEventType.PASSWORD_RESET_COMPLETED,
            pagePath: 'Password recovery',
            elementLabel: 'Password reset completed',
            metadata: {
              recoveryMethod: 'EMAIL_OTP',
              revokedSessions: sessionUpdate.count,
            },
            occurredAt: now,
          },
        });

        return {
          revokedSessions: sessionUpdate.count,
        };
      },
    );

    try {
      /*
       * Mail is sent after commit. Delivery failure cannot restore the old
       * password or reactivate a revoked session.
       */
      await this.mailService.sendPasswordResetNotification({
        to: this.getNotificationEmail(challenge.account),
        displayName: this.getDisplayName(challenge.account),
        changedAt: now,
      });
    } catch {
      this.logger.warn(
        'Password reset completed, but the security email was not delivered.',
      );
    }

    return {
      message:
        'Password reset successfully. Sign in again using your new password.',
      revokedSessions: completion.revokedSessions,
    };
  }

  private async findEligibleAccount(
    officialEmailLookup: string,
  ): Promise<RecoveryAccount | null> {
    const account = await this.prisma.account.findFirst({
      where: {
        isEnabled: true,
        OR: [
          {
            username: {
              equals: officialEmailLookup,
              mode: 'insensitive',
            },
          },
          {
            employee: {
              is: {
                officialEmail: {
                  equals: officialEmailLookup,
                  mode: 'insensitive',
                },
              },
            },
          },
          {
            superAdminProfile: {
              is: {
                email: {
                  equals: officialEmailLookup,
                  mode: 'insensitive',
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
        username: true,
        role: true,
        passwordHash: true,
        isEnabled: true,
        employee: {
          select: {
            empName: true,
            officialEmail: true,
            status: true,
            employmentStatus: true,
            isActivated: true,
            archivedAt: true,
          },
        },
        superAdminProfile: {
          select: {
            fullName: true,
            email: true,
          },
        },
      },
    });

    return account && this.isEligibleAccount(account)
      ? account
      : null;
  }

  private isEligibleAccount(account: RecoveryAccount): boolean {
    if (!account.isEnabled) {
      return false;
    }

    if (account.role === AccountRole.SUPER_ADMIN) {
      return Boolean(
        account.superAdminProfile?.email ?? account.username,
      );
    }

    return Boolean(
      account.employee &&
        account.employee.status === EmployeeStatus.ACTIVE &&
        account.employee.employmentStatus === EmploymentStatus.ACTIVE &&
        account.employee.isActivated &&
        account.employee.archivedAt === null,
    );
  }

  private getNotificationEmail(account: RecoveryAccount): string {
    const email =
      account.superAdminProfile?.email ??
      account.employee?.officialEmail ??
      account.username;

    if (!email) {
      throw new Error(
        'Eligible password recovery account has no official email.',
      );
    }

    return email;
  }

  private getDisplayName(account: RecoveryAccount): string {
    return (
      account.superAdminProfile?.fullName ??
      account.employee?.empName ??
      'NT Message user'
    );
  }

  private createGenericRequestResponse(): PasswordResetRequestResult {
    return {
      message: GENERIC_REQUEST_MESSAGE,
      resendAfterSeconds: this.resendCooldownSeconds,
    };
  }

  private readPositiveInteger(
    configService: ConfigService,
    key: string,
  ): number {
    const value = Number(configService.getOrThrow<string>(key));

    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${key} must be a positive integer.`);
    }

    return value;
  }
}
