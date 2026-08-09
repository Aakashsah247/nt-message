import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
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

  @IsOptional()
  @IsBoolean()
  moreWorkRequired = false;
}
