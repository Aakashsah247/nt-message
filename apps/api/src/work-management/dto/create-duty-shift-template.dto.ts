import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export enum DutyShiftScope {
  OFFICE = 'OFFICE',
  ORG_UNIT = 'ORG_UNIT',
}

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

  @IsEnum(DutyShiftScope)
  scope!: DutyShiftScope;

  @ValidateIf((dto: CreateDutyShiftTemplateDto) => dto.scope === DutyShiftScope.ORG_UNIT)
  @IsUUID('4')
  orgUnitId?: string;
}
