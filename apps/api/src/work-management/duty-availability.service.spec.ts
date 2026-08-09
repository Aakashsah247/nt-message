import { ConflictException } from '@nestjs/common';

import type { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  WorkAvailabilityPreference,
} from '../generated/prisma/enums';
import type { MessagingPresenceService } from '../realtime/messaging-presence.service';
import { DutyAvailabilityService } from './duty-availability.service';
import type { DutyNotificationsService } from './duty-notifications.service';
import type { WorkScopeService } from './work-scope.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const employeeUser = {
  accountId: 'employee',
  sessionId: 'session',
  username: 'employee@ntc.test',
  role: AccountRole.EMPLOYEE,
};

describe('DutyAvailabilityService M20 Phase 5', () => {
  const transaction = {
    employeeWorkAvailability: { upsert: jest.fn() },
    dutyActivity: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(),
    dutyException: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    dutyAssignment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    employeeWorkAvailability: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    workItem: { findFirst: jest.fn() },
    account: { findMany: jest.fn(), findFirst: jest.fn() },
    workAssignment: { findMany: jest.fn() },
    department: { findMany: jest.fn() },
  } as unknown as PrismaService;
  const scope = {
    resolveActorContext: jest.fn(),
  } as unknown as WorkScopeService;
  const presence = {
    getSnapshot: jest.fn().mockReturnValue([]),
  } as unknown as MessagingPresenceService;
  const notifications = {
    publishDutyUpdate: jest.fn(),
  } as unknown as DutyNotificationsService;
  const service = new DutyAvailabilityService(
    prisma,
    scope,
    presence,
    notifications,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(scope.resolveActorContext).mockResolvedValue({
      accountId: 'employee',
      role: AccountRole.EMPLOYEE,
      divisionId: 'division-a',
      departmentId: 'department-a',
    });
    jest
      .mocked(prisma.$transaction)
      .mockImplementation(async (callback: unknown) =>
        (callback as (client: typeof transaction) => Promise<unknown>)(
          transaction,
        ) as never,
      );
  });

  it('shows availability only when the employee is currently on duty', async () => {
    const now = new Date();
    jest.mocked(prisma.dutyException.findUnique).mockResolvedValue(null);
    jest
      .mocked(prisma.dutyAssignment.findFirst)
      .mockResolvedValueOnce({
        id: 'duty-1',
        dutyDate: new Date(now.toISOString().slice(0, 10)),
        startsAt: new Date(now.getTime() - 60_000),
        endsAt: new Date(now.getTime() + 60_000),
        reportingLocation: 'Patan',
        notes: null,
        authority: 'SUPER_ADMIN_OVERRIDE',
        overrideReason: 'Branch incident coverage',
        hierarchyOverride: true,
        conflictOverride: false,
        cancelledAt: null,
        shiftTemplateId: 'shift',
        shiftName: 'Office Shift',
        shiftStartMinute: 540,
        shiftEndMinute: 1080,
        shiftSpansNextDay: false,
        createdBy: {
          id: 'super-admin',
          username: 'admin@ntc.test',
          employee: { empName: 'Branch Administrator' },
        },
        shift: {
          id: 'shift',
          name: 'Office Shift',
          startMinute: 540,
          endMinute: 1080,
          spansNextDay: false,
        },
        supervisor: { id: 'manager' },
        department: { id: 'department-a', code: 'NET', name: 'Network' },
        division: { id: 'division-a', code: 'TECH', name: 'Technical' },
      } as never)
      .mockResolvedValueOnce(null);
    jest.mocked(prisma.dutyAssignment.findMany).mockResolvedValue([]);
    jest.mocked(prisma.employeeWorkAvailability.findUnique).mockResolvedValue({
      preference: WorkAvailabilityPreference.AVAILABLE,
      updatedAt: now,
    } as never);

    const result = await service.getMyDutySummary(employeeUser);

    expect(result.effectiveStatus).toBe('ON_DUTY');
    expect(result.availability.effective).toBe('AVAILABLE');
    expect(result.current).toEqual(
      expect.objectContaining({
        authority: 'SUPER_ADMIN_OVERRIDE',
        overrideReason: 'Branch incident coverage',
        createdBy: expect.objectContaining({ id: 'super-admin' }),
      }),
    );
    expect(prisma.dutyAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          authority: true,
          overrideReason: true,
          createdBy: expect.any(Object),
        }),
      }),
    );
  });

  it('records an employee busy preference without claiming attendance', async () => {
    transaction.employeeWorkAvailability.upsert.mockResolvedValue({
      preference: WorkAvailabilityPreference.BUSY,
      updatedAt: new Date(),
    });
    jest.mocked(prisma.dutyException.findUnique).mockResolvedValue(null);
    jest.mocked(prisma.dutyAssignment.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.dutyAssignment.findMany).mockResolvedValue([]);
    jest.mocked(prisma.employeeWorkAvailability.findUnique).mockResolvedValue({
      preference: WorkAvailabilityPreference.BUSY,
      updatedAt: new Date(),
    } as never);

    const result = await service.updateMyAvailability(employeeUser, {
      preference: WorkAvailabilityPreference.BUSY,
    });

    expect(transaction.dutyActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'AVAILABILITY_CHANGED' }),
      }),
    );
    expect(result.availability.preference).toBe(
      WorkAvailabilityPreference.BUSY,
    );
  });

  it('rejects direct help when the selected coworker is off duty', async () => {
    jest.mocked(prisma.account.findFirst).mockResolvedValue({ id: 'helper' } as never);
    jest.mocked(prisma.dutyAssignment.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.dutyException.findUnique).mockResolvedValue(null);
    jest.mocked(prisma.employeeWorkAvailability.findUnique).mockResolvedValue(null);

    await expect(
      service.assertCanReceiveDirectHelp('helper', 'department-a'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
