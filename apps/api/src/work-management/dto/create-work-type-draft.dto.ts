import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

function normalizeOptionalText(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export class CreateWorkTypeDraftDto {
  @Transform(({ value }: { value: unknown }) => normalizeOptionalText(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeReason?: string | null;
}
