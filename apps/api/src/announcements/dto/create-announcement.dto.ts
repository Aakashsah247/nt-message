import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
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

function emptyStringToNull(value: unknown): unknown {
  return value === '' ? null : value;
}

export class CreateAnnouncementDto {
  @IsIn([
    AnnouncementAudienceType.OFFICE,
    AnnouncementAudienceType.ORG_UNIT,
    AnnouncementAudienceType.OFFICIAL_GROUP,
  ])
  audienceType!: AnnouncementAudienceType;

  @IsOptional()
  @IsUUID('4')
  divisionId?: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsUUID('4')
  officeId?: string;

  @IsOptional()
  @IsUUID('4')
  orgUnitId?: string;

  @IsOptional()
  @IsBoolean()
  includeDescendants?: boolean;

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
  @Transform(({ value }) => emptyStringToNull(value))
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @Transform(({ value }) => emptyStringToNull(value))
  @IsDateString()
  expiresAt?: string | null;
}
