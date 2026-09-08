import { IsEnum } from 'class-validator';

import { WorkReportV3QueryDto } from './work-report-v3-query.dto';

export enum WorkReportV3ExportDataset {
  OVERVIEW = 'OVERVIEW',
  WORK_RECORDS = 'WORK_RECORDS',
  TECHNICAL_PERFORMANCE = 'TECHNICAL_PERFORMANCE',
  STAGE_SLA = 'STAGE_SLA',
}

export class WorkReportV3ExportQueryDto extends WorkReportV3QueryDto {
  @IsEnum(WorkReportV3ExportDataset)
  dataset!: WorkReportV3ExportDataset;
}
