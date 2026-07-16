import { Logger } from '@nestjs/common';
import * as argon2 from 'argon2';

import type { PrismaService } from '../../database/prisma.service';
import type { MailService } from '../../mail/mail.service';
import { PasswordManagementService } from './password-management.service';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn(),
  verify: jest.fn(),
}));

// Keep focused unit tests isolated from the generated Prisma runtime.
jest.mock('../../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

describe('PasswordManagementService', () => {
  const transaction = {
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
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(
      async (
        callback: (value: typeof transaction) => Promise<unknown>,
      ) => callback(transaction),
    ),
  } as unknown as PrismaService;

  const mailService = {
    sendPasswordChangedNotification: jest.fn(),
  } as unknown as MailService;

  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();

    warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    jest.mocked(prisma.account.findUnique).mockResolvedValue({
      id: 'account-1',
      username: 'employee@ntc.net.np',
      passwordHash: 'stored-hash',
      isEnabled: true,
      employee: {
        empName: 'Employee User',
        officialEmail: 'Employee@ntc.net.np',
      },
      superAdminProfile: null,
    } as never);

    transaction.account.updateMany.mockResolvedValue({
      count: 1,
    });
    transaction.authSession.updateMany.mockResolvedValue({
      count: 3,
    });
    transaction.activityEvent.create.mockResolvedValue({
      id: 'event-1',
    });

    jest
      .mocked(mailService.sendPasswordChangedNotification)
      .mockResolvedValue(undefined);
    jest.mocked(argon2.hash).mockResolvedValue('replacement-hash');
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  function createService(): PasswordManagementService {
    return new PasswordManagementService(prisma, mailService);
  }

  function validRequest() {
    return {
      currentPassword: 'CurrentPassword#42',
      newPassword: 'ReplacementPassword#43',
      confirmPassword: 'ReplacementPassword#43',
    };
  }

  it('changes only the authenticated password and revokes every session', async () => {
    jest
      .mocked(argon2.verify)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const result = await createService().changePassword(
      'account-1',
      'session-1',
      validRequest(),
    );

    expect(argon2.verify).toHaveBeenNthCalledWith(
      1,
      'stored-hash',
      'CurrentPassword#42',
    );
    expect(argon2.verify).toHaveBeenNthCalledWith(
      2,
      'stored-hash',
      'ReplacementPassword#43',
    );

    expect(result).toEqual({
      message: 'Password changed successfully. Sign in again on every device.',
      revokedSessions: 3,
    });

    expect(transaction.account.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'account-1',
        passwordHash: 'stored-hash',
        isEnabled: true,
      },
      data: expect.objectContaining({
        passwordHash: 'replacement-hash',
        passwordChangedAt: expect.any(Date),
        failedLoginAttempts: 0,
        lockedUntil: null,
      }),
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

    expect(transaction.activityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'account-1',
        sessionId: 'session-1',
        eventType: 'PASSWORD_CHANGED',
        pagePath: 'Settings',
        elementLabel: 'Password changed',
        metadata: {
          revokedSessions: 3,
        },
      }),
    });

    const auditPayload = JSON.stringify(
      transaction.activityEvent.create.mock.calls[0]?.[0],
    );

    expect(auditPayload).not.toContain('CurrentPassword#42');
    expect(auditPayload).not.toContain('ReplacementPassword#43');
    expect(auditPayload).not.toContain('replacement-hash');

    expect(
      mailService.sendPasswordChangedNotification,
    ).toHaveBeenCalledWith({
      to: 'Employee@ntc.net.np',
      displayName: 'Employee User',
      changedAt: expect.any(Date),
    });
  });

  it('uses the persisted Super Admin profile rather than bootstrap environment values', async () => {
    jest.mocked(prisma.account.findUnique).mockResolvedValueOnce({
      id: 'super-admin-account',
      username: 'database-super-admin@ntc.net.np',
      passwordHash: 'stored-hash',
      isEnabled: true,
      employee: null,
      superAdminProfile: {
        fullName: 'Database Super Admin',
        email: 'Database-Super-Admin@ntc.net.np',
      },
    } as never);

    jest
      .mocked(argon2.verify)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await createService().changePassword(
      'super-admin-account',
      'session-1',
      validRequest(),
    );

    expect(
      mailService.sendPasswordChangedNotification,
    ).toHaveBeenCalledWith({
      to: 'Database-Super-Admin@ntc.net.np',
      displayName: 'Database Super Admin',
      changedAt: expect.any(Date),
    });
  });

  it('rejects a mismatched password confirmation before any database lookup', async () => {
    await expect(
      createService().changePassword('account-1', 'session-1', {
        ...validRequest(),
        confirmPassword: 'DifferentPassword#44',
      }),
    ).rejects.toThrow('Password confirmation does not match.');

    expect(prisma.account.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an incorrect current password before any write', async () => {
    jest.mocked(argon2.verify).mockResolvedValueOnce(false);

    await expect(
      createService().changePassword('account-1', 'session-1', {
        ...validRequest(),
        currentPassword: 'WrongPassword#42',
      }),
    ).rejects.toThrow('Current password is incorrect.');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects reuse of the current password', async () => {
    jest
      .mocked(argon2.verify)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    await expect(
      createService().changePassword('account-1', 'session-1', {
        currentPassword: 'CurrentPassword#42',
        newPassword: 'CurrentPassword#42',
        confirmPassword: 'CurrentPassword#42',
      }),
    ).rejects.toThrow(
      'New password must be different from the current password.',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('prevents concurrent requests from overwriting a newer password', async () => {
    jest
      .mocked(argon2.verify)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    transaction.account.updateMany.mockResolvedValueOnce({
      count: 0,
    });

    await expect(
      createService().changePassword(
        'account-1',
        'session-1',
        validRequest(),
      ),
    ).rejects.toThrow(
      'Password changed concurrently. Sign in again and retry.',
    );
  });

  it('keeps a committed change when notification delivery fails', async () => {
    jest
      .mocked(argon2.verify)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    jest
      .mocked(mailService.sendPasswordChangedNotification)
      .mockRejectedValueOnce(new Error('SMTP unavailable'));

    await expect(
      createService().changePassword(
        'account-1',
        'session-1',
        validRequest(),
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        revokedSessions: 3,
      }),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      'Password changed, but the security notification email was not delivered.',
    );
  });
});
