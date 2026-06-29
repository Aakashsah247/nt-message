import { Type } from 'class-transformer';
import {
  IsInt,
  Max,
  Min,
} from 'class-validator';

export class ListOfficialGroupAuditQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;
}
