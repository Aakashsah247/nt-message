import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateDutyShiftTemplateDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
