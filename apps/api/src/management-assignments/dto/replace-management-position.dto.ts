import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ReplaceManagementPositionDto {
  @IsUUID('4')
  newEmployeeId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  assignmentReason?: string;

  @IsOptional()
  @IsISO8601()
  effectiveAt?: string;
}
