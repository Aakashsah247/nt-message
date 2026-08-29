import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { DutyRecurrenceType } from '../../generated/prisma/client';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

// Bulk requests are bounded to protect the API from accidental employee-by-day explosions.
export class CreateBulkDutyScheduleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  employeeAccountIds!: string[];

  @IsUUID('4')
  shiftTemplateId!: string;

  @IsOptional()
  @IsUUID('4')
  supervisorAccountId?: string;

  @IsEnum(DutyRecurrenceType)
  recurrenceType!: DutyRecurrenceType;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @ValidateIf(
    (dto: CreateBulkDutyScheduleDto) =>
      dto.recurrenceType !== DutyRecurrenceType.ONE_TIME,
  )
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @ValidateIf(
    (dto: CreateBulkDutyScheduleDto) =>
      dto.recurrenceType === DutyRecurrenceType.WEEKLY,
  )
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(7)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekdays?: number[];

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  reportingLocation!: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  // Managers must explicitly accept skipping conflicts after reviewing the preview.
  @IsOptional()
  @IsBoolean()
  createValidAssignmentsOnly?: boolean;
}
