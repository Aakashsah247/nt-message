import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { DutyExceptionType } from '../../generated/prisma/client';

export class CreateDutyExceptionDto {
  @IsUUID('4')
  employeeAccountId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsEnum(DutyExceptionType)
  type!: DutyExceptionType;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
