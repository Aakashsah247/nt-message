import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateDutyShiftTemplateDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime!: string;
}
