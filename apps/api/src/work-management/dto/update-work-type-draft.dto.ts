import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

function trimRequiredText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeOptionalText(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class UpdateWorkTypeDraftDto {
  @Transform(({ value }: { value: unknown }) => trimRequiredText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @Transform(({ value }: { value: unknown }) => normalizeOptionalText(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @Transform(({ value }: { value: unknown }) => normalizeOptionalText(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeReason?: string | null;
}
