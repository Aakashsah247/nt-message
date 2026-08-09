import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class DailyWorkReportQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

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
  @IsString()
  @MaxLength(120)
  search?: string;
}
