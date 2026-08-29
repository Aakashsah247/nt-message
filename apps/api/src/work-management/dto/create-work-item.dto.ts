import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  WorkContactType,
  WorkItemType,
  WorkServiceType,
} from '../../generated/prisma/client';

function trimOptionalText(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateWorkItemDto {
  @IsEnum(WorkItemType)
  type!: WorkItemType;

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title?: string;

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  description?: string;

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  customerName?: string;

  @IsOptional()
  @IsEnum(WorkContactType)
  customerContactType?: WorkContactType;

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  customerContactNumber?: string;

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  locationText?: string;


  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  requestNumber?: string;

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  cpcSerial?: string;

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  serviceNumber?: string;

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  olt?: string;

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fdcName?: string;

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fapName?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsEnum(WorkServiceType, { each: true })
  serviceTypes?: WorkServiceType[];

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  otherServiceText?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  registeredAt?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  plannedStartAt?: string;

  @IsISO8601({ strict: true })
  dueAt!: string;

  @IsOptional()
  @IsUUID('4')
  primaryAssigneeAccountId?: string;

  @IsOptional()
  @IsUUID('4')
  assignedTeamId?: string;

  @IsOptional()
  @IsUUID('4')
  salesMemberAccountId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  supportingAssigneeAccountIds?: string[];

  @IsOptional()
  @IsUUID('4')
  responsibleManagerAccountId?: string;

  @IsOptional()
  @IsUUID('4')
  parentWorkItemId?: string;

  @Transform(({ value }: { value: unknown }) => trimOptionalText(value))
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(2000)
  delegationInstructions?: string;
}
