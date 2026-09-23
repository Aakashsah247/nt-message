import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListOperationalTeamsQueryDto {
  @IsOptional()
  @IsUUID('4')
  orgUnitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['active', 'removed'])
  status?: 'active' | 'removed';
}
