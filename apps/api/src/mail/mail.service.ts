import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

interface ActivationOtpEmail {
  to: string;
  employeeName: string;
  otp: string;
  expiresInMinutes: number;
}

export interface ActivationInvitationEmail {
  to: string;
  employeeName: string;
  employeeId: string;
  officialEmail: string;
  divisionName: string;
  departmentName: string;
  roleName: string;
  maskedPhoneNumber: string;
  activationUrl: string;
}

export interface PasswordChangedNotificationEmail {
  to: string;
  displayName: string;
  changedAt: Date;
}

export interface PasswordResetOtpEmail {
  to: string;
  displayName: string;
  otp: string;
  expiresInMinutes: number;
}

export interface PasswordResetNotificationEmail {
  to: string;
  displayName: string;
  changedAt: Date;
}

export type MailDeliveryFailureCategory = 'SMTP_DELIVERY_FAILED';

export class MailDeliveryError extends Error {
  constructor(
    public readonly category: MailDeliveryFailureCategory,
  ) {
    super('The email provider could not deliver the message.');
    this.name = 'MailDeliveryError';
  }
}

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;

  private readonly fromAddress: string;

  constructor(configService: ConfigService) {
    const host = configService.getOrThrow<string>('SMTP_HOST');

    const port = Number(configService.getOrThrow<string>('SMTP_PORT'));

    if (!Number.isInteger(port)) {
      throw new Error('SMTP_PORT must be a valid integer.');
    }

    const secure = configService.get<string>('SMTP_SECURE') === 'true';

    this.fromAddress = configService.getOrThrow<string>('SMTP_FROM');

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
    });
  }

  async sendActivationOtp(email: ActivationOtpEmail): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: email.to,
        subject: 'NT Message account activation code',

        text: [
          `Hello ${email.employeeName},`,
          '',
          `Your NT Message activation code is: ${email.otp}`,
          '',
          `This code expires in ${email.expiresInMinutes} minutes.`,
          'Do not share this code with anyone.',
        ].join('\n'),
      });
    } catch {
      throw new ServiceUnavailableException(
        'The activation email could not be sent.',
      );
    }
  }

  async sendActivationInvitation(
    email: ActivationInvitationEmail,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: email.to,
        subject: 'Your NT Message account is ready for activation',

        /*
         * Keep this message aligned with the approved activation template.
         * Never add an OTP, password, database identifier or unmasked phone.
         */
        text: [
          `Dear ${email.employeeName},`,
          '',
          'Your NT Message account has been approved.',
          '',
          'Approved account details:',
          '',
          `Employee name: ${email.employeeName}`,
          `Employee ID: ${email.employeeId}`,
          `Role: ${email.roleName}`,
          `Division: ${email.divisionName}`,
          `Department: ${email.departmentName}`,
          `Official email: ${email.officialEmail}`,
          `Registered phone: ${email.maskedPhoneNumber}`,
          '',
          'To activate your account:',
          '',
          '1. Open the NT Message activation page.',
          '2. Enter the approved account information shown above.',
          '3. Verify the OTP sent to your official email.',
          '4. Create a secure password.',
          '5. Log in to NT Message using your official email and password.',
          '',
          'Activation page:',
          email.activationUrl,
          '',
          'Important:',
          'The information entered on the activation page must match the approved account details. Capitalization, unnecessary spaces, email capitalization and accepted Nepal phone-number formats will be normalized automatically.',
          '',
          'Do not share your OTP or password with anyone. Nepal Telecom administrators will never ask you to provide your password or OTP.',
        ].join('\n'),
      });
    } catch {
      /*
       * Expose only a stable provider category. SMTP responses and transport
       * errors can contain infrastructure details and must not enter audits.
       */
      throw new MailDeliveryError('SMTP_DELIVERY_FAILED');
    }
  }

  async sendPasswordChangedNotification(
    email: PasswordChangedNotificationEmail,
  ): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to: email.to,
        subject: 'Your NT Message password was changed',

        /*
         * Security notifications confirm the event only. Never include the
         * old password, new password, password hash, OTP or session token.
         */
        text: [
          `Dear ${email.displayName},`,
          '',
          'The password for your NT Message account was changed successfully.',
          '',
          `Changed at: ${email.changedAt.toISOString()}`,
          '',
          'All active NT Message sessions were signed out. Sign in again using your new password.',
          '',
          'If you did not make this change, contact the authorized Nepal Telecom system administrator immediately.',
          '',
          'Do not share your password or OTP with anyone. Nepal Telecom administrators will never ask you to provide them.',
        ].join('\n'),
      });
    } catch {
      throw new MailDeliveryError('SMTP_DELIVERY_FAILED');
    }
  }
async sendPasswordResetOtp(
  email: PasswordResetOtpEmail,
): Promise<void> {
  try {
    await this.transporter.sendMail({
      from: this.fromAddress,
      to: email.to,
      subject: 'NT Message password recovery code',

      /*
       * OTP is delivered only by email and is never returned by the public
       * request endpoint or written to logs and audit metadata.
       */
      text: [
        `Dear ${email.displayName},`,
        '',
        'A password recovery request was received for your NT Message account.',
        '',
        `Recovery code: ${email.otp}`,
        '',
        `This code expires in ${email.expiresInMinutes} minutes and can be used once.`,
        '',
        'If you did not request this code, you can ignore this message. Your current password remains unchanged.',
        '',
        'Do not share this code, your password or any OTP with anyone. Nepal Telecom administrators will never ask you to provide them.',
      ].join('\n'),
    });
  } catch {
    throw new MailDeliveryError('SMTP_DELIVERY_FAILED');
  }
}

async sendPasswordResetNotification(
  email: PasswordResetNotificationEmail,
): Promise<void> {
  try {
    await this.transporter.sendMail({
      from: this.fromAddress,
      to: email.to,
      subject: 'Your NT Message password was reset',

      /*
       * Confirmation contains only security-event information. It never
       * contains either password, the OTP or the reset token.
       */
      text: [
        `Dear ${email.displayName},`,
        '',
        'The password for your NT Message account was reset successfully.',
        '',
        `Reset at: ${email.changedAt.toISOString()}`,
        '',
        'All active NT Message sessions were signed out. Sign in again using your new password.',
        '',
        'If you did not complete this recovery, contact the authorized Nepal Telecom system administrator immediately.',
        '',
        'Nepal Telecom administrators will never ask you to provide your password or OTP.',
      ].join('\n'),
    });
  } catch {
    throw new MailDeliveryError('SMTP_DELIVERY_FAILED');
  }
}
}
