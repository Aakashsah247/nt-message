import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function trimNullableText(value: unknown): unknown {
  if (value === null) return null;
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export class UpdateDutyCoverageRequirementDto {
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsUUID('4')
  shiftTemplateId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  requiredStaff?: number;

  @Transform(({ value }: { value: unknown }) => trimNullableText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  reportingLocation?: string | null;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveUntil?: string | null;
}
