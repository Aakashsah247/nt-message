import { Transform, Type } from 'class-transformer';
import {
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateWorkRuntimeV3CollaborationRequestDto {
  @IsUUID('4')
  sourceOrgUnitId!: string;

  @IsUUID('4')
  requestedOrgUnitId!: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  purpose!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  neededBy?: string;
}

export class WorkRuntimeV3CollaborationMutationDto {
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class DeclineWorkRuntimeV3CollaborationDto extends WorkRuntimeV3CollaborationMutationDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  reason!: string;
}

export class CancelWorkRuntimeV3CollaborationDto extends WorkRuntimeV3CollaborationMutationDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  reason!: string;
}

export class WorkRuntimeV3CollaborationQueueQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  take?: number;
}
