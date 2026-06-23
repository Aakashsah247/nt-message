import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class TransferEmployeeDto {
  @IsUUID('4', {
    message: 'Division ID must be a valid UUID.',
  })
  divisionId!: string;

  @IsUUID('4', {
    message: 'Department ID must be a valid UUID.',
  })
  departmentId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  designation?: string;

  @IsOptional()
  @IsISO8601({
    strict: true,
  })
  effectiveAt?: string;
}
