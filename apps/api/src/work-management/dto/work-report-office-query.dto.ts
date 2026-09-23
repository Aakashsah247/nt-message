import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { WorkItemStatus } from '../../generated/prisma/client';

export enum WorkReportWorkflowStage {
  WAITING_FOR_SALES = 'WAITING_FOR_SALES',
  WAITING_FOR_APPROVAL = 'WAITING_FOR_APPROVAL',
  RETURNED_FOR_CORRECTION = 'RETURNED_FOR_CORRECTION',
}

export enum WorkReportSlaState {
  ON_TRACK = 'ON_TRACK',
  DUE_SOON = 'DUE_SOON',
  OVERDUE = 'OVERDUE',
}

export class WorkReportQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsUUID('4')
  orgUnitId?: string;

  @IsOptional()
  @IsUUID('4')
  operationalTeamId?: string;

  @IsOptional()
  @IsUUID('4')
  workTypeId?: string;

  @IsOptional()
  @IsEnum(WorkItemStatus)
  status?: WorkItemStatus;

  @IsOptional()
  @IsEnum(WorkReportSlaState)
  slaState?: WorkReportSlaState;

  @IsOptional()
  @IsEnum(WorkReportWorkflowStage)
  workflowStage?: WorkReportWorkflowStage;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}

export class WorkReportRecordsQueryDto extends WorkReportQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 25;
}
