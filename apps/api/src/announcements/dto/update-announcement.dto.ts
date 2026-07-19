import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { AnnouncementPriority } from '../../generated/prisma/enums';

function trimOptionalString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateAnnouncementDto {
  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => trimOptionalString(value))
  @IsString()
  @MaxLength(5000)
  body?: string;

  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @IsOptional()
  @IsBoolean()
  requiresAcknowledgement?: boolean;

  @IsOptional()
  @IsBoolean()
  allowAttachmentDownload?: boolean;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsDateString()
  expiresAt?: string | null;
}
