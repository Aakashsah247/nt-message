import { IsEnum } from 'class-validator';

import { WorkReportQueryDto } from './work-report-query.dto';

export enum WorkReportDataset {
  SUMMARY = 'SUMMARY',
  PERFORMANCE_REPORT = 'PERFORMANCE_REPORT',
  WORK_RECORDS = 'WORK_RECORDS',
  DUTY_ASSIGNMENTS = 'DUTY_ASSIGNMENTS',
}

export class ExportWorkReportQueryDto extends WorkReportQueryDto {
  @IsEnum(WorkReportDataset)
  dataset!: WorkReportDataset;
}
