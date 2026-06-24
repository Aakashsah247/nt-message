import { IsEnum, IsOptional, IsUUID } from 'class-validator';

import { ManagementPositionType } from '../../generated/prisma/client';

export class CreateManagementPositionDto {
  @IsEnum(ManagementPositionType)
  positionType!: ManagementPositionType;

  @IsUUID('4')
  divisionId!: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;
}
