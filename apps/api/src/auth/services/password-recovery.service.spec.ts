import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';

import type { PrismaService } from '../../database/prisma.service';
import type { MailService } from '../../mail/mail.service';
import { PasswordRecoveryService } from './password-recovery.service';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn(),
  verify: jest.fn(),
}));

jest.mock('../../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('PasswordRecoveryService', () => {
  const transaction = {
    passwordResetChallenge: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    account: {
      updateMany: jest.fn(),
    },
    authSession: {
      updateMany: jest.fn(),
    },
    activityEvent: {
      create: jest.fn(),
    },
  };

  const prisma = {
    account: {
      findFirst: jest.fn(),
    },
    passwordResetChallenge: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(
      async (
        callback: (
          value: typeof transaction,
        ) => Promise<unknown>,
      ) => callback(transaction),
    ),
  } as unknown as PrismaService;

  const mailService = {
    sendPasswordResetOtp: jest.fn(),
    sendPasswordResetNotification: jest.fn(),
  } as unknown as MailService;

  const configService = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        OTP_HASH_SECRET: 'test-secret',
        OTP_TTL_MINUTES: '10',
        OTP_RESEND_COOLDOWN_SECONDS: '60',
        OTP_MAX_ATTEMPTS: '5',
      };

      return values[key];
    }),
  } as unknown as ConfigService;

  const eligibleAccount = {
    id: 'account-1',
    username: 'employee@ntc.net.np',
    role: 'EMPLOYEE',
    passwordHash: 'stored-hash',
    isEnabled: true,
    employee: {
      empName: 'Employee User',
      officialEmail: 'Employee@ntc.net.np',
      status: 'ACTIVE',
      employmentStatus: 'ACTIVE',
      isActivated: true,
      archivedAt: null,
    },
    superAdminProfile: null,
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.clearAllMocks();

    jest
      .mocked(prisma.account.findFirst)
      .mockResolvedValue(eligibleAccount as never);

    transaction.passwordResetChallenge.findFirst.mockResolvedValue(null);
    transaction.passwordResetChallenge.updateMany.mockResolvedValue({
      count: 1,
    });
    transaction.passwordResetChallenge.create.mockResolvedValue({
      id: 'challenge-1',
    });
    transaction.account.updateMany.mockResolvedValue({
      count: 1,
    });
    transaction.authSession.updateMany.mockResolvedValue({
      count: 2,
    });
    transaction.activityEvent.create.mockResolvedValue({
      id: 'event-1',
    });

    jest
      .mocked(mailService.sendPasswordResetOtp)
      .mockResolvedValue(undefined);
    jest
      .mocked(mailService.sendPasswordResetNotification)
      .mockResolvedValue(undefined);

    jest.mocked(argon2.verify).mockResolvedValue(false);
    jest.mocked(argon2.hash).mockResolvedValue('replacement-hash');
  });

  it('returns the same generic response for an unknown email', async () => {
    jest.mocked(prisma.account.findFirst).mockResolvedValueOnce(null);

    const service = new PasswordRecoveryService(
      prisma,
      mailService,
      configService,
    );

    await expect(
      service.requestPasswordReset('unknown@ntc.net.np'),
    ).resolves.toEqual({
      message:
        'If an eligible account exists, a password recovery code has been sent.',
      resendAfterSeconds: 60,
    });

    expect(mailService.sendPasswordResetOtp).not.toHaveBeenCalled();
  });

  it('stores only a hashed OTP before sending email', async () => {
    const service = new PasswordRecoveryService(
      prisma,
      mailService,
      configService,
    );

    await service.requestPasswordReset('employee@ntc.net.np');

    const createCall =
      transaction.passwordResetChallenge.create.mock.calls[0]?.[0];

    expect(createCall.data.otpHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(createCall)).not.toMatch(/"otp":"\d{6}"/);
    expect(mailService.sendPasswordResetOtp).toHaveBeenCalledTimes(1);
  });

  it('invalidates an undelivered recovery code', async () => {
    jest
      .mocked(mailService.sendPasswordResetOtp)
      .mockRejectedValueOnce(new Error('SMTP unavailable'));

    const service = new PasswordRecoveryService(
      prisma,
      mailService,
      configService,
    );
    const warning = jest
      .spyOn(
        (service as unknown as { logger: { warn(message: string): void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);

    await service.requestPasswordReset('employee@ntc.net.np');

    expect(prisma.passwordResetChallenge.updateMany).toHaveBeenCalledWith({
      where: {
        id: expect.any(String),
        consumedAt: null,
      },
      data: {
        consumedAt: expect.any(Date),
      },
    });
    expect(warning).toHaveBeenCalledWith(
      'Password recovery code was prepared but not delivered.',
    );
  });

  it('resets the password, revokes sessions and audits safe metadata', async () => {
    jest.mocked(prisma.passwordResetChallenge.findUnique).mockResolvedValue({
      id: 'challenge-1',
      accountId: 'account-1',
      otpHash: 'a'.repeat(64),
      attemptCount: 0,
      maxAttempts: 5,
      expiresAt: new Date(Date.now() + 60_000),
      verifiedAt: new Date(),
      resetTokenHash: 'b'.repeat(64),
      resetTokenExpiresAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
      account: eligibleAccount,
    } as never);

    const service = new PasswordRecoveryService(
      prisma,
      mailService,
      configService,
    );

    const result = await service.completePasswordReset({
      resetToken: 'opaque-reset-token-value-that-is-long-enough',
      newPassword: 'ReplacementPassword#43',
      confirmPassword: 'ReplacementPassword#43',
    });

    expect(result).toEqual({
      message:
        'Password reset successfully. Sign in again using your new password.',
      revokedSessions: 2,
    });

    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        accountId: 'account-1',
        revokedAt: null,
      },
      data: {
        revokedAt: expect.any(Date),
      },
    });

    const auditMetadata =
      transaction.activityEvent.create.mock.calls[0]?.[0].data.metadata;

    expect(auditMetadata).toEqual({
      recoveryMethod: 'EMAIL_OTP',
      revokedSessions: 2,
    });

    /*
     * EMAIL_OTP is a safe recovery-method label. The audit must exclude
     * credential values and identity fields, not the method name.
     */
    expect(JSON.stringify(auditMetadata)).not.toMatch(
      /passwordHash|resetToken|officialEmail|rawOtp|newPassword/i,
    );
  });
});
