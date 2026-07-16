import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { maskNepalPhoneNumber } from '../common/normalization/account-identity-normalization';
import {
  buildActivationInvitationUrl,
  getActivationRoleName,
  hashActivationInvitationToken,
  prepareActivationInvitation,
  type PreparedActivationInvitation,
} from './activation-invitation-security';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRequestActionType,
  AccountRequestStatus,
  AccountRole,
  ActivationEmailDeliveryStatus,
  EmployeeStatus,
} from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';
import {
  MailDeliveryError,
  MailService,
  type MailDeliveryFailureCategory,
} from '../mail/mail.service';

export type ActivationInvitationSource =
  | 'SUPER_ADMIN_DIRECT_CREATION'
  | 'SUPER_ADMIN_APPROVAL'
  | 'AUTHORIZED_RESEND';

interface QueueInvitationInput {
  accountRequestId: string;
  employeeId: string;
  actorAccountId: string;
  source: ActivationInvitationSource;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface QueuedActivationInvitation {
  id: string;
  accountRequestId: string;
  employeeId: string;
  actorAccountId: string;
  source: ActivationInvitationSource;
  rawToken: string;
  expiresAt: Date;
}

interface DeliverInvitationInput extends QueuedActivationInvitation {
  employeeName: string;
  employeeCode: string;
  officialEmail: string;
  phoneNumber: string;
  divisionName: string;
  departmentName: string | null;
  requestedRole: AccountRole;
}

export interface ActivationEmailDeliveryOutcome {
  status: ActivationEmailDeliveryStatus;
  attemptedAt: Date;
  sentAt: Date | null;
  failureCategory: string | null;
}

export interface ActivationInvitationPreview {
  employee: {
    empName: string;
    officialEmail: string;
  };
  organization: {
    divisionId: string;
    divisionName: string;
    departmentId: string | null;
    departmentName: string | null;
  };
  requestedRole: AccountRole;
  expiresAt: Date;
}

@Injectable()
export class ActivationInvitationsService {
  private readonly logger = new Logger(ActivationInvitationsService.name);
  private readonly webOrigin: string;
  private readonly invitationTtlHours: number;
  private readonly resendCooldownSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    configService: ConfigService,
  ) {
    this.webOrigin = configService
      .getOrThrow<string>('WEB_ORIGIN')
      .replace(/\/+$/, '');

    this.invitationTtlHours = this.readPositiveInteger(
      configService,
      'ACTIVATION_INVITATION_TTL_HOURS',
    );

    // Reuse the established activation resend cooldown instead of adding a
    // second overlapping setting for invitation and OTP delivery.
    this.resendCooldownSeconds = this.readPositiveInteger(
      configService,
      'OTP_RESEND_COOLDOWN_SECONDS',
    );
  }

  prepareInvitation(now = new Date()): PreparedActivationInvitation {
    return prepareActivationInvitation(this.invitationTtlHours, now);
  }

  getResendCooldownRemainingSeconds(
    lastAttemptAt: Date | null,
    now = new Date(),
  ): number {
    if (!lastAttemptAt) {
      return 0;
    }

    const availableAt =
      lastAttemptAt.getTime() + this.resendCooldownSeconds * 1000;

    return Math.max(0, Math.ceil((availableAt - now.getTime()) / 1000));
  }

  getResendAvailableAt(attemptedAt: Date): Date {
    return new Date(attemptedAt.getTime() + this.resendCooldownSeconds * 1000);
  }

