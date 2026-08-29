import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import {
  WorkItemStatus,
  WorkItemType,
} from '../../generated/prisma/client';

export enum WorkQueueView {
  ACTIVE = 'ACTIVE',
  HISTORY = 'HISTORY',
  ARCHIVE = 'ARCHIVE',
  DELETION_REVIEW = 'DELETION_REVIEW',
}

// Focus values separate daily action queues from deliberately filtered oversight searches.
export enum WorkQueueFocus {
  TEAM_QUEUE = 'TEAM_QUEUE',
  ACTION_CENTER = 'ACTION_CENTER',
  ASSIGNED_TO_ME = 'ASSIGNED_TO_ME',
  CREATED_BY_ME = 'CREATED_BY_ME',
  AWAITING_MY_REVIEW = 'AWAITING_MY_REVIEW',
  EXCEPTIONS = 'EXCEPTIONS',
  EXPLORER = 'EXPLORER',
}

export class ListWorkItemsQueryDto {
  @IsOptional()
  @IsEnum(WorkQueueView)
  view?: WorkQueueView;

  @IsOptional()
  @IsEnum(WorkQueueFocus)
  focus?: WorkQueueFocus;

  @IsOptional()
  @IsEnum(WorkItemStatus)
  status?: WorkItemStatus;

  @IsOptional()
  @IsEnum(WorkItemType)
  type?: WorkItemType;


  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsUUID('4')
  divisionId?: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsUUID('4')
  assigneeAccountId?: string;

  @IsOptional()
  @IsUUID('4')
  assignedTeamId?: string;

  @IsOptional()
  @IsUUID('4')
  salesMemberAccountId?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dueFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  dueTo?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  plannedFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  plannedTo?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  historyFrom?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  historyTo?: string;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}
