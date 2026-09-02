import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RevokeDelegatedPermissionDto {
  @IsOptional()
  @IsISO8601()
  effectiveAt?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
