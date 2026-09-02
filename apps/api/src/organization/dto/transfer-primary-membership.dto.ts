import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class TransferPrimaryMembershipDto {
  @IsUUID('4')
  employeeId!: string;

  @IsOptional()
  @IsUUID('4')
  orgUnitId?: string | null;

  @IsOptional()
  @IsISO8601()
  effectiveAt?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
