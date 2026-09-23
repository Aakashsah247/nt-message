import {
  IsBoolean,
  IsEmail,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOfficeHeadAccountDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  empId!: string;
  @IsString() @MinLength(2) @MaxLength(150) empName!: string;
  @IsString()
  @Matches(/^(?:9\d{9}|9779\d{9}|\+9779\d{9})$/)
  phoneNumber!: string;
  @IsEmail() @MaxLength(255) officialEmail!: string;
  @IsString() @MinLength(2) @MaxLength(120) designation!: string;

  @IsOptional()
  @IsBoolean()
  replaceCurrent?: boolean;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
