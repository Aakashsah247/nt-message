import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import {
  AccountRole,
  WorkItemStatus,
  WorkItemType,
  WorkPriority,
} from '../../generated/prisma/client';

export enum WorkReportDutyStatus {
  SCHEDULED = 'SCHEDULED',
  CANCELLED = 'CANCELLED',
}

export class WorkReportQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsEnum(WorkItemStatus)
  status?: WorkItemStatus;

  @IsOptional()
  @IsEnum(WorkPriority)
  priority?: WorkPriority;

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
  employeeAccountId?: string;

  @IsOptional()
  @IsUUID('4')
  assignedByAccountId?: string;

  @IsOptional()
  @IsEnum(AccountRole)
  assignedToRole?: AccountRole;

  @IsOptional()
  @IsUUID('4')
  shiftTemplateId?: string;

  @IsOptional()
  @IsEnum(WorkReportDutyStatus)
  dutyStatus?: WorkReportDutyStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;
}
