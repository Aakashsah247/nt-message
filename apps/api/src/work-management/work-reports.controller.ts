import {
  Controller,
  Get,
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
import { ExportWorkReportQueryDto } from './dto/export-work-report-query.dto';
import { WorkReportDrilldownQueryDto } from './dto/work-report-drilldown-query.dto';
import { WorkReportQueryDto } from './dto/work-report-query.dto';
import {
  WorkReportsService,
  type WorkReportDrilldownResponse,
  type WorkReportSummary,
} from './work-reports.service';

const MANAGEMENT_REPORT_ROLES = [
  AccountRole.SUPER_ADMIN,
  AccountRole.SENIOR_MANAGEMENT,
  AccountRole.TEAM_MANAGER,
] as const;

@Controller('work-reports')
@UseGuards(AccessTokenGuard, RolesGuard)
export class WorkReportsController {
  constructor(private readonly workReportsService: WorkReportsService) {}

  @Get('summary')
  @Roles(...MANAGEMENT_REPORT_ROLES)
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkReportQueryDto,
  ): Promise<WorkReportSummary> {
    // Every report is rebuilt from server-owned role and organization scope.
    return this.workReportsService.getSummary(user, query);
  }

  @Get('drilldown')
  @Roles(...MANAGEMENT_REPORT_ROLES)
  getDrilldown(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorkReportDrilldownQueryDto,
  ): Promise<WorkReportDrilldownResponse> {
    // Drill-downs remain paginated and server-scoped so executive reports never become unrestricted data browsers.
    return this.workReportsService.getDrilldown(user, query);
  }

  @Get('export')
  @Roles(...MANAGEMENT_REPORT_ROLES)
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ExportWorkReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
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
