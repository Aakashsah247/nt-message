import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
} from '../../generated/prisma/client';

export enum DirectoryAccountStatus {
  ENABLED = 'ENABLED',
  DISABLED = 'DISABLED',
  NO_ACCOUNT = 'NO_ACCOUNT',
}

export enum DirectoryActivationStatus {
  ACTIVATED = 'ACTIVATED',
  AWAITING_ACTIVATION = 'AWAITING_ACTIVATION',
}

export enum DirectoryRecordStatus {
  CURRENT = 'CURRENT',
  ARCHIVED = 'ARCHIVED',
}

export class ListDirectoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @IsOptional()
  @IsEnum(DirectoryRecordStatus)
  recordStatus: DirectoryRecordStatus = DirectoryRecordStatus.CURRENT;

  @IsOptional()
  @IsEnum(AccountRole)
  role?: AccountRole;

  @IsOptional()
  @IsEnum(DirectoryAccountStatus)
  accountStatus?: DirectoryAccountStatus;

  @IsOptional()
  @IsEnum(DirectoryActivationStatus)
  activationStatus?: DirectoryActivationStatus;

  @IsOptional()
  @IsUUID('4', {
    message: 'Division ID must be a valid UUID.',
  })
  divisionId?: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'Department ID must be a valid UUID.',
  })
  departmentId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
