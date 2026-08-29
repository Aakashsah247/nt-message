import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { WorkItemType } from '../../generated/prisma/client';

export enum WorkReportWorkflowStageFilter {
  OVERDUE = 'OVERDUE',
  WAITING_FOR_SALES = 'WAITING_FOR_SALES',
  WAITING_FOR_APPROVAL = 'WAITING_FOR_APPROVAL',
  RETURNED_FOR_CORRECTION = 'RETURNED_FOR_CORRECTION',
}

export class WorkReportQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;


  @IsOptional()
  @IsEnum(WorkItemType)
  type?: WorkItemType;

  @IsOptional()
  @IsUUID('4')
  divisionId?: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsUUID('4')
  teamId?: string;

  @IsOptional()
  @IsEnum(WorkReportWorkflowStageFilter)
  workflowStage?: WorkReportWorkflowStageFilter;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}
