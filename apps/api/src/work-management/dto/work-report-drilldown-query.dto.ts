import { Type } from 'class-transformer';
import { IsEnum, IsInt, Max, Min } from 'class-validator';

import { WorkReportQueryDto } from './work-report-query.dto';

export enum WorkReportDrilldownDataset {
  OVERDUE_WORK = 'OVERDUE_WORK',
  EMPLOYEE_PERFORMANCE = 'EMPLOYEE_PERFORMANCE',
  DEPARTMENT_SUMMARY = 'DEPARTMENT_SUMMARY',
  DIVISION_SUMMARY = 'DIVISION_SUMMARY',
  DUTY_CONFLICT_OVERRIDES = 'DUTY_CONFLICT_OVERRIDES',
  DUTY_CANCELLATIONS = 'DUTY_CANCELLATIONS',
}

export class WorkReportDrilldownQueryDto extends WorkReportQueryDto {
  @IsEnum(WorkReportDrilldownDataset)
  dataset!: WorkReportDrilldownDataset;

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
