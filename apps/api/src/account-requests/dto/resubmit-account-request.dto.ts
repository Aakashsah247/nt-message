import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResubmitAccountRequestDto {
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
  @Matches(/^(?:9\d{9}|9779\d{9}|\+9779\d{9})$/, {
    message:
      'Use 98XXXXXXXX, 97798XXXXXXXX or +97798XXXXXXXX format.',
  })
  phoneNumber?: string;

  @IsOptional()
  @IsEmail(
    {},
    {
      message: 'Enter a valid official email address.',
    },
  )
  @MaxLength(255)
  officialEmail?: string;

  /*
   * Senior Management may correct the department
   * for a Team Manager request.
   *
   * A Team Manager remains restricted to their
   * currently assigned department.
   */
  @IsOptional()
  @IsUUID('4', {
    message: 'Department ID must be a valid UUID.',
  })
  departmentId?: string;

  /*
   * A rejected management request may select another position.
   * The backend resolves the unique scoped position when omitted.
   */
  @IsOptional()
  @IsUUID('4', {
    message: 'Management position ID must be a valid UUID.',
  })
  managementPositionId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string;
}
