import {
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  AccountRole,
  IdentityCorrectionField,
} from '../generated/prisma/enums';
import type { MailService } from '../mail/mail.service';
import { EmployeeIdentityCorrectionService } from './employee-identity-correction.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const superAdminUser = {
  accountId: 'super-admin-account',
  accountClass: AccountClass.SUPER_ADMIN,
  role: AccountRole.SUPER_ADMIN,
} as AuthenticatedUser;

const employeeUser = {
  accountId: 'employee-account',
  accountClass: AccountClass.OFFICE_USER,
  role: AccountRole.EMPLOYEE,
} as AuthenticatedUser;

function activeEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: 'employee-1',
    empId: 'NTC-1001',
    empName: 'Aakash Sah',
    phoneNumber: '+9779801234567',
    officialEmail: 'aakash@ntc.net.np',
    designation: 'Engineer',
    divisionId: 'legacy-division',
    departmentId: 'legacy-department',
    isActivated: true,
    account: {
      id: 'account-1',
      username: 'ntc-1001',
      role: AccountRole.EMPLOYEE,
      accountClass: AccountClass.OFFICE_USER,
      isEnabled: true,
    },
    ...overrides,
  };
}

describe('EmployeeIdentityCorrectionService', () => {
  it('rejects every non-Super-Admin actor before reading employee data', async () => {
    const prisma = {
      employee: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    const mail = {
      sendIdentityCorrectionNotification: jest.fn(),
    } as unknown as MailService;
    const service = new EmployeeIdentityCorrectionService(prisma, mail);

    await expect(
      service.correctIdentity(
        employeeUser,
        'employee-1',
        {
          empName: 'Corrected Name',
          reason: 'Correct spelling',
        },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.employee.findUnique).not.toHaveBeenCalled();
  });

  it('corrects employee ID and official email atomically, revokes security state, and audits before/after values', async () => {
    const transaction = {
      employee: {
        findUnique: jest.fn().mockResolvedValue(activeEmployee()),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({
          ...activeEmployee(),
          empId: 'NTC-2001',
          officialEmail: 'corrected@ntc.net.np',
          account: {
            id: 'account-1',
            username: 'ntc-2001',
            role: AccountRole.EMPLOYEE,
            accountClass: AccountClass.OFFICE_USER,
            isEnabled: true,
          },
        }),
      },
      accountRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      account: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ id: 'account-1' }),
      },
      authSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      passwordResetChallenge: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      otpVerification: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      identityCorrectionAudit: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const mail = {
      sendIdentityCorrectionNotification: jest.fn().mockResolvedValue(undefined),
    } as unknown as MailService;
    const service = new EmployeeIdentityCorrectionService(prisma, mail);

    const result = await service.correctIdentity(
      superAdminUser,
      'employee-1',
      {
        empId: 'ntc-2001',
        officialEmail: ' corrected@ntc.net.np ',
        reason: ' Correct official identity record ',
      },
      { ipAddress: '127.0.0.1', userAgent: 'jest' },
    );

    expect(transaction.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'account-1' },
        data: { username: 'ntc-2001' },
      }),
    );
    expect(transaction.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          empId: 'NTC-2001',
          officialEmail: 'corrected@ntc.net.np',
        },
      }),
    );
    expect(transaction.employee.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          divisionId: expect.anything(),
        }),
      }),
    );
    expect(transaction.authSession.updateMany).toHaveBeenCalled();
    expect(transaction.passwordResetChallenge.updateMany).toHaveBeenCalled();
    expect(transaction.otpVerification.updateMany).toHaveBeenCalled();

    const auditRows = transaction.identityCorrectionAudit.createMany.mock
      .calls[0][0].data;
    expect(auditRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: IdentityCorrectionField.EMPLOYEE_ID,
          oldValue: 'NTC-1001',
          newValue: 'NTC-2001',
          reason: 'Correct official identity record',
        }),
        expect.objectContaining({
          field: IdentityCorrectionField.OFFICIAL_EMAIL,
          oldValue: 'aakash@ntc.net.np',
          newValue: 'corrected@ntc.net.np',
          reason: 'Correct official identity record',
        }),
      ]),
    );
    expect(mail.sendIdentityCorrectionNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'corrected@ntc.net.np',
        sessionsRevoked: 2,
      }),
    );
    expect(result.security).toMatchObject({
      revokedSessions: 2,
      invalidatedRecoveryChallenges: 1,
      invalidatedRecoveryOtps: 1,
      accountUsernameUpdated: true,
      notificationSent: true,
    });
  });

  it('audits a phone-only correction without revoking sessions or sending a login notification', async () => {
    const transaction = {
      employee: {
        findUnique: jest.fn().mockResolvedValue(activeEmployee()),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({
          ...activeEmployee(),
          phoneNumber: '+9779811234567',
        }),
      },
      accountRequest: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      account: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      authSession: {
        updateMany: jest.fn(),
      },
      passwordResetChallenge: {
        updateMany: jest.fn(),
      },
      otpVerification: {
        updateMany: jest.fn(),
      },
      identityCorrectionAudit: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const mail = {
      sendIdentityCorrectionNotification: jest.fn(),
    } as unknown as MailService;
    const service = new EmployeeIdentityCorrectionService(prisma, mail);

    const result = await service.correctIdentity(
      superAdminUser,
      'employee-1',
      {
        phoneNumber: '9811234567',
        reason: 'Correct phone number',
      },
      { ipAddress: null, userAgent: null },
    );

    expect(transaction.authSession.updateMany).not.toHaveBeenCalled();
    expect(transaction.passwordResetChallenge.updateMany).not.toHaveBeenCalled();
    expect(mail.sendIdentityCorrectionNotification).not.toHaveBeenCalled();
    expect(result.security.revokedSessions).toBe(0);
    expect(result.security.notificationSent).toBeNull();
  });

  it('rejects corrections before account activation', async () => {
    const transaction = {
      employee: {
        findUnique: jest.fn().mockResolvedValue(
          activeEmployee({
            isActivated: false,
            account: null,
          }),
        ),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const mail = {
      sendIdentityCorrectionNotification: jest.fn(),
    } as unknown as MailService;
    const service = new EmployeeIdentityCorrectionService(prisma, mail);

    await expect(
      service.correctIdentity(
        superAdminUser,
        'employee-1',
        {
          empName: 'Corrected Name',
          reason: 'Correct spelling',
        },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a duplicate official email before any employee update', async () => {
    const transaction = {
      employee: {
        findUnique: jest.fn().mockResolvedValue(activeEmployee()),
        findFirst: jest.fn().mockResolvedValue({
          empId: 'NTC-9999',
          officialEmail: 'used@ntc.net.np',
          phoneNumber: '+9779899999999',
        }),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      ),
    } as unknown as PrismaService;
    const mail = {
      sendIdentityCorrectionNotification: jest.fn(),
    } as unknown as MailService;
    const service = new EmployeeIdentityCorrectionService(prisma, mail);

    await expect(
      service.correctIdentity(
        superAdminUser,
        'employee-1',
        {
          officialEmail: 'USED@NTC.NET.NP',
          reason: 'Correct official email',
        },
        { ipAddress: null, userAgent: null },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(transaction.employee.update).not.toHaveBeenCalled();
  });
});
