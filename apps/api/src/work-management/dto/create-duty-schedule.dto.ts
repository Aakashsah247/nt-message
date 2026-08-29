import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
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

export class CreateDutyScheduleDto {
  @IsUUID('4')
  employeeAccountId!: string;

  @IsUUID('4')
  shiftTemplateId!: string;

  @IsOptional()
  @IsUUID('4')
  supervisorAccountId?: string;

  @IsEnum(DutyRecurrenceType)
  recurrenceType!: DutyRecurrenceType;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @ValidateIf((dto: CreateDutyScheduleDto) => dto.recurrenceType !== DutyRecurrenceType.ONE_TIME)
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @ValidateIf((dto: CreateDutyScheduleDto) => dto.recurrenceType === DutyRecurrenceType.WEEKLY)
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
}