  async queueInvitation(
    transaction: Prisma.TransactionClient,
    input: QueueInvitationInput,
    prepared: PreparedActivationInvitation,
  ): Promise<QueuedActivationInvitation> {
    const queuedAt = new Date();

    /*
     * Only one unused invitation may be active for a request. Initial issue
     * and future resend therefore share the same canonical invalidation rule.
     */
    await transaction.activationInvitation.updateMany({
      where: {
        accountRequestId: input.accountRequestId,
        consumedAt: null,
        invalidatedAt: null,
      },
      data: {
        invalidatedAt: queuedAt,
      },
    });

    /*
     * Persist only the SHA-256 token hash. The raw bearer token is returned to
     * the caller solely for one email delivery and is never written to audit
     * metadata, application logs, or PostgreSQL.
     */
    const invitation = await transaction.activationInvitation.create({
      data: {
        accountRequestId: input.accountRequestId,
        employeeId: input.employeeId,
        createdByAccountId: input.actorAccountId,
        tokenHash: prepared.tokenHash,
        expiresAt: prepared.expiresAt,
      },
      select: {
        id: true,
      },
    });

    await transaction.accountRequest.update({
      where: {
        id: input.accountRequestId,
      },
      data: {
        activationEmailStatus: ActivationEmailDeliveryStatus.PENDING,
        activationEmailLastAttemptAt: queuedAt,
        activationEmailSentAt: null,
        activationEmailFailureCategory: null,
      },
    });

    await transaction.accountRequestAction.create({
      data: {
        accountRequestId: input.accountRequestId,
        actorAccountId: input.actorAccountId,
        action: AccountRequestActionType.ACTIVATION_EMAIL_QUEUED,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        metadata: {
          source: input.source,
          employeeId: input.employeeId,
          invitationId: invitation.id,
          deliveryStatus: ActivationEmailDeliveryStatus.PENDING,
          expiresAt: prepared.expiresAt.toISOString(),
        },
      },
    });

    return {
      id: invitation.id,
      accountRequestId: input.accountRequestId,
      employeeId: input.employeeId,
      actorAccountId: input.actorAccountId,
      source: input.source,
      rawToken: prepared.rawToken,
      expiresAt: prepared.expiresAt,
    };
  }

  async deliverQueuedInvitation(
    input: DeliverInvitationInput,
  ): Promise<ActivationEmailDeliveryOutcome> {
    const attemptedAt = new Date();

    try {
      await this.mailService.sendActivationInvitation({
        to: input.officialEmail,
        employeeName: input.employeeName,
        employeeId: input.employeeCode,
        officialEmail: input.officialEmail,
        divisionName: input.divisionName,
        departmentName: input.departmentName ?? 'Not assigned',
        roleName: getActivationRoleName(input.requestedRole),
        maskedPhoneNumber: maskNepalPhoneNumber(input.phoneNumber),
        activationUrl: buildActivationInvitationUrl(
          this.webOrigin,
          input.rawToken,
        ),
      });

      const sentAt = new Date();
      const persisted = await this.recordDeliveryOutcome(input, {
        status: ActivationEmailDeliveryStatus.SENT,
        attemptedAt,
        sentAt,
        failureCategory: null,
      });

      return persisted
        ? {
            status: ActivationEmailDeliveryStatus.SENT,
            attemptedAt,
            sentAt,
            failureCategory: null,
          }
        : {
            status: ActivationEmailDeliveryStatus.PENDING,
            attemptedAt,
            sentAt: null,
            failureCategory: null,
          };
    } catch (error: unknown) {
      const failureCategory:
        | MailDeliveryFailureCategory
        | 'UNEXPECTED_FAILURE' =
        error instanceof MailDeliveryError
          ? error.category
          : 'UNEXPECTED_FAILURE';

      const persisted = await this.recordDeliveryOutcome(input, {
        status: ActivationEmailDeliveryStatus.FAILED,
        attemptedAt,
        sentAt: null,
        failureCategory,
      });

      return persisted
        ? {
            status: ActivationEmailDeliveryStatus.FAILED,
            attemptedAt,
            sentAt: null,
            failureCategory,
          }
        : {
            status: ActivationEmailDeliveryStatus.PENDING,
            attemptedAt,
            sentAt: null,
            failureCategory: null,
          };
    }
  }

