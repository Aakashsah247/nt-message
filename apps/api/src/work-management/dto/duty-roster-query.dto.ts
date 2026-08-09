import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

// Roster queries are intentionally narrow and never expose attendance claims.
export class DutyRosterQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsUUID('4')
  employeeAccountId?: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
