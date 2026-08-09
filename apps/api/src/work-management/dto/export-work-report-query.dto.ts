import { IsEnum } from 'class-validator';

import { WorkReportQueryDto } from './work-report-query.dto';

export enum WorkReportDataset {
  SUMMARY = 'SUMMARY',
  WORK_ITEMS = 'WORK_ITEMS',
  DUTY_ASSIGNMENTS = 'DUTY_ASSIGNMENTS',
  HELP_REQUESTS = 'HELP_REQUESTS',
  // Retention review is an auditable register; it never performs permanent deletion.
  RETENTION_REVIEW = 'RETENTION_REVIEW',
}

export class ExportWorkReportQueryDto extends WorkReportQueryDto {
  @IsEnum(WorkReportDataset)
  dataset!: WorkReportDataset;
}
