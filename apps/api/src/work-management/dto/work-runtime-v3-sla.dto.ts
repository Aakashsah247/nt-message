import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class OfficeWorkingIntervalDto {
  /** ISO weekday: Monday=1 ... Sunday=7. */
  @IsInt()
  @Min(1)
  @Max(7)
  weekday!: number;

  /** Minutes after local midnight, inclusive. */
  @IsInt()
  @Min(0)
  @Max(1439)
  startMinute!: number;

  /** Minutes after local midnight, exclusive. */
  @IsInt()
  @Min(1)
  @Max(1440)
  endMinute!: number;
}

export class OfficeWorkingClosureDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  label?: string;
}

export class ReplaceOfficeWorkingCalendarDto {
  /** 0 creates the first calendar; later updates require the current version. */
  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsBoolean()
  isActive!: boolean;

  @IsIn(['Asia/Kathmandu'])
  timeZone!: 'Asia/Kathmandu';

  @IsArray()
  @ArrayMaxSize(28)
  @ValidateNested({ each: true })
  @Type(() => OfficeWorkingIntervalDto)
  intervals!: OfficeWorkingIntervalDto[];

  @IsArray()
  @ArrayMaxSize(366)
  @ValidateNested({ each: true })
  @Type(() => OfficeWorkingClosureDto)
  closures!: OfficeWorkingClosureDto[];
}
