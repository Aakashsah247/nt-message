import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import {
  AnnouncementAudienceType,
  AnnouncementPriority,
} from '../../generated/prisma/enums';

function trimOptionalString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateAnnouncementDto {
  @IsEnum(AnnouncementAudienceType)
  audienceType!: AnnouncementAudienceType;

  @IsOptional()
  @IsUUID('4')
  divisionId?: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsUUID('4')
  officialConversationId?: string;

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
