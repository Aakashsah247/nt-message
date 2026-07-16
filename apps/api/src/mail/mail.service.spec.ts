import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

import { MailService } from './mail.service';

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(),
}));

describe('MailService activation invitation', () => {
  const sendMail = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    jest.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail,
    } as unknown as nodemailer.Transporter);
  });

  it('uses the approved activation email template and privacy-safe fields', async () => {
    const values: Record<string, string> = {
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_FROM: 'NT Message <no-reply@ntc.net.np>',
      SMTP_SECURE: 'false',
    };

    const configService = {
      getOrThrow: jest.fn((key: string) => values[key]),
      get: jest.fn((key: string) => values[key]),
    } as unknown as ConfigService;

    const service = new MailService(configService);

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
});
