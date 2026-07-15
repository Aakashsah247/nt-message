import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  ActivityEventType,
  EmployeeStatus,
  EmploymentStatus,
  MessagingNotificationType,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { MonitoringService } from '../monitoring/monitoring.service';
import { MessagingEventsService } from '../realtime/messaging-events.service';
import { SendEmergencyAlertDto } from './dto/send-emergency-alert.dto';
import { SMS_PROVIDER } from './sms-providers/sms-provider.interface';
import type { SmsProvider } from './sms-providers/sms-provider.interface';

type EmergencyAlertRecipientStatus =
  | 'PENDING'
  | 'SENT'
  | 'FAILED'
  | 'SKIPPED_NO_PHONE';

const EMERGENCY_ALERT_COOLDOWN_MS = 60 * 1000;

const emergencyAccountSelect = {
  id: true,
  username: true,
  role: true,
  isEnabled: true,
  profilePhotoKey: true,
  profileBio: true,
  showOnlineStatus: true,
  showReadReceipts: true,

  superAdminProfile: {
    select: {
      id: true,
      fullName: true,
      email: true,
      phoneNumber: true,
      createdAt: true,
      updatedAt: true,
    },
  },

  employee: {
    select: {
      id: true,
      empId: true,
      empName: true,
      phoneNumber: true,
      officialEmail: true,
      designation: true,
      profilePhotoKey: true,
      profileBio: true,
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

const emergencyNotificationSelect = {
  id: true,
  recipientAccountId: true,
  actorAccountId: true,
  conversationId: true,
  messageId: true,
  type: true,
  title: true,
  body: true,
  isRead: true,
  readAt: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,

  actor: {
    select: emergencyAccountSelect,
  },
} satisfies Prisma.MessagingNotificationSelect;

type EmergencyAccountRecord = Prisma.AccountGetPayload<{
  select: typeof emergencyAccountSelect;
}>;

type EmergencyNotificationRecord = Prisma.MessagingNotificationGetPayload<{
  select: typeof emergencyNotificationSelect;
}>;

interface EmergencyMessagePair {
  longMessage: string;
  shortMessage: string;
}

type SuperAdminProfileSource =
  | 'SYSTEM_CONFIG'
  | 'DATABASE_SETUP'
  | 'ACCOUNT_FALLBACK';

type SuperAdminProfileStatus =
  | 'READY'
  | 'NOT_CONFIGURED'
  | 'INVALID_PHONE'
  | 'DUPLICATE_EMAIL'
  | 'DUPLICATE_PHONE';

interface RecipientDelivery {
  recipient: EmergencyAccountRecord;
  phoneNumber: string | null;
  status: EmergencyAlertRecipientStatus;
  providerMessageId: string | null;
  failureReason: string | null;
  sentAt: Date | null;
}

export interface SuperAdminOfficialProfile {
  fullName: string;
  email: string | null;
  phoneNumber: string | null;
  source: SuperAdminProfileSource;
  profileStatus: SuperAdminProfileStatus;
  statusMessage: string;
  updatedAt: string | null;
}

@Injectable()
export class EmergencyAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly monitoringService: MonitoringService,
    private readonly messagingEventsService: MessagingEventsService,

    @Inject(SMS_PROVIDER)
    private readonly smsProvider: SmsProvider,
  ) {}

  async listEmergencyContacts(user: AuthenticatedUser) {
    const sender = await this.getAccount(user.accountId);
    const contacts = await this.prisma.account.findMany({
      where: {
        id: {
          not: sender.id,
        },
        isEnabled: true,
        OR: [
          {
            role: AccountRole.SUPER_ADMIN,
          },
          {
            employee: {
              is: {
                status: EmployeeStatus.ACTIVE,
                employmentStatus: EmploymentStatus.ACTIVE,
                archivedAt: null,
              },
            },
          },
        ],
      },
      orderBy: [
        {
          role: 'asc',
        },
        {
          username: 'asc',
        },
      ],
      select: emergencyAccountSelect,
    });

    return {
      data: await Promise.all(
        contacts.map((contact) => this.toEmergencyContact(contact)),
      ),
    };
  }

  async getOwnSuperAdminProfile(user: AuthenticatedUser) {
    const account = await this.getAccount(user.accountId);
    this.ensureSuperAdmin(account);

    return {
      data: await this.resolveSuperAdminOfficialProfile(account),
    };
  }

  async sendEmergencyAlert(
    user: AuthenticatedUser,
    dto: SendEmergencyAlertDto,
  ) {
    const sender = await this.getAccount(user.accountId);
    const recipient = await this.getAccount(dto.recipientAccountId);

    if (sender.id === recipient.id) {
      throw new BadRequestException(
        'You cannot send an emergency alert to yourself.',
      );
    }

    if (!this.canReceiveEmergencyAlert(recipient)) {
      throw new BadRequestException(
        'Selected recipient cannot receive emergency alerts.',
      );
    }

    await this.ensureCooldown(user.accountId);

    const alertId = randomUUID();
    const recipientRowId = randomUUID();
    const occurredAt = new Date();
    const messages = this.buildEmergencyMessages(sender, recipient, occurredAt);
    const phoneNumber = await this.getEmergencyPhone(recipient);

    await this.createStoredEmergencyAlert({
      alertId,
      recipientRowId,
      sender,
      recipient,
      phoneNumber,
      messages,
      occurredAt,
    });

    const delivery = await this.dispatchRecipient({
      recipientRowId,
      recipient,
      phoneNumber,
      shortMessage: messages.shortMessage,
    });

    await this.createAndEmitEmergencyNotification({
      alertId,
      sender,
      recipient,
      longMessage: messages.longMessage,
      delivery,
      occurredAt,
    });

    await this.monitoringService.recordActivity(user, {
      eventType: ActivityEventType.EMERGENCY_ALERT_SENT,
      pagePath: 'Emergency Alert',
      elementLabel: 'Send emergency SMS alert',
    });

    return {
      alert: {
        id: alertId,
        sender: this.toPublicAccount(sender),
        recipient: this.toPublicAccount(recipient),
        messageLong: messages.longMessage,
        messageShort: messages.shortMessage,
        createdAt: occurredAt.toISOString(),
      },
      recipient: {
        id: recipientRowId,
        accountId: recipient.id,
        employeeName: this.getDisplayName(recipient),
        role: recipient.role,
        phoneNumber: delivery.phoneNumber
          ? this.maskPhone(delivery.phoneNumber)
          : null,
        status: delivery.status,
        providerName: this.smsProvider.providerName,
        providerMessageId: delivery.providerMessageId,
        failureReason: delivery.failureReason,
        sentAt: delivery.sentAt?.toISOString() ?? null,
      },
      architectureNote:
        'SMS sending is provider-based. MockSmsProvider is active now; ' +
        'NepalTelecomSmsProvider can replace it later without changing business logic.',
    };
  }

  private async getAccount(accountId: string): Promise<EmergencyAccountRecord> {
    const account = await this.prisma.account.findUnique({
      where: {
        id: accountId,
      },
      select: emergencyAccountSelect,
    });

    if (!account || !account.isEnabled) {
      throw new NotFoundException('Selected account was not found.');
    }

    return account;
  }

  private ensureSuperAdmin(account: EmergencyAccountRecord): void {
    if (account.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can view the official emergency profile.',
      );
    }
  }

  private async ensureCooldown(accountId: string): Promise<void> {
    const recentCount = await this.prisma.activityEvent.count({
      where: {
        accountId,
        eventType: ActivityEventType.EMERGENCY_ALERT_SENT,
        occurredAt: {
          gte: new Date(Date.now() - EMERGENCY_ALERT_COOLDOWN_MS),
        },
      },
    });

    if (recentCount > 0) {
      throw new HttpException(
        'Please wait a minute before sending another emergency alert.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private canReceiveEmergencyAlert(account: EmergencyAccountRecord): boolean {
    if (account.role === AccountRole.SUPER_ADMIN) {
      return true;
    }

    return Boolean(
      account.employee &&
        account.employee.status === EmployeeStatus.ACTIVE &&
        account.employee.employmentStatus === EmploymentStatus.ACTIVE &&
        !account.employee.archivedAt,
    );
  }

  private async createStoredEmergencyAlert(input: {
    alertId: string;
    recipientRowId: string;
    sender: EmergencyAccountRecord;
    recipient: EmergencyAccountRecord;
    phoneNumber: string | null;
    messages: EmergencyMessagePair;
    occurredAt: Date;
  }): Promise<void> {
    const initialStatus: EmergencyAlertRecipientStatus = input.phoneNumber
      ? 'PENDING'
      : 'SKIPPED_NO_PHONE';

    await this.prisma.$transaction([
      this.prisma.$executeRaw`
        INSERT INTO emergency_alerts (
          id,
          sender_account_id,
          message_long,
          message_short,
          created_at,
          updated_at
        )
        VALUES (
          ${input.alertId}::uuid,
          ${input.sender.id}::uuid,
          ${input.messages.longMessage},
          ${input.messages.shortMessage},
          ${input.occurredAt},
          ${input.occurredAt}
        )
      `,
      this.prisma.$executeRaw`
        INSERT INTO emergency_alert_recipients (
          id,
          emergency_alert_id,
          recipient_account_id,
          phone_number,
          status,
          provider_name,
          failure_reason,
          created_at,
          updated_at
        )
        VALUES (
          ${input.recipientRowId}::uuid,
          ${input.alertId}::uuid,
          ${input.recipient.id}::uuid,
          ${input.phoneNumber},
          ${initialStatus}::"EmergencyAlertRecipientStatus",
          ${this.smsProvider.providerName},
          ${input.phoneNumber ? null : 'Recipient has no valid mobile number.'},
          ${input.occurredAt},
          ${input.occurredAt}
        )
      `,
    ]);
  }

  private async dispatchRecipient(input: {
    recipientRowId: string;
    recipient: EmergencyAccountRecord;
    phoneNumber: string | null;
    shortMessage: string;
  }): Promise<RecipientDelivery> {
    if (!input.phoneNumber) {
      return {
        recipient: input.recipient,
        phoneNumber: null,
        status: 'SKIPPED_NO_PHONE',
        providerMessageId: null,
        failureReason: 'Recipient has no valid mobile number.',
        sentAt: null,
      };
    }

    const providerResult = await this.smsProvider.send({
      to: input.phoneNumber,
      message: input.shortMessage,
    });
    const sentAt = providerResult.status === 'SENT' ? new Date() : null;

    await this.updateRecipientStatus({
      recipientRowId: input.recipientRowId,
      status: providerResult.status,
      providerMessageId: providerResult.providerMessageId,
      failureReason: providerResult.error,
      sentAt,
    });

    return {
      recipient: input.recipient,
      phoneNumber: input.phoneNumber,
      status: providerResult.status,
      providerMessageId: providerResult.providerMessageId,
      failureReason: providerResult.error,
      sentAt,
    };
  }

  private async updateRecipientStatus(input: {
    recipientRowId: string;
    status: EmergencyAlertRecipientStatus;
    providerMessageId: string | null;
    failureReason: string | null;
    sentAt: Date | null;
  }): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE emergency_alert_recipients
      SET
        status = ${input.status}::"EmergencyAlertRecipientStatus",
        provider_message_id = ${input.providerMessageId},
        failure_reason = ${input.failureReason},
        sent_at = ${input.sentAt},
        updated_at = ${new Date()}
      WHERE id = ${input.recipientRowId}::uuid
    `;
  }

  private async createAndEmitEmergencyNotification(input: {
    alertId: string;
    sender: EmergencyAccountRecord;
    recipient: EmergencyAccountRecord;
    longMessage: string;
    delivery: RecipientDelivery;
    occurredAt: Date;
  }): Promise<void> {
    const notification = await this.prisma.messagingNotification.create({
      data: {
        recipientAccountId: input.recipient.id,
        actorAccountId: input.sender.id,
        type: MessagingNotificationType.GROUP_EVENT,
        title: 'Emergency alert',
        body: `${this.getDisplayName(input.sender)} needs your immediate attention.`,
        metadata: {
          kind: 'EMERGENCY_SMS_ALERT',
          alertId: input.alertId,
          smsStatus: input.delivery.status,
          messageLong: input.longMessage,
        },
      },
      select: emergencyNotificationSelect,
    });

    const unreadCount = await this.prisma.messagingNotification.count({
      where: {
        recipientAccountId: input.recipient.id,
        isRead: false,
      },
    });

    this.messagingEventsService.emitNotificationCreated(input.recipient.id, {
      notification: this.serializeNotification(notification),
      unreadCount,
      occurredAt: input.occurredAt.toISOString(),
    });
  }

  private buildEmergencyMessages(
    sender: EmergencyAccountRecord,
    recipient: EmergencyAccountRecord,
    occurredAt: Date,
  ): EmergencyMessagePair {
    const senderName = this.getDisplayName(sender);
    const receiverName = this.getDisplayName(recipient);
    const dateTime = this.formatKathmanduDateTime(occurredAt);
    const longMessage = [
      '[NT Message Emergency Alert]',
      '',
      `From: ${senderName}`,
      `To: ${receiverName}`,
      '',
      `${senderName} has marked this as urgent and needs your immediate attention.`,
      '',
      'Please open NT Message or contact your team as soon as possible.',
      '',
      `Time: ${dateTime}`,
    ].join('\n');
    const shortMessage =
      `NT Emergency Alert: ${senderName} needs your immediate attention. ` +
      `Please open NT Message or contact your team ASAP. Time: ${dateTime}.`;

    return {
      longMessage,
      shortMessage,
    };
  }

  private serializeNotification(notification: EmergencyNotificationRecord) {
    return {
      id: notification.id,
      recipientAccountId: notification.recipientAccountId,
      actorAccountId: notification.actorAccountId,
      actor: notification.actor ? this.toPublicAccount(notification.actor) : null,
      conversationId: notification.conversationId,
      messageId: notification.messageId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      isRead: notification.isRead,
      readAt: notification.readAt,
      metadata: notification.metadata,
      createdAt: notification.createdAt,
      updatedAt: notification.updatedAt,
    };
  }

  private toPublicAccount(account: EmergencyAccountRecord) {
    const profilePhotoKey =
      account.profilePhotoKey ?? account.employee?.profilePhotoKey ?? null;
    const profileBio = account.profileBio ?? account.employee?.profileBio ?? null;

    return {
      accountId: account.id,
      username: account.username,
      role: account.role,
      profilePhotoKey,
      profileBio,
      showOnlineStatus: account.showOnlineStatus,
      showReadReceipts: account.showReadReceipts,
      displayName: this.getDisplayName(account),
      employee: account.employee
        ? {
            id: account.employee.id,
            empId: account.employee.empId,
            empName: account.employee.empName,
            designation: account.employee.designation,
            profilePhotoKey,
            profileBio,
            division: account.employee.division,
            department: account.employee.departmentUnit,
          }
        : null,
      superAdminProfile: account.superAdminProfile
        ? {
            fullName: account.superAdminProfile.fullName,
            email: account.superAdminProfile.email,
          }
        : null,
    };
  }

  private getDisplayName(account: EmergencyAccountRecord): string {
    if (account.employee?.empName) {
      return account.employee.empName;
    }

    if (account.role === AccountRole.SUPER_ADMIN) {
      return (
        this.getConfiguredValue('SUPER_ADMIN_NAME') ??
        account.superAdminProfile?.fullName ??
        account.username ??
        'Super Admin'
      );
    }

    return account.username ?? 'NT Message User';
  }

  private async toEmergencyContact(account: EmergencyAccountRecord) {
    const phoneStatus = await this.getEmergencyPhoneStatus(account);

    return {
      accountId: account.id,
      displayName: this.getDisplayName(account),
      role: account.role,
      designation: account.employee?.designation ?? null,
      division: account.employee?.division?.name ?? null,
      department: account.employee?.departmentUnit?.name ?? null,
      profileSource:
        account.role === AccountRole.SUPER_ADMIN
          ? 'SUPER_ADMIN_PROFILE'
          : 'EMPLOYEE_PROFILE',
      phoneAvailable: Boolean(phoneStatus.phoneNumber),
      phoneStatus: phoneStatus.status,
      phoneStatusMessage: phoneStatus.message,
    };
  }

  // Resolve by selected account ID, never by phone lookup, so SMS cannot fan out.
  private async getEmergencyPhone(
    account: EmergencyAccountRecord,
  ): Promise<string | null> {
    const phoneStatus = await this.getEmergencyPhoneStatus(account);

    return phoneStatus.phoneNumber;
  }

  private async getEmergencyPhoneStatus(
    account: EmergencyAccountRecord,
  ): Promise<{
    phoneNumber: string | null;
    status: SuperAdminProfileStatus | 'READY';
    message: string;
  }> {
    if (account.role === AccountRole.SUPER_ADMIN) {
      const profile = await this.resolveSuperAdminOfficialProfile(account);

      return {
        phoneNumber:
          profile.profileStatus === 'READY' ? profile.phoneNumber : null,
        status: profile.profileStatus,
        message: profile.statusMessage,
      };
    }

    const phoneNumber = this.toNepalE164Phone(
      account.employee?.phoneNumber ?? null,
    );

    return {
      phoneNumber,
      status: phoneNumber ? 'READY' : 'NOT_CONFIGURED',
      message: phoneNumber
        ? 'Employee mobile number is available.'
        : 'Employee mobile number is missing or invalid.',
    };
  }

  // Super Admin identity is read-only here; setup/env owns official values.
  private async resolveSuperAdminOfficialProfile(
    account: EmergencyAccountRecord,
  ): Promise<SuperAdminOfficialProfile> {
    const rawPhoneNumber =
      this.getConfiguredValue('SUPER_ADMIN_PHONE') ??
      account.superAdminProfile?.phoneNumber ??
      null;
    const phoneNumber = this.toNepalE164Phone(rawPhoneNumber);
    const email = this.getSuperAdminOfficialEmail(account);
    const source = this.getSuperAdminProfileSource(account);
    const updatedAt =
      account.superAdminProfile?.updatedAt.toISOString() ?? null;

    if (rawPhoneNumber && !phoneNumber) {
      return {
        fullName: this.getDisplayName(account),
        email,
        phoneNumber: null,
        source,
        profileStatus: 'INVALID_PHONE',
        statusMessage:
          'Configured Super Admin phone number is not a valid Nepal mobile number.',
        updatedAt,
      };
    }

    if (!phoneNumber) {
      return {
        fullName: this.getDisplayName(account),
        email,
        phoneNumber: null,
        source,
        profileStatus: 'NOT_CONFIGURED',
        statusMessage:
          'Super Admin official phone number is not configured by system setup.',
        updatedAt,
      };
    }

    const duplicateMessage = await this.findSuperAdminIdentityConflict(
      account,
      email,
      phoneNumber,
    );

    if (duplicateMessage) {
      return {
        fullName: this.getDisplayName(account),
        email,
        phoneNumber: null,
        source,
        profileStatus: duplicateMessage.status,
        statusMessage: duplicateMessage.message,
        updatedAt,
      };
    }

    return {
      fullName: this.getDisplayName(account),
      email,
      phoneNumber,
      source,
      profileStatus: 'READY',
      statusMessage:
        'Super Admin official phone number is configured and unique.',
      updatedAt,
    };
  }

  // Cross-table uniqueness protects future SMS OTP from account impersonation.
  private async findSuperAdminIdentityConflict(
    account: EmergencyAccountRecord,
    email: string | null,
    phoneNumber: string,
  ): Promise<{
    status: 'DUPLICATE_EMAIL' | 'DUPLICATE_PHONE';
    message: string;
  } | null> {
    if (email) {
      const duplicateEmployeeEmail = await this.prisma.employee.findFirst({
        where: {
          officialEmail: {
            equals: email,
            mode: 'insensitive',
          },
        },
        select: {
          empName: true,
        },
      });

      if (duplicateEmployeeEmail) {
        return {
          status: 'DUPLICATE_EMAIL',
          message:
            `Super Admin email is already assigned to ${duplicateEmployeeEmail.empName}. ` +
            'Emergency contact setup must use one unique identity per account.',
        };
      }
    }

    const duplicateEmployeePhone = await this.prisma.employee.findFirst({
      where: {
        phoneNumber: {
          in: this.getNepalPhoneVariants(phoneNumber),
        },
      },
      select: {
        empName: true,
      },
    });

    if (duplicateEmployeePhone) {
      return {
        status: 'DUPLICATE_PHONE',
        message:
          `Super Admin phone number is already assigned to ${duplicateEmployeePhone.empName}. ` +
          'SMS OTP and emergency SMS require one phone number per account.',
      };
    }

    const duplicateSuperAdminProfile =
      await this.prisma.superAdminProfile.findFirst({
        where: {
          accountId: {
            not: account.id,
          },
          OR: [
            {
              phoneNumber: {
                in: this.getNepalPhoneVariants(phoneNumber),
              },
            },
            ...(email
              ? [
                  {
                    email: {
                      equals: email,
                      mode: 'insensitive' as const,
                    },
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
        },
      });

    if (duplicateSuperAdminProfile) {
      return {
        status: 'DUPLICATE_PHONE',
        message:
          'Super Admin official contact is duplicated in another profile record.',
      };
    }

    return null;
  }

  private getSuperAdminProfileSource(
    account: EmergencyAccountRecord,
  ): SuperAdminProfileSource {
    if (this.getConfiguredValue('SUPER_ADMIN_PHONE')) {
      return 'SYSTEM_CONFIG';
    }

    return account.superAdminProfile ? 'DATABASE_SETUP' : 'ACCOUNT_FALLBACK';
  }

  private getSuperAdminOfficialEmail(
    account: EmergencyAccountRecord,
  ): string | null {
    const configuredEmail = this.getConfiguredValue('SUPER_ADMIN_EMAIL');

    if (configuredEmail) {
      return configuredEmail.toLowerCase();
    }

    if (account.superAdminProfile?.email) {
      return account.superAdminProfile.email.toLowerCase();
    }

    return account.username?.includes('@')
      ? account.username.toLowerCase()
      : null;
  }

  private getConfiguredValue(key: string): string | null {
    return process.env[key]?.trim() || null;
  }

  private getNepalPhoneVariants(phoneNumber: string): string[] {
    const localNumber = phoneNumber.replace(/^\+977/, '');

    return [phoneNumber, localNumber, `0${localNumber}`];
  }

  private formatKathmanduDateTime(value: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kathmandu',
    }).format(value);
  }

  private toNepalE164Phone(value: string | null): string | null {
    const digits = value?.replace(/\D/g, '') ?? '';

    if (digits.length === 10 && digits.startsWith('9')) {
      return `+977${digits}`;
    }

    if (digits.length === 11 && digits.startsWith('0')) {
      return `+977${digits.slice(1)}`;
    }

    if (digits.length === 13 && digits.startsWith('9779')) {
      return `+${digits}`;
    }

    return null;
  }

  private maskPhone(phoneNumber: string): string {
    return `${phoneNumber.slice(0, 6)}******${phoneNumber.slice(-2)}`;
  }
}
