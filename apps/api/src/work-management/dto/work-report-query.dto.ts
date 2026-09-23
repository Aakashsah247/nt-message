import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class WorkReportQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsUUID('4')
  officeId?: string;

  @IsOptional()
  @IsUUID('4')
  orgUnitId?: string;

  @IsOptional()
  @IsUUID('4')
  operationalTeamId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;
}
