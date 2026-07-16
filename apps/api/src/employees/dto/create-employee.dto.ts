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

// DTO validation needs role values only; loading the full Prisma client is unnecessary.
import { AccountRole } from '../../generated/prisma/enums';

const adminRoles: AccountRole[] = [
  AccountRole.SENIOR_MANAGEMENT,
  AccountRole.TEAM_MANAGER,
  AccountRole.EMPLOYEE,
];

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

  // Super Admin cannot create another Super Admin account.
  @IsIn(adminRoles, {
    message: 'Role must be Senior Management, Team Manager or Employee.',
  })
  requestedRole!: AccountRole;

  // Organization IDs must come from the controlled database lists.
  @IsUUID('4', {
    message: 'Division ID must be a valid UUID.',
  })
  divisionId!: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'Department ID must be a valid UUID.',
  })
  departmentId?: string;

  /*
   * Required by the service for management roles.
   * Normal employees must not provide a position.
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
