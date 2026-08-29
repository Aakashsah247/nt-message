import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { DutyHolidayType } from '../../generated/prisma/client';

export enum DutyHolidayScope {
  BRANCH = 'BRANCH',
  DIVISION = 'DIVISION',
  DEPARTMENT = 'DEPARTMENT',
}

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateDutyHolidayDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsEnum(DutyHolidayType)
  type!: DutyHolidayType;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate!: string;

  @IsEnum(DutyHolidayScope)
  scope!: DutyHolidayScope;

  @ValidateIf((dto: CreateDutyHolidayDto) => dto.scope !== DutyHolidayScope.BRANCH)
  @IsUUID('4')
  divisionId?: string;

  @ValidateIf((dto: CreateDutyHolidayDto) => dto.scope === DutyHolidayScope.DEPARTMENT)
  @IsUUID('4')
  departmentId?: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
