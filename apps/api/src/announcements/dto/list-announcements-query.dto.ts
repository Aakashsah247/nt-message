import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ANNOUNCEMENT_LIST_FILTERS = [
  'ALL',
  'UNREAD',
  'ACTION_REQUIRED',
  'DRAFTS',
  'SCHEDULED',
  'PUBLISHED',
  'EXPIRED',
] as const;

export type AnnouncementListFilter =
  (typeof ANNOUNCEMENT_LIST_FILTERS)[number];

export class ListAnnouncementsQueryDto {
  @IsOptional()
  @IsIn(ANNOUNCEMENT_LIST_FILTERS)
  filter: AnnouncementListFilter = 'ALL';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsUUID('4')
  officialConversationId?: string;

  @IsOptional()
  @IsUUID('4')
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;
}
