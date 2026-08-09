import { Transform } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateDutyAssignmentDto {
  @IsOptional()
  @IsUUID('4')
  shiftTemplateId?: string;

  @IsOptional()
  @IsUUID('4')
  supervisorAccountId?: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  reportingLocation?: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
