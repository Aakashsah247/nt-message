import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { AccountRole } from '../../generated/prisma/client';

export class ChangeEmployeeRoleDto {
  @IsEnum(AccountRole)
  targetRole!: AccountRole;

  @IsUUID('4')
  divisionId!: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'Management position ID must be a valid UUID.',
  })
  managementPositionId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  designation?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
