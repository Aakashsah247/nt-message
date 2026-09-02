import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { OrgMembershipType } from '../../generated/prisma/client';

export class AssignOrgMembershipDto {
  @IsUUID('4')
  employeeId!: string;

  @IsOptional()
  @IsUUID('4')
  orgUnitId?: string | null;

  @IsEnum(OrgMembershipType)
  membershipType!: OrgMembershipType;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
