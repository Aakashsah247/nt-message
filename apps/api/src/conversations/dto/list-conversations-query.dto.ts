import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

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
}
