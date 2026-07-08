import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AccessTokenGuard } from '../auth/guards/access-token.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { AccountRole } from '../generated/prisma/client';
import { RecordActivityEventDto } from './dto/record-activity-event.dto';
import { SuperAdminActivityLogQueryDto } from './dto/super-admin-activity-log-query.dto';
import { MonitoringService } from './monitoring.service';

@Controller('monitoring')
@UseGuards(AccessTokenGuard, RolesGuard)
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Post('activity')
  recordActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RecordActivityEventDto,
  ) {
    // Every authenticated role can record privacy-safe activity metadata.
    return this.monitoringService.recordActivity(user, dto);
  }

  @Get('superadmin')
  @Roles(AccountRole.SUPER_ADMIN)
  getSuperAdminMonitoring() {
    // Only Super Admin can view cross-employee monitoring summaries.
    return this.monitoringService.getSuperAdminDashboard();
  }

  @Get('superadmin/activity-logs')
  @Roles(AccountRole.SUPER_ADMIN)
  getSuperAdminActivityLogs(@Query() query: SuperAdminActivityLogQueryDto) {
    // Detailed audit logs are still privacy-safe and hide all message content.
    return this.monitoringService.getSuperAdminActivityLogs(query);
  }
}
