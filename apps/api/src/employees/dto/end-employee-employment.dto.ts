import {
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { EmploymentStatus } from '../../generated/prisma/client';

export class EndEmployeeEmploymentDto {
  @IsIn([
    EmploymentStatus.RESIGNED,
    EmploymentStatus.RETIRED,
    EmploymentStatus.TERMINATED,
    EmploymentStatus.TRANSFERRED,
  ])
  employmentStatus!: EmploymentStatus;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsISO8601({
    strict: true,
  })
  effectiveAt?: string;
}
