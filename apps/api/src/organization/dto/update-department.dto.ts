import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { DepartmentWorkFunction } from '../../generated/prisma/client';

export class UpdateDepartmentDto {
  @IsOptional()
  @IsUUID('4')
  divisionId?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, {
    message:
      'Department code may contain letters, numbers, underscores and hyphens only.',
  })
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEnum(DepartmentWorkFunction)
  workFunction?: DepartmentWorkFunction;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
