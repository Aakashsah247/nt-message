import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const conversationListViews = ['ACTIVE', 'ARCHIVED', 'ALL'] as const;

export type ConversationListView = (typeof conversationListViews)[number];

export class ListConversationsQueryDto {
  @IsOptional()
  @IsUUID('4', {
    message: 'Conversation cursor must be a valid UUID.',
  })
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;

  @IsOptional()
  @IsIn(conversationListViews, {
    message: 'Conversation view must be active, archived or all.',
  })
  view: ConversationListView = 'ACTIVE';
}
