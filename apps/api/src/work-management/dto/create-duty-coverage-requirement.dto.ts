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

function trimOptionalText(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class CreateDutyCoverageRequirementDto {
  @IsUUID('4')
  departmentId!: string;

  @IsUUID('4')
  shiftTemplateId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  requiredStaff!: number;

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  reportingLocation?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveFrom!: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  effectiveUntil?: string;
}
