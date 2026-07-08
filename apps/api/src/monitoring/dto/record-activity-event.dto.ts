import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

import { ActivityEventType } from '../../generated/prisma/client';

export class RecordActivityEventDto {
  @IsEnum(ActivityEventType)
  eventType!: ActivityEventType;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  pagePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  elementLabel?: string;
}
