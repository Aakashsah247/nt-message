import { IsEnum } from 'class-validator';

import { WorkReportQueryDto } from './work-report-office-query.dto';

export enum WorkReportExportDataset {
  OVERVIEW = 'OVERVIEW',
  WORK_RECORDS = 'WORK_RECORDS',
  TECHNICAL_PERFORMANCE = 'TECHNICAL_PERFORMANCE',
  DUTY_ASSIGNMENTS = 'DUTY_ASSIGNMENTS',
}

export class WorkReportOfficeExportQueryDto extends WorkReportQueryDto {
  @IsEnum(WorkReportExportDataset)
  dataset!: WorkReportExportDataset;
}
