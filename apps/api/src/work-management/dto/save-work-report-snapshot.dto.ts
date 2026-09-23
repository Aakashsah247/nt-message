import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { WorkReportOfficeExportQueryDto } from './work-report-office-export-query.dto';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class SaveWorkReportSnapshotDto extends WorkReportOfficeExportQueryDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
}
