import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';


export class UpdateWorkItemDto {

  @IsOptional()
  @IsISO8601({ strict: true })
  registeredAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  plannedStartAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dueAt?: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  locationText?: string;
}
