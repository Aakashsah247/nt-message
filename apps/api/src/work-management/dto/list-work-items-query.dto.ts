import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { WorkItemStatus } from '../../generated/prisma/client';

export enum WorkQueueView {
  ACTIVE = 'ACTIVE',
  HISTORY = 'HISTORY',
}

export class ListWorkItemsQueryDto {
  @IsOptional() @IsEnum(WorkQueueView) view: WorkQueueView =
    WorkQueueView.ACTIVE;
  @IsOptional() @IsEnum(WorkItemStatus) status?: WorkItemStatus;
  @IsOptional() @IsUUID('4') workTypeVersionId?: string;
  @IsOptional() @IsUUID('4') orgUnitId?: string;
  @IsOptional() @IsUUID('4') operationalTeamId?: string;
  @IsOptional() @IsUUID('4') assigneeAccountId?: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsOptional() @IsInt() @Min(1) @Max(100) limit = 25;
}
