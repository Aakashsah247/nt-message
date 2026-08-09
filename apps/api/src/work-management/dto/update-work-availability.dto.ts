import { IsEnum } from 'class-validator';

import { WorkAvailabilityPreference } from '../../generated/prisma/client';

export class UpdateWorkAvailabilityDto {
  @IsEnum(WorkAvailabilityPreference)
  preference!: WorkAvailabilityPreference;
}
