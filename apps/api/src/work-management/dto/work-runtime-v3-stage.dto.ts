import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { WorkStageAssignmentTargetType } from '../../generated/prisma/client';

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeFieldCode(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class WorkRuntimeV3StageFieldInputDto {
  @Transform(({ value }: { value: unknown }) => normalizeFieldCode(value))
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,79}$/)
  code!: string;

  @IsDefined()
  value!: unknown;
}

export class WorkRuntimeV3StageMutationDto {
  @IsInt()
  @Min(1)
  expectedStageVersion!: number;
}

export class AssignWorkRuntimeV3StageDto extends WorkRuntimeV3StageMutationDto {
  @IsOptional()
  @IsEnum(WorkStageAssignmentTargetType)
  targetType?: WorkStageAssignmentTargetType;

  @IsOptional()
  @IsUUID('4')
  targetOrgUnitId?: string;

  @IsOptional()
  @IsUUID('4')
  targetAccountId?: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class BlockWorkRuntimeV3StageDto extends WorkRuntimeV3StageMutationDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  reason!: string;
}

export class SubmitWorkRuntimeV3StageDto extends WorkRuntimeV3StageMutationDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WorkRuntimeV3StageFieldInputDto)
  fields!: WorkRuntimeV3StageFieldInputDto[];
}

export class ApproveWorkRuntimeV3StageDto extends WorkRuntimeV3StageMutationDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class ReturnWorkRuntimeV3StageDto extends WorkRuntimeV3StageMutationDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  reason!: string;
}

export class WorkRuntimeV3WorkMutationDto {
  @IsInt()
  @Min(1)
  expectedWorkVersion!: number;
}

export class CompleteWorkRuntimeV3Dto extends WorkRuntimeV3WorkMutationDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CancelWorkRuntimeV3Dto extends WorkRuntimeV3WorkMutationDto {
  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}

export class ReopenWorkRuntimeV3Dto extends WorkRuntimeV3WorkMutationDto {
  @IsUUID('4')
  stageId!: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  reason!: string;
}

export class WorkRuntimeV3QueueQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  take?: number;
}