  async getInvitationPreview(
    rawToken: string,
  ): Promise<ActivationInvitationPreview> {
    const invitation = await this.prisma.activationInvitation.findUnique({
      where: {
        tokenHash: hashActivationInvitationToken(rawToken),
      },
      select: {
        expiresAt: true,
        consumedAt: true,
        invalidatedAt: true,
        request: {
          select: {
            requestedRole: true,
            status: true,
            employeeId: true,
            divisionId: true,
            departmentId: true,
            division: {
              select: {
                name: true,
              },
            },
            department: {
              select: {
                name: true,
              },
            },
          },
        },
        employee: {
          select: {
            id: true,
            empName: true,
            officialEmail: true,
            status: true,
            isActivated: true,
            account: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    const now = new Date();

    /*
     * Every unusable state returns the same public message so callers cannot
     * distinguish an unknown token from an expired, consumed, or replaced one.
     */
    if (
      !invitation ||
      invitation.consumedAt ||
      invitation.invalidatedAt ||
      invitation.expiresAt.getTime() <= now.getTime() ||
      invitation.request.employeeId !== invitation.employee.id ||
      invitation.employee.status !== EmployeeStatus.ACTIVE ||
      invitation.employee.isActivated ||
      invitation.employee.account ||
      (invitation.request.status !== AccountRequestStatus.APPROVED &&
        invitation.request.status !==
          AccountRequestStatus.ACTIVATION_PENDING) ||
      !invitation.request.divisionId ||
      !invitation.request.division
    ) {
      throw new UnauthorizedException(
        'The activation invitation is invalid or expired.',
      );
    }

    return {
      employee: {
        empName: invitation.employee.empName,
        officialEmail: invitation.employee.officialEmail,
      },
      organization: {
        divisionId: invitation.request.divisionId,
        divisionName: invitation.request.division.name,
        departmentId: invitation.request.departmentId,
        departmentName: invitation.request.department?.name ?? null,
      },
      requestedRole: invitation.request.requestedRole,
      expiresAt: invitation.expiresAt,
    };
  }

  private async recordDeliveryOutcome(
    input: QueuedActivationInvitation,
    outcome: ActivationEmailDeliveryOutcome,
  ): Promise<boolean> {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const activeInvitation =
          await transaction.activationInvitation.findFirst({
            where: {
              accountRequestId: input.accountRequestId,
              consumedAt: null,
              invalidatedAt: null,
            },
            orderBy: {
              createdAt: 'desc',
            },
            select: {
              id: true,
            },
          });

        /*
         * A delayed provider response must never overwrite the status of a
         * newer invitation created by a later resend.
         */
        if (!activeInvitation || activeInvitation.id !== input.id) {
          return false;
        }

        await transaction.accountRequest.update({
          where: {
            id: input.accountRequestId,
          },
          data: {
            activationEmailStatus: outcome.status,
            activationEmailLastAttemptAt: outcome.attemptedAt,
            activationEmailSentAt: outcome.sentAt,
            activationEmailFailureCategory: outcome.failureCategory,
          },
        });

        await transaction.accountRequestAction.create({
          data: {
            accountRequestId: input.accountRequestId,
            actorAccountId: input.actorAccountId,
            action:
              outcome.status === ActivationEmailDeliveryStatus.SENT
                ? AccountRequestActionType.ACTIVATION_EMAIL_SENT
                : AccountRequestActionType.ACTIVATION_EMAIL_FAILED,
            metadata: {
              source: input.source,
              employeeId: input.employeeId,
              invitationId: input.id,
              deliveryStatus: outcome.status,
              attemptedAt: outcome.attemptedAt.toISOString(),
              ...(outcome.sentAt
                ? {
                    sentAt: outcome.sentAt.toISOString(),
                  }
                : {}),
              ...(outcome.failureCategory
                ? {
                    providerCategory: outcome.failureCategory,
                  }
                : {}),
            },
          },
        });

        return true;
      });
    } catch {
      /*
       * Account approval remains authoritative even when delivery-state
       * persistence fails. Log only safe identifiers, never token material.
       */
      this.logger.warn(
        `Activation email outcome could not be persisted for request ${input.accountRequestId}.`,
      );
      return false;
    }
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
