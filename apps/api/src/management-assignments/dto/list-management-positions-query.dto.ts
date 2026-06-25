import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { ManagementPositionType } from '../../generated/prisma/client';

export enum ManagementPositionOccupancy {
  ALL = 'ALL',
  VACANT = 'VACANT',
  RESERVED = 'RESERVED',
  INACTIVE = 'INACTIVE',
}

export class ListManagementPositionsQueryDto {
  @IsOptional()
  @IsEnum(ManagementPositionType)
  positionType?: ManagementPositionType;

  @IsOptional()
  @IsUUID('4')
  divisionId?: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsEnum(ManagementPositionOccupancy)
  occupancy: ManagementPositionOccupancy = ManagementPositionOccupancy.ALL;
}
