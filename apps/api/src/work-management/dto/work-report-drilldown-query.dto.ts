import { Type } from 'class-transformer';
import { IsEnum, IsInt, Max, Min } from 'class-validator';

import { WorkReportQueryDto } from './work-report-query.dto';

export enum WorkReportDrilldownDataset {
  WORK_RECORDS = 'WORK_RECORDS',
  PERFORMANCE_REPORT = 'PERFORMANCE_REPORT',
  DUTY_ASSIGNMENTS = 'DUTY_ASSIGNMENTS',
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
