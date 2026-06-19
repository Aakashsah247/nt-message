import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmployeeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message:
      'Employee ID may contain letters, numbers, underscores and hyphens only.',
  })
  empId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  empName!: string;

  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/, {
    message: 'Phone number must contain 7 to 20 digits and may start with +.',
  })
  phoneNumber!: string;

  @IsEmail()
  @MaxLength(255)
  officialEmail!: string;

  @IsUUID('4', {
    message: 'Division ID must be a valid UUID.',
  })
  divisionId!: string;

  @IsUUID('4', {
    message: 'Department ID must be a valid UUID.',
  })
  departmentId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string;
}
