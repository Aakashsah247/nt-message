import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListMessagesQueryDto {
  @IsOptional()
  @IsUUID('4', {
    message: 'Message cursor must be a valid UUID.',
  })
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
