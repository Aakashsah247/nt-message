import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccountClasses } from '../auth/decorators/account-classes.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { AccountClassesGuard } from '../auth/guards/account-classes.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { AccountClass } from '../generated/prisma/client';
import {
  ExportWorkReportQueryDto,
  WorkReportDataset,
} from './dto/export-work-report-query.dto';
import {
  WorkReportDrilldownDataset,
  WorkReportDrilldownQueryDto,
} from './dto/work-report-drilldown-query.dto';
import {
  WorkReportQueryDto,
  WorkReportRecordsQueryDto,
} from './dto/work-report-office-query.dto';
import { WorkReportOfficeExportQueryDto } from './dto/work-report-office-export-query.dto';
import { SaveWorkReportSnapshotDto } from './dto/save-work-report-snapshot.dto';
import {
  WorkReportsService,
  type WorkReportDrilldownResponse,
} from './work-reports.service';
import { WorkReportsClassicService } from './work-reports-classic.service';

const REPORT_ACCOUNT_CLASSES = [
  AccountClass.SUPER_ADMIN,
  AccountClass.OFFICE_USER,
] as const;

@Controller('work-reports')
@UseGuards(AccessTokenGuard, AccountClassesGuard)
export class WorkReportsController {
  constructor(
    private readonly workReportsService: WorkReportsService,
    private readonly workReportsClassicService: WorkReportsClassicService,
  ) {}

  @Get('offices/:officeId/context')
  getContext(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
  ) {
    return this.workReportsClassicService.getContext(user, officeId);
  }

  @Get('offices/:officeId/count')
  getCount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkReportQueryDto,
  ) {
    return this.workReportsClassicService
      .getOverview(user, officeId, query)
      .then((report) => ({ count: report.totalWork }));
  }

  @Get('offices/:officeId/overview')
  getOverview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkReportQueryDto,
  ) {
    return this.workReportsClassicService.getOverview(user, officeId, query);
  }

  @Get('offices/:officeId/work-records')
  getWorkRecords(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkReportRecordsQueryDto,
  ) {
    return this.workReportsClassicService.getWorkRecords(user, officeId, query);
  }

  @Get('offices/:officeId/technical-performance')
  getTechnicalPerformance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkReportQueryDto,
  ) {
    return this.workReportsClassicService.getTechnicalPerformance(
      user,
      officeId,
      query,
    );
  }

  @Get('offices/:officeId/export')
  async exportOfficeCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkReportOfficeExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const report = await this.workReportsClassicService.exportCsv(
      user,
      officeId,
      query,
    );
    response.type('text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.filename}"`,
    );
    response.setHeader('X-Report-Row-Count', String(report.rowCount));
    response.setHeader('X-Report-Truncated', 'false');
    return report.content;
  }

  @Get('offices/:officeId/print-data')
  getPrintPayload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkReportOfficeExportQueryDto,
  ) {
    return this.workReportsClassicService.getPrintPayload(
      user,
      officeId,
      query,
    );
  }

  @Post('offices/:officeId/snapshots')
  saveSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Body() dto: SaveWorkReportSnapshotDto,
  ) {
    return this.workReportsClassicService.saveSnapshot(user, officeId, dto);
  }

  @Get('offices/:officeId/snapshots')
  listSnapshots(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
  ) {
    return this.workReportsClassicService.listSnapshots(user, officeId);
  }

  @Get('offices/:officeId/snapshots/:snapshotId')
  getSnapshot(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Param('snapshotId', new ParseUUIDPipe({ version: '4' }))
    snapshotId: string,
  ) {
    return this.workReportsClassicService.getSnapshot(
      user,
      officeId,
      snapshotId,
    );
  }

  @Get('offices/:officeId/duty-compatibility')
  getDutyCompatibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
  ) {
    void user;
    void officeId;
    return Promise.resolve(
      this.workReportsClassicService.getDutyCompatibility(),
    );
  }

  @Get('drilldown')
  @AccountClasses(...REPORT_ACCOUNT_CLASSES)
  getDrilldown(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkReportDrilldownQueryDto,
  ): Promise<WorkReportDrilldownResponse> {
    if (query.dataset !== WorkReportDrilldownDataset.DUTY_ASSIGNMENTS) {
      throw new BadRequestException(
        'This dataset is not available through the Duty drill-down endpoint.',
      );
    }

    // Duty remains on legacy hierarchy compatibility until Phase 11.
    return this.workReportsService.getDrilldown(user, query);
  }

  @Get('export')
  @AccountClasses(...REPORT_ACCOUNT_CLASSES)
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExportWorkReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    if (query.dataset !== WorkReportDataset.DUTY_ASSIGNMENTS) {
      throw new BadRequestException(
        'This dataset is not available through the Duty export endpoint.',
      );
    }

    const report = await this.workReportsService.exportCsv(user, query);
    response.type('text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${report.filename}"`,
    );
    response.setHeader('X-Report-Row-Count', String(report.rowCount));
    response.setHeader('X-Report-Truncated', String(report.truncated));
    return report.content;
  }
}
