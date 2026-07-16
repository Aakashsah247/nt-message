import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class VerifyActivationOtpDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  empName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Employee ID has an invalid format.',
  })
  empId!: string;

  @IsString()
  @Matches(/^(?:9\d{9}|9779\d{9}|\+9779\d{9})$/, {
    message: 'Use 98XXXXXXXX, 97798XXXXXXXX or +97798XXXXXXXX format.',
  })
  phoneNumber!: string;

  @IsEmail(
    {},
    {
      message: 'Enter a valid official email address.',
    },
  )
  @MaxLength(255)
  officialEmail!: string;

  @IsUUID('4', {
    message: 'Division ID must be a valid UUID.',
  })
  divisionId!: string;

  // Senior Management is division-scoped; all department-scoped roles are
  // rejected later unless this value exactly matches the approved record.
  @IsOptional()
  @IsUUID('4', {
    message: 'Department ID must be a valid UUID.',
  })
  departmentId?: string | null;

  @IsString()
  @Matches(/^[0-9]{6}$/, {
    message: 'OTP must contain exactly 6 digits.',
  })
  otp!: string;
}
