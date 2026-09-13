import { BadRequestException } from '@nestjs/common';
import { AccountClass, AccountRole } from '../generated/prisma/client';
import { WorkReportDataset } from './dto/export-work-report-query.dto';
import { WorkReportDrilldownDataset } from './dto/work-report-drilldown-query.dto';
import { WorkReportsService } from './work-reports.service';

const actor = {
  accountId: 'account-1',
  accountClass: AccountClass.OFFICE_USER,
  role: AccountRole.EMPLOYEE,
  officeId: 'office-1',
  primaryOrgUnitId: 'org-1',
  visibleOrgUnitIds: ['org-1'],
  assignableOrgUnitIds: [],
  operationalTeamLeadIds: [],
};

describe('WorkReportsService — Duty compatibility only', () => {
  const prisma = {
    dutyAssignment: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    dutyException: { count: jest.fn() },
    office: { findUnique: jest.fn() },
    account: { findUnique: jest.fn() },
  };
  const scope = {
    resolveActorContext: jest.fn().mockResolvedValue(actor),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    scope.resolveActorContext.mockResolvedValue(actor);
    prisma.dutyAssignment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    prisma.dutyAssignment.count.mockResolvedValue(0);
    prisma.dutyException.count.mockResolvedValue(0);
  });

  it('serves only the retained Duty drill-down compatibility dataset', async () => {
    const service = new WorkReportsService(prisma as never, scope as never);

    const result = await service.getDrilldown(
      { accountId: actor.accountId } as never,
      {
        dataset: WorkReportDrilldownDataset.DUTY_ASSIGNMENTS,
        from: '2026-09-01',
        to: '2026-09-02',
        page: 1,
        limit: 25,
      },
    );

    expect(result.dataset).toBe(WorkReportDrilldownDataset.DUTY_ASSIGNMENTS);
    expect(result.sections.work).toBeNull();
    expect(result.sections.performance).toBeNull();
    expect(result.sections.duty.rows).toEqual([]);
  });

  it('exports the complete retained Duty compatibility dataset', async () => {
    prisma.dutyAssignment.count.mockResolvedValue(1);
    prisma.dutyAssignment.findMany.mockReset().mockResolvedValue([
      {
        dutyDate: new Date('2026-09-01T00:00:00.000Z'),
        startsAt: new Date('2026-09-01T02:15:00.000Z'),
        endsAt: new Date('2026-09-01T10:15:00.000Z'),
        reportingLocation: 'Patan',
        notes: null,
        cancelledAt: null,
        cancellationReason: null,
        shiftName: 'Morning',
        shift: { name: 'Morning' },
        orgUnit: { code: 'AN', name: 'Access Network' },
        employee: {
          username: 'employee',
          employee: { empName: 'Employee One', empId: 'NTC-1' },
        },
        supervisor: {
          username: 'supervisor',
          employee: { empName: 'Supervisor One', empId: 'NTC-2' },
        },
      },
    ]);

    const service = new WorkReportsService(prisma as never, scope as never);
    const result = await service.exportCsv(
      { accountId: actor.accountId } as never,
      {
        dataset: WorkReportDataset.DUTY_ASSIGNMENTS,
        from: '2026-09-01',
        to: '2026-09-02',
      },
    );

    expect(result.filename).toBe(
      'duty-assignments-2026-09-01-to-2026-09-02.csv',
    );
    expect(result.rowCount).toBe(1);
    expect(result.content).toContain('Employee One (NTC-1)');
  });

  it('rejects retired legacy Work report datasets defensively', async () => {
    const service = new WorkReportsService(prisma as never, scope as never);

    await expect(
      service.getDrilldown({ accountId: actor.accountId } as never, {
        dataset: 'WORK_RECORDS' as WorkReportDrilldownDataset,
        page: 1,
        limit: 25,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
