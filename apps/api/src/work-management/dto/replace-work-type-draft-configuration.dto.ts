import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  OrgLeadershipType,
  WorkFieldType,
  WorkFinalClosureMode,
  WorkSlaBasis,
  WorkTypeCreatorCategory,
  WorkTypeCreatorScope,
} from '../../generated/prisma/client';
import { WorkTypeTemplate } from '../fixed-work-type-template';

const WORK_CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,79}$/;

function normalizeCode(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

function trimText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class WorkTypeCreatorOrgUnitDto {
  @IsUUID('4')
  orgUnitId!: string;

  @IsOptional()
  @IsBoolean()
  includeDescendants?: boolean;
}

export class WorkTypeCreatorAccountDto {
  @IsUUID('4')
  accountId!: string;
}

export class WorkFieldDefinitionDto {
  @Transform(({ value }: { value: unknown }) => normalizeCode(value))
  @IsString()
  @Matches(WORK_CODE_PATTERN)
  code!: string;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  label!: string;

  @IsEnum(WorkFieldType)
  fieldType!: WorkFieldType;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class ReplaceWorkTypeDraftConfigurationDto {
  @IsEnum(WorkTypeTemplate)
  template!: WorkTypeTemplate;

  @Transform(({ value }: { value: unknown }) => trimText(value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  salesDisplayLabel?: string;

  @IsOptional()
  @IsUUID('4')
  primaryOwnerOrgUnitId?: string | null;

  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsEnum(WorkTypeCreatorCategory, { each: true })
  creatorCategories!: WorkTypeCreatorCategory[];

  @IsEnum(WorkTypeCreatorScope)
  creatorScope!: WorkTypeCreatorScope;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WorkTypeCreatorOrgUnitDto)
  creatorOrgUnits!: WorkTypeCreatorOrgUnitDto[];

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WorkTypeCreatorAccountDto)
  creatorAccounts!: WorkTypeCreatorAccountDto[];

  @IsEnum(WorkFinalClosureMode)
  finalClosureMode!: WorkFinalClosureMode;

  @IsOptional()
  @IsEnum(OrgLeadershipType)
  finalClosureLeadershipType?: OrgLeadershipType | null;

  @IsEnum(WorkSlaBasis)
  slaBasis!: WorkSlaBasis;

  @IsOptional()
  @IsInt()
  @Min(1)
  overallSlaMinutes?: number | null;

  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => WorkFieldDefinitionDto)
  fields!: WorkFieldDefinitionDto[];
}
