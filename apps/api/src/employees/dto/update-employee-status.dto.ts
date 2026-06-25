import { IsEnum } from 'class-validator';

import { EmployeeStatus } from '../../generated/prisma/client';

export class UpdateEmployeeStatusDto {
  @IsEnum(EmployeeStatus)
  status!: EmployeeStatus;
}
