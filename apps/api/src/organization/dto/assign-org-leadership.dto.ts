import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { OrgLeadershipType } from '../../generated/prisma/client';

export class AssignOrgLeadershipDto {
  @IsUUID('4')
  employeeId!: string;

  @IsOptional()
  @IsUUID('4')
  orgUnitId?: string | null;

  @IsEnum(OrgLeadershipType)
  leadershipType!: OrgLeadershipType;

  @IsOptional()
  @IsBoolean()
  isActing?: boolean;

  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;

  @IsOptional()
  @IsISO8601()
  effectiveUntil?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
