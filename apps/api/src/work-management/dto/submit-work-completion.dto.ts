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
  @IsEnum(WorkCompletionResult) result!: WorkCompletionResult;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(3000)
  summary!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-100)
  @Max(20)
  rxLevelDbm?: number;

  // Multipart completion requests send dynamic Work Type Information as JSON.
  // JSON requests may send the array directly. The service validates field
  // codes/types against the Work-bound published version.
  @IsOptional() fields?: unknown;

  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true') return true;
    if (
      value === false ||
      value === 'false' ||
      value === undefined ||
      value === null ||
      value === ''
    )
      return false;
    return value;
  })
  @IsOptional()
  @IsBoolean()
  moreWorkRequired = false;
}
