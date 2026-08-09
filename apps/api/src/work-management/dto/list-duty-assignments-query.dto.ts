import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';

function optionalBoolean(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return value;
}

export enum DutyAssignmentListView {
  ALL = 'ALL',
  ASSIGNED_BY_ME = 'ASSIGNED_BY_ME',
  MANAGEMENT_DUTIES = 'MANAGEMENT_DUTIES',
  OVERRIDES = 'OVERRIDES',
}

export class ListDutyAssignmentsQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsUUID('4')
  employeeAccountId?: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  // Views keep personal assignments and management oversight separate from raw history.
  @IsOptional()
  @IsEnum(DutyAssignmentListView)
  view?: DutyAssignmentListView;

  @Transform(({ value }: { value: unknown }) => optionalBoolean(value))
  @IsOptional()
  @IsBoolean()
  includeCancelled?: boolean;

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
