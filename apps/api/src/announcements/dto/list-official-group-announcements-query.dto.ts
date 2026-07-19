import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListOfficialGroupAnnouncementsQueryDto {
  @IsOptional()
  @IsUUID('4')
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
