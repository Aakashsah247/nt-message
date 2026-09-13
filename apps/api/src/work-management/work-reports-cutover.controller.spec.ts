import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { AccountRole } from '../generated/prisma/client';
import {
  WorkReportDataset,
  type ExportWorkReportQueryDto,
} from './dto/export-work-report-query.dto';
import {
  WorkReportDrilldownDataset,
  type WorkReportDrilldownQueryDto,
} from './dto/work-report-drilldown-query.dto';
import { WorkReportsController } from './work-reports.controller';

function createController() {
  const legacy = {
    getDrilldown: jest.fn().mockResolvedValue({ dataset: 'DUTY_ASSIGNMENTS' }),
    exportCsv: jest.fn().mockResolvedValue({
      filename: 'duty.csv',
      content: 'Duty Date\n2026-09-09',
      rowCount: 1,
      truncated: false,
    }),
  };
  const v3 = {};
  type Args = ConstructorParameters<typeof WorkReportsController>;
  return {
    controller: new WorkReportsController(
      legacy as unknown as Args[0],
      v3 as unknown as Args[1],
    ),
    legacy,
  };
}

const user = {
  accountId: '11111111-1111-4111-8111-111111111111',
  role: AccountRole.SUPER_ADMIN,
} as unknown as AuthenticatedUser;

const response = {
  type: jest.fn(),
  setHeader: jest.fn(),
} as unknown as Response;

describe('WorkReportsController — P10-6 legacy Work report cutover', () => {
  it('removes the legacy summary route from the active controller contract', () => {
    const { controller } = createController();
    expect('getSummary' in controller).toBe(false);
  });

  it('rejects legacy Work drill-down datasets while preserving Duty compatibility', async () => {
    const { controller, legacy } = createController();

    expect(() =>
      controller.getDrilldown(user, {
        dataset: WorkReportDrilldownDataset.WORK_RECORDS,
      } as WorkReportDrilldownQueryDto),
    ).toThrow(BadRequestException);
    expect(legacy.getDrilldown).not.toHaveBeenCalled();

    await expect(
      controller.getDrilldown(user, {
        dataset: WorkReportDrilldownDataset.DUTY_ASSIGNMENTS,
      } as WorkReportDrilldownQueryDto),
    ).resolves.toEqual({ dataset: 'DUTY_ASSIGNMENTS' });
    expect(legacy.getDrilldown).toHaveBeenCalledTimes(1);
  });

  it('rejects legacy Work CSV datasets while preserving Duty export compatibility', async () => {
    const { controller, legacy } = createController();

    await expect(
      controller.exportCsv(
        user,
        { dataset: WorkReportDataset.WORK_RECORDS } as ExportWorkReportQueryDto,
        response,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(legacy.exportCsv).not.toHaveBeenCalled();

    await expect(
      controller.exportCsv(
        user,
        {
          dataset: WorkReportDataset.DUTY_ASSIGNMENTS,
        } as ExportWorkReportQueryDto,
        response,
      ),
    ).resolves.toBe('Duty Date\n2026-09-09');
    expect(legacy.exportCsv).toHaveBeenCalledTimes(1);
  });
});
