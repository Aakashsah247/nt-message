import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AssignOfficeHeadDto {
  @IsUUID('4')
  employeeId!: string;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
