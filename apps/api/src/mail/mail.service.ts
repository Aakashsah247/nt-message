import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

interface ActivationOtpEmail {
  to: string;
  employeeName: string;
  otp: string;
  expiresInMinutes: number;
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
}
