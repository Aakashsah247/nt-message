import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export const ACCOUNT_REQUEST_ORGANIZATION_ROLES = [
  'EMPLOYEE',
  'ORG_UNIT_HEAD',
] as const;

export type AccountRequestOrganizationRoleInput =
  (typeof ACCOUNT_REQUEST_ORGANIZATION_ROLES)[number];

export class CreateAccountRequestDto {
  @IsUUID('4', {
    message: 'Office ID must be a valid UUID.',
  })
  officeId!: string;

  @IsUUID('4', {
    message: 'Intended OrgUnit ID must be a valid UUID.',
  })
  intendedOrgUnitId!: string;

  @IsIn(ACCOUNT_REQUEST_ORGANIZATION_ROLES, {
    message: 'Organization role must be EMPLOYEE or ORG_UNIT_HEAD.',
  })
  requestedOrganizationRole!: AccountRequestOrganizationRoleInput;

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

  @IsOptional()
  @IsString()
  @MaxLength(120)
  designation?: string;
}
