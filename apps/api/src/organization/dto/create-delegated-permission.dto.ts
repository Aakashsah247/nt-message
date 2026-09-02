import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDelegatedPermissionDto {
  @IsUUID('4')
  granteeAccountId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(100)
  capability!: string;

  @IsOptional()
  @IsUUID('4')
  orgUnitId?: string | null;

  @IsOptional()
  @IsBoolean()
  includeDescendants?: boolean;

  @IsOptional()
  @IsBoolean()
  canRedelegate?: boolean;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveUntil?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
