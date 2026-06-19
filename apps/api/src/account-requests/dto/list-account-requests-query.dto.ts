import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AccountRequestStatus } from '../../generated/prisma/client';

export class ListAccountRequestsQueryDto {
  @IsOptional()
  @IsEnum(AccountRequestStatus)
  status?: AccountRequestStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
