import {
  IsEnum,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { DepartmentWorkFunction } from '../../generated/prisma/client';

export class CreateDepartmentDto {
  @IsUUID('4')
  divisionId!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, {
    message:
      'Department code may contain letters, numbers, underscores and hyphens only.',
  })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEnum(DepartmentWorkFunction)
  workFunction!: DepartmentWorkFunction;
}
