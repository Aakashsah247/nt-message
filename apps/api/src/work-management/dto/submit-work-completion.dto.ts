import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { WorkCompletionResult } from '../../generated/prisma/client';

export class SubmitWorkCompletionDto {
  @IsEnum(WorkCompletionResult)
  result!: WorkCompletionResult;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(3000)
  summary!: string;

  // Customer ID is required for customer-specific operational work, optional
  // for Network Maintenance, and omitted for Routine/Inspection/Admin work.
  // Saved work/network facts are copied from the original work automatically.
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(100)
  customerId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-100)
  @Max(20)
  rxLevelDbm?: number;

  @IsOptional()
  @IsBoolean()
  moreWorkRequired = false;
}
