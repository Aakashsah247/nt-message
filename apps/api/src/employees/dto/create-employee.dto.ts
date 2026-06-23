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

import { AccountRole } from '../../generated/prisma/client';

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
  @Matches(/^\+?[0-9]{7,20}$/, {
    message: 'Phone number must contain 7 to 20 digits and may start with +.',
  })
  phoneNumber!: string;

  @IsEmail()
  @MaxLength(255)
  officialEmail!: string;

  // Super Admin cannot create another Super Admin account.
  @IsIn(adminRoles, {
    message:
      'Role must be Senior Management, Team Manager or Employee.',
  })
  requestedRole!: AccountRole;

  // Organization IDs must come from the controlled database lists.
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