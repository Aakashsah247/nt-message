import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  WorkRuntimeStatus,
  WorkSlaBasis,
  WorkStageResponsibleOrgUnitRule,
  WorkStageStatus,
} from '../generated/prisma/client';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import type { ReplaceOfficeWorkingCalendarDto } from './dto/work-runtime-v3-sla.dto';
import { WorkRuntimeV3SlaService } from './work-runtime-v3-sla.service';

const officeId = '11111111-1111-4111-8111-111111111111';
const user = {
  accountId: '22222222-2222-4222-8222-222222222222',
  role: AccountRole.EMPLOYEE,
} as AuthenticatedUser;

function workingCalendar(overrides: Record<string, unknown> = {}) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    officeId,
    timeZone: 'Asia/Kathmandu',
    isActive: true,
    version: 1,
    intervals: [1, 2, 3, 4, 5].map((weekday) => ({
      weekday,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    })),
    closures: [],
    ...overrides,
  };
}

describe('WorkRuntimeV3SlaService', () => {
  it('keeps calendar-duration SLA as continuous elapsed time', async () => {
    const prisma = {} as PrismaService;
    const authorization = {} as OrganizationAuthorizationService;
    const service = new WorkRuntimeV3SlaService(prisma, authorization);
    const start = new Date('2026-09-11T10:15:00.000Z');

    await expect(
      service.resolveDueAt(
        {} as never,
        officeId,
        WorkSlaBasis.CALENDAR_DURATION,
        start,
        120,
      ),
    ).resolves.toEqual(new Date('2026-09-11T12:15:00.000Z'));
  });

  it('adds Office-working SLA only inside configured intervals and skips closures', async () => {
    const tx = {
      officeWorkingCalendar: {
        findUnique: jest.fn().mockResolvedValue(
          workingCalendar({
            closures: [{ closureDate: new Date('2026-09-14T00:00:00.000Z') }],
          }),
        ),
      },
    };
    const service = new WorkRuntimeV3SlaService(
      {} as PrismaService,
      {} as OrganizationAuthorizationService,
    );

    // Friday 16:00 Nepal time. One hour is consumed Friday; weekend and the
    // configured Monday closure are skipped; the second hour ends Tuesday 10:00.
    await expect(
      service.resolveDueAt(
        tx as never,
        officeId,
        WorkSlaBasis.OFFICE_WORKING_DURATION,
        new Date('2026-09-11T10:15:00.000Z'),
        120,
      ),
    ).resolves.toEqual(new Date('2026-09-15T04:15:00.000Z'));
  });

  it('rejects Office-working SLA when no active calendar is configured', async () => {
    const tx = {
      officeWorkingCalendar: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new WorkRuntimeV3SlaService(
      {} as PrismaService,
      {} as OrganizationAuthorizationService,
    );

    await expect(
      service.resolveDueAt(
        tx as never,
        officeId,
        WorkSlaBasis.OFFICE_WORKING_DURATION,
        new Date('2026-09-11T10:15:00.000Z'),
        60,
      ),
    ).rejects.toThrow('requires an active Office working calendar');
  });

  it('stores a validated calendar under optimistic concurrency', async () => {
    const dto: ReplaceOfficeWorkingCalendarDto = {
      expectedVersion: 0,
      isActive: true,
      timeZone: 'Asia/Kathmandu',
      intervals: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
      closures: [{ date: '2026-09-21', label: 'Office closure' }],
    };
    const tx = {
      office: {
        findUnique: jest.fn().mockResolvedValue({ id: officeId, isActive: true }),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      officeWorkingCalendar: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: '33333333-3333-4333-8333-333333333333',
        }),
      },
      officeWorkingCalendarInterval: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      officeWorkingCalendarClosure: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
      office: {
        findUnique: jest.fn().mockResolvedValue({
          id: officeId,
          code: 'PATAN',
          name: 'Patan Telecom Office',
          isActive: true,
        }),
      },
      officeWorkingCalendar: {
        findUnique: jest.fn().mockResolvedValue({
          ...workingCalendar(),
          updatedByAccountId: user.accountId,
          createdAt: new Date('2026-09-08T00:00:00.000Z'),
          updatedAt: new Date('2026-09-08T00:00:00.000Z'),
          intervals: [
            {
              id: '44444444-4444-4444-8444-444444444444',
              weekday: 1,
              startMinute: 540,
              endMinute: 1020,
            },
          ],
          closures: [
            {
              id: '55555555-5555-4555-8555-555555555555',
              closureDate: new Date('2026-09-21T00:00:00.000Z'),
              label: 'Office closure',
            },
          ],
        }),
      },
    };
    const authorization = {
      assertCan: jest.fn().mockResolvedValue(undefined),
      can: jest.fn().mockResolvedValue(true),
    };
    const service = new WorkRuntimeV3SlaService(
      prisma as unknown as PrismaService,
      authorization as unknown as OrganizationAuthorizationService,
    );

    await expect(
      service.replaceOfficeWorkingCalendar(user, officeId, dto),
    ).resolves.toEqual(
      expect.objectContaining({
        calendar: expect.objectContaining({ officeId }),
      }),
    );

    expect(tx.officeWorkingCalendar.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          officeId,
          timeZone: 'Asia/Kathmandu',
          updatedByAccountId: user.accountId,
        }),
      }),
    );
    expect(tx.officeWorkingCalendarInterval.createMany).toHaveBeenCalled();
    expect(tx.officeWorkingCalendarClosure.createMany).toHaveBeenCalled();
  });

  it('rejects overlapping working intervals before touching the database', async () => {
    const prisma = {
      $transaction: jest.fn(),
    };
    const authorization = {
      assertCan: jest.fn().mockResolvedValue(undefined),
    };
    const service = new WorkRuntimeV3SlaService(
      prisma as unknown as PrismaService,
      authorization as unknown as OrganizationAuthorizationService,
    );

    await expect(
      service.replaceOfficeWorkingCalendar(user, officeId, {
        expectedVersion: 0,
        isActive: true,
        timeZone: 'Asia/Kathmandu',
        intervals: [
          { weekday: 1, startMinute: 540, endMinute: 720 },
          { weekday: 1, startMinute: 660, endMinute: 840 },
        ],
        closures: [],
      }),
    ).rejects.toThrow('cannot overlap');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('attributes participant/dependency/queue/active/block/approval time separately', async () => {
    const workItemId = '66666666-6666-4666-8666-666666666666';
    const stageId = '77777777-7777-4777-8777-777777777777';
    const prisma = {
      $transaction: jest.fn(async (callback: (client: unknown) => unknown) =>
        callback({
          workItem: {
            findFirst: jest.fn().mockResolvedValue({
              id: workItemId,
              ticketNumber: 'NT-PATAN-000001',
              runtimeStatus: WorkRuntimeStatus.IN_PROGRESS,
              dueAt: new Date('2026-09-08T04:00:00.000Z'),
              createdAt: new Date('2026-09-08T00:00:00.000Z'),
              workTypeVersion: { slaBasis: WorkSlaBasis.CALENDAR_DURATION },
              runtimeStages: [
                {
                  id: stageId,
                  code: 'ACCOUNTS',
                  name: 'Accounts verification',
                  status: WorkStageStatus.SUBMITTED,
                  dueAt: new Date('2026-09-08T03:00:00.000Z'),
                  createdAt: new Date('2026-09-08T00:00:00.000Z'),
                  stageDefinition: {
                    responsibleOrgUnitRule:
                      WorkStageResponsibleOrgUnitRule.RUNTIME_REQUESTED_PARTICIPANT,
                  },
                  collaborationRequests: [
                    { respondedAt: new Date('2026-09-08T00:10:00.000Z') },
                  ],
                  events: [
                    {
                      createdAt: new Date('2026-09-08T00:20:00.000Z'),
                      fromStageStatus: WorkStageStatus.PENDING,
                      toStageStatus: WorkStageStatus.READY,
                    },
                    {
                      createdAt: new Date('2026-09-08T00:30:00.000Z'),
                      fromStageStatus: WorkStageStatus.READY,
                      toStageStatus: WorkStageStatus.IN_PROGRESS,
                    },
                    {
                      createdAt: new Date('2026-09-08T00:50:00.000Z'),
                      fromStageStatus: WorkStageStatus.IN_PROGRESS,
                      toStageStatus: WorkStageStatus.BLOCKED,
                    },
                    {
                      createdAt: new Date('2026-09-08T01:00:00.000Z'),
                      fromStageStatus: WorkStageStatus.BLOCKED,
                      toStageStatus: WorkStageStatus.IN_PROGRESS,
                    },
                    {
                      createdAt: new Date('2026-09-08T01:20:00.000Z'),
                      fromStageStatus: WorkStageStatus.IN_PROGRESS,
                      toStageStatus: WorkStageStatus.SUBMITTED,
                    },
                  ],
                },
              ],
            }),
          },
        }),
      ),
    };
    const service = new WorkRuntimeV3SlaService(
      prisma as unknown as PrismaService,
      {} as OrganizationAuthorizationService,
    );

    const result = await service.getWorkSlaSummary(
      officeId,
      workItemId,
      new Date('2026-09-08T01:30:00.000Z'),
    );

    expect(result.stages[0]).toEqual(
      expect.objectContaining({
        participantWaitingMinutes: 10,
        dependencyOrActivationWaitingMinutes: 10,
        queueWaitingMinutes: 10,
        activeProcessingMinutes: 40,
        blockedMinutes: 10,
        approvalWaitingMinutes: 10,
      }),
    );
  });
});
