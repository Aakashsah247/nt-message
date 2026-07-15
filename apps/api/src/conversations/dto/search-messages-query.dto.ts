import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { MessageContentType } from '../../generated/prisma/client';

const SEARCHABLE_MESSAGE_CONTENT_TYPES = [
  MessageContentType.TEXT,
  MessageContentType.IMAGE,
  MessageContentType.VIDEO,
  MessageContentType.AUDIO,
  MessageContentType.FILE,
] as const;

export class SearchMessagesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'Sender filter must be a valid account ID.',
  })
  senderAccountId?: string;

  @IsOptional()
  @IsIn(SEARCHABLE_MESSAGE_CONTENT_TYPES, {
    message: 'Message type filter is not supported.',
  })
  contentType?: MessageContentType;

  @IsOptional()
  @IsISO8601({}, {
    message: 'Start date must be a valid ISO date.',
  })
  dateFrom?: string;

  @IsOptional()
  @IsISO8601({}, {
    message: 'End date must be a valid ISO date.',
  })
  dateTo?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 25;
}
