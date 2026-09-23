import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class TransferEmployeeOfficeDto {
  @IsUUID('4')
  targetOfficeId!: string;

  @IsUUID('4')
  targetOrgUnitId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  effectiveAt?: string;
}
