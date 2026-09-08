import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import {
  WorkRuntimeStatus,
  WorkStageStatus,
} from '../../generated/prisma/client';

export enum WorkReportV3SlaState {
  ON_TRACK = 'ON_TRACK',
  DUE_SOON = 'DUE_SOON',
  OVERDUE = 'OVERDUE',
}

export class WorkReportV3QueryDto {
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
  participantOrgUnitId?: string;

  @IsOptional()
  @IsUUID('4')
  operationalTeamId?: string;

  @IsOptional()
  @IsUUID('4')
  workTypeId?: string;

  @IsOptional()
  @IsEnum(WorkRuntimeStatus)
  runtimeStatus?: WorkRuntimeStatus;

  @IsOptional()
  @IsEnum(WorkStageStatus)
  stageStatus?: WorkStageStatus;

  @IsOptional()
  @IsEnum(WorkReportV3SlaState)
  slaState?: WorkReportV3SlaState;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}
