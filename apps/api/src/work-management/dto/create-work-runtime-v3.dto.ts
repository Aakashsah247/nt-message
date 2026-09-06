import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeFieldCode(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class WorkRuntimeV3FieldInputDto {
  @Transform(({ value }: { value: unknown }) => normalizeFieldCode(value))
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,79}$/)
  code!: string;

  @IsDefined()
  value!: unknown;
}

export class CreateWorkRuntimeV3Dto {
  /**
   * Client-generated UUID. Reusing it with the same normalized payload returns
   * the original Work; reusing it with different content is rejected.
   */
  @IsUUID('4')
  clientRequestId!: string;

  @IsUUID('4')
  workTypeVersionId!: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title!: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  plannedStartAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dueAt?: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WorkRuntimeV3FieldInputDto)
  fields!: WorkRuntimeV3FieldInputDto[];
}
