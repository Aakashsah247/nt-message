import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('MailService security messages', () => {
  const sendMail = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    jest.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as unknown as nodemailer.Transporter);
  });

  function createService(overrides: Record<string, string> = {}): MailService {
    const values: Record<string, string> = {
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_FROM: 'NT Message <no-reply@ntc.net.np>',
      SMTP_SECURE: 'false',
      SMTP_REQUIRE_TLS: 'false',
      ...overrides,
    };

    const configService = {
      getOrThrow: jest.fn((key: string) => {
        const value = values[key];
        if (value === undefined) {
          throw new Error(`Missing configuration: ${key}`);
        }
        return value;
      }),
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    return new MailService(configService);
  }

  it('keeps the local Mailpit transport unauthenticated', () => {
    createService();

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'localhost',
      port: 1025,
      secure: false,
      requireTLS: false,
      tls: { minVersion: 'TLSv1.2' },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
  });

  it('configures authenticated STARTTLS for a real SMTP provider', () => {
    createService({
      SMTP_HOST: 'smtp.ntc.example',
      SMTP_PORT: '587',
      SMTP_REQUIRE_TLS: 'true',
      SMTP_USER: 'nt-message@ntc.example',
      SMTP_PASSWORD: 'provider-secret',
      SMTP_CONNECTION_TIMEOUT_MS: '12000',
      SMTP_GREETING_TIMEOUT_MS: '13000',
      SMTP_SOCKET_TIMEOUT_MS: '45000',
    });

    expect(nodemailer.createTransport).toHaveBeenCalledWith({
      host: 'smtp.ntc.example',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: {
        user: 'nt-message@ntc.example',
        pass: 'provider-secret',
      },
      tls: { minVersion: 'TLSv1.2' },
      connectionTimeout: 12_000,
      greetingTimeout: 13_000,
      socketTimeout: 45_000,
    });
  });

  it('rejects incomplete SMTP credentials', () => {
    expect(() => createService({ SMTP_USER: 'nt-message@ntc.example' })).toThrow(
      'SMTP_USER and SMTP_PASSWORD must either both be configured or both be omitted.',
    );
  });

  it('uses the approved activation email template and privacy-safe fields', async () => {
    const service = createService();

    await service.sendActivationInvitation({
      to: 'Test6@gmail.com',
      employeeName: 'Y32 Direct Test',
      employeeId: 'NTC-Y32',
      officialEmail: 'Test6@gmail.com',
      divisionName: 'IT Division',
      departmentName: 'Engineering department',
      roleName: 'Employee',
      maskedPhoneNumber: '+97798******71',
      activationUrl:
        'http://localhost:5173/activate?invitation=opaque-test-token',
    });

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail).toHaveBeenCalledWith({
      from: 'NT Message <no-reply@ntc.net.np>',
      to: 'Test6@gmail.com',
      subject: 'Your NT Message account is ready for activation',
      text: [
        'Dear Y32 Direct Test,',
        '',
        'Your NT Message account has been approved.',
        '',
        'Approved account details:',
        '',
        'Employee name: Y32 Direct Test',
        'Employee ID: NTC-Y32',
        'Role: Employee',
        'Division: IT Division',
        'Department: Engineering department',
        'Official email: Test6@gmail.com',
        'Registered phone: +97798******71',
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
        'http://localhost:5173/activate?invitation=opaque-test-token',
        '',
        'Important:',
        'The information entered on the activation page must match the approved account details. Capitalization, unnecessary spaces, email capitalization and accepted Nepal phone-number formats will be normalized automatically.',
        '',
        'Do not share your OTP or password with anyone. Nepal Telecom administrators will never ask you to provide your password or OTP.',
      ].join('\n'),
    });
  });

  it('sends a privacy-safe password-changed notification', async () => {
    const service = createService();
    const changedAt = new Date('2026-07-17T06:30:00.000Z');

    await service.sendPasswordChangedNotification({
      to: 'employee@ntc.net.np',
      displayName: 'Employee User',
      changedAt,
    });

    expect(sendMail).toHaveBeenCalledTimes(1);

    const message = sendMail.mock.calls[0]?.[0] as {
      subject: string;
      text: string;
    };

    expect(message.subject).toBe('Your NT Message password was changed');
    expect(message.text).toContain(
      'All active NT Message sessions were signed out.',
    );
    expect(message.text).toContain(changedAt.toISOString());
    expect(message.text).not.toMatch(
      /old password|new password:|password hash|otp:|session token/i,
    );
  });

it('sends a one-time password recovery code without password data', async () => {
  const service = createService();

  await service.sendPasswordResetOtp({
    to: 'employee@ntc.net.np',
    displayName: 'Employee User',
    otp: '123456',
    expiresInMinutes: 10,
  });

  const message = sendMail.mock.calls[0]?.[0] as {
    subject: string;
    text: string;
  };

  expect(message.subject).toBe('NT Message password recovery code');
  expect(message.text).toContain('Recovery code: 123456');
  expect(message.text).toContain('expires in 10 minutes');
  expect(message.text).not.toMatch(
    /current password:|new password:|password hash|reset token/i,
  );
});

it('sends a privacy-safe password reset confirmation', async () => {
  const service = createService();
  const changedAt = new Date('2026-07-17T10:00:00.000Z');

  await service.sendPasswordResetNotification({
    to: 'employee@ntc.net.np',
    displayName: 'Employee User',
    changedAt,
  });

  const message = sendMail.mock.calls[0]?.[0] as {
    subject: string;
    text: string;
  };

  expect(message.subject).toBe('Your NT Message password was reset');
  expect(message.text).toContain(
    'All active NT Message sessions were signed out.',
  );
  expect(message.text).not.toMatch(
    /otp:|password:|password hash|reset token/i,
  );
});

});
