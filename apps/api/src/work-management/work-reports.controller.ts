import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { AccountRole } from '../generated/prisma/client';
import {
  ExportWorkReportQueryDto,
  WorkReportDataset,
} from './dto/export-work-report-query.dto';
import {
  WorkReportDrilldownDataset,
  WorkReportDrilldownQueryDto,
} from './dto/work-report-drilldown-query.dto';
import {
  WorkReportV3QueryDto,
  WorkReportV3RecordsQueryDto,
  WorkReportV3StageAnalysisQueryDto,
} from './dto/work-report-v3-query.dto';
import { WorkReportV3ExportQueryDto } from './dto/work-report-v3-export-query.dto';
import {
  WorkReportsService,
  type WorkReportDrilldownResponse,
} from './work-reports.service';
import {
  WorkReportsV3Service,
  type WorkReportV3Context,
  type WorkReportV3DutyCompatibility,
  type WorkReportV3CountResult,
  type WorkReportV3Overview,
  type WorkReportV3PrintPayload,
  type WorkReportV3Reconciliation,
  type WorkReportV3StageAnalysis,
  type WorkReportV3TechnicalPerformance,
  type WorkReportV3WorkRecords,
} from './work-reports-v3.service';

const MANAGEMENT_REPORT_ROLES = [
  AccountRole.SUPER_ADMIN,
  AccountRole.SENIOR_MANAGEMENT,
  AccountRole.TEAM_MANAGER,
] as const;

@Controller('work-reports')
@UseGuards(AccessTokenGuard, RolesGuard)
export class WorkReportsController {
  constructor(
    private readonly workReportsService: WorkReportsService,
    private readonly workReportsV3Service: WorkReportsV3Service,
  ) {}

  @Get('v3/offices/:officeId/context')
  getV3Context(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
  ): Promise<WorkReportV3Context> {
    return this.workReportsV3Service.getContext(user, officeId);
  }

  @Get('v3/offices/:officeId/count')
  getV3Count(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkReportV3QueryDto,
  ): Promise<WorkReportV3CountResult> {
    return this.workReportsV3Service.getDistinctWorkCount(
      user,
      officeId,
      query,
    );
  }

  @Get('v3/offices/:officeId/overview')
  getV3Overview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkReportV3QueryDto,
  ): Promise<WorkReportV3Overview> {
    return this.workReportsV3Service.getOverview(user, officeId, query);
  }

  @Get('v3/offices/:officeId/work-records')
  getV3WorkRecords(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkReportV3RecordsQueryDto,
  ): Promise<WorkReportV3WorkRecords> {
    return this.workReportsV3Service.getWorkRecords(user, officeId, query);
  }

  @Get('v3/offices/:officeId/technical-performance')
  getV3TechnicalPerformance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkReportV3QueryDto,
  ): Promise<WorkReportV3TechnicalPerformance> {
    return this.workReportsV3Service.getTechnicalPerformance(
      user,
      officeId,
      query,
    );
  }

  @Get('v3/offices/:officeId/stage-sla')
  getV3StageAnalysis(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkReportV3StageAnalysisQueryDto,
  ): Promise<WorkReportV3StageAnalysis> {
    return this.workReportsV3Service.getStageAnalysis(user, officeId, query);
  }

  @Get('v3/offices/:officeId/export')
  async exportV3Csv(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkReportV3ExportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const report = await this.workReportsV3Service.exportCsv(
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

  @Get('v3/offices/:officeId/print-data')
  getV3PrintPayload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
    @Query() query: WorkReportV3ExportQueryDto,
  ): Promise<WorkReportV3PrintPayload> {
    return this.workReportsV3Service.getPrintPayload(user, officeId, query);
  }

  @Get('v3/offices/:officeId/duty-compatibility')
  getV3DutyCompatibility(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
  ): Promise<WorkReportV3DutyCompatibility> {
    return this.workReportsV3Service.getDutyCompatibility(user, officeId);
  }

  @Get('v3/offices/:officeId/reconciliation')
  getV3Reconciliation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('officeId', new ParseUUIDPipe({ version: '4' })) officeId: string,
  ): Promise<WorkReportV3Reconciliation> {
    return this.workReportsV3Service.getReconciliation(user, officeId);
  }

  @Get('drilldown')
  @Roles(...MANAGEMENT_REPORT_ROLES)
  getDrilldown(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkReportDrilldownQueryDto,
  ): Promise<WorkReportDrilldownResponse> {
    if (query.dataset !== WorkReportDrilldownDataset.DUTY_ASSIGNMENTS) {
      throw new BadRequestException(
        'Legacy Work report drill-downs are retired. Use the Reports V3 Office endpoints.',
      );
    }

    // Duty remains on legacy hierarchy compatibility until Phase 11.
    return this.workReportsService.getDrilldown(user, query);
  }

  @Get('export')
  @Roles(...MANAGEMENT_REPORT_ROLES)
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExportWorkReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    if (query.dataset !== WorkReportDataset.DUTY_ASSIGNMENTS) {
      throw new BadRequestException(
        'Legacy Work report exports are retired. Use the Reports V3 Office export endpoint.',
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
