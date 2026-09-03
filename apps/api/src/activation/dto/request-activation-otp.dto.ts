import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RequestActivationOtpDto {
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

  // Legacy activation pages still send Division/Department identifiers. V3
  // authorization never trusts them; the backend verifies the provisioned
  // Office + PRIMARY OrgMembership instead.
  @IsOptional()
  @IsUUID('4', {
    message: 'Division ID must be a valid UUID.',
  })
  divisionId?: string | null;

  @IsOptional()
  @IsUUID('4', {
    message: 'Department ID must be a valid UUID.',
  })
  departmentId?: string | null;
}
