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
import { DutyHolidayScope } from './create-duty-holiday.dto';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateDutyHolidayDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsEnum(DutyHolidayType)
  type?: DutyHolidayType;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  startDate?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  endDate?: string;

  @IsOptional()
  @IsEnum(DutyHolidayScope)
  scope?: DutyHolidayScope;

  @ValidateIf((dto: UpdateDutyHolidayDto) => dto.scope !== undefined && dto.scope !== DutyHolidayScope.BRANCH)
  @IsUUID('4')
  divisionId?: string;

  @ValidateIf((dto: UpdateDutyHolidayDto) => dto.scope === DutyHolidayScope.DEPARTMENT)
  @IsUUID('4')
  departmentId?: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
