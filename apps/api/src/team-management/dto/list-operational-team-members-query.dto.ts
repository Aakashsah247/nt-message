import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListOperationalTeamMembersQueryDto {
  @IsUUID('4')
  orgUnitId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
