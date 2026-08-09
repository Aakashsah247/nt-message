import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListWorkAssigneesQueryDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit = 25;
}
