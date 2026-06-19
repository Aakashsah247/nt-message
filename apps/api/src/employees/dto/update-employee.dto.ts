import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message:
      'Employee ID may contain letters, numbers, underscores and hyphens only.',
  })
  empId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  empName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/, {
    message: 'Phone number must contain 7 to 20 digits and may start with +.',
  })
  phoneNumber?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  officialEmail?: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'Division ID must be a valid UUID.',
  })
  divisionId?: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'Department ID must be a valid UUID.',
  })
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string;
}
