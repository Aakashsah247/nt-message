import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  AccountRole,
  ActivityEventType,
} from '../../generated/prisma/client';

export class SuperAdminActivityLogQueryDto {
  @IsOptional()
  @IsISO8601({ strict: true }, {
    message: 'Date must be in YYYY-MM-DD format.',
  })
  date?: string;

  @IsOptional()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Start time must be in HH:mm format.',
  })
  fromTime?: string;

  @IsOptional()
  @Matches(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'End time must be in HH:mm format.',
  })
  toTime?: string;

  @IsOptional()
  @IsUUID('4')
  accountId?: string;

  @IsOptional()
  @IsEnum(AccountRole)
  role?: AccountRole;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsEnum(ActivityEventType)
  eventType?: ActivityEventType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(10)
  @Max(100)
  limit = 25;
}
