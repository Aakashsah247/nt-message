import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
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

export class WorkFieldInputDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z][A-Z0-9_]{1,79}$/)
  code!: string;

  @IsDefined()
  value!: unknown;
}

export class CreateWorkItemDto {
  @IsUUID('4')
  clientRequestId!: string;

  @IsUUID('4')
  workTypeVersionId!: string;

  @IsUUID('4')
  primaryExecutionOrgUnitId!: string;

  @IsOptional()
  @IsUUID('4')
  mainOperationalTeamId?: string;

  @IsOptional()
  @IsUUID('4')
  mainAssigneeAccountId?: string;

  @IsOptional()
  @IsUUID('4')
  responsibleReviewerAccountId?: string;

  @IsOptional()
  @IsUUID('4')
  salesOrgUnitId?: string;

  @IsOptional()
  @IsUUID('4')
  salesMemberAccountId?: string;

  @IsOptional()
  @IsUUID('4')
  supportOrgUnitId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  supportMemberAccountIds?: string[];

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
  registeredAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  plannedStartAt?: string;

  @IsISO8601({ strict: true })
  dueAt!: string;

  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WorkFieldInputDto)
  fields!: WorkFieldInputDto[];
}
