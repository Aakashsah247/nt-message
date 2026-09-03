import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAccountRequestDto {
  /**
   * Canonical V3 Office scope. Optional only while the existing manager UI
   * migrates; the backend resolves the requester's active Office when omitted.
   */
  @IsOptional()
  @IsUUID('4', {
    message: 'Office ID must be a valid UUID.',
  })
  officeId?: string;

  /**
   * Canonical V3 intended organizational placement. New clients send this
   * directly. The legacy departmentId below is accepted only as a temporary
   * compatibility bridge and is mapped to its reconciled OrgUnit.
   */
  @IsOptional()
  @IsUUID('4', {
    message: 'Intended OrgUnit ID must be a valid UUID.',
  })
  intendedOrgUnitId?: string;

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
  @Matches(/^(?:9\d{9}|9779\d{9}|\+9779\d{9})$/, {
    message:
      'Use 98XXXXXXXX, 97798XXXXXXXX or +97798XXXXXXXX format.',
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

  /**
   * Temporary legacy compatibility input. It is resolved through
   * LegacyOrgUnitMapping and never defines authorization by itself.
   */
  @IsOptional()
  @IsUUID('4', {
    message: 'Department ID must be a valid UUID.',
  })
  departmentId?: string;

  /**
   * Deprecated compatibility field. V3 account requests do not assign
   * leadership or reserve legacy management positions.
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
