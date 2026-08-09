import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

export class ListDutyCoverageRequirementsQueryDto {
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsUUID('4')
  shiftTemplateId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;
}
