import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { WorkTypeTemplate } from '../fixed-work-type-template';

function trim(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function optionalText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class CreateWorkTypeDefinitionDto {
  @IsEnum(WorkTypeTemplate)
  template!: WorkTypeTemplate;

  @Transform(({ value }: { value: unknown }) => trim(value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @Transform(({ value }: { value: unknown }) => optionalText(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;
}
