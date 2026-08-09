import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { WorkHelpReason } from '../../generated/prisma/client';

export class RequestWorkHelpDto {
  @IsEnum(WorkHelpReason)
  reason!: WorkHelpReason;

  @IsOptional()
  @IsUUID('4')
  requestedHelperAccountId?: string;

  @IsOptional()
  @IsUUID('4')
  requestedDepartmentId?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  note?: string;
}
