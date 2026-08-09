import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListDepartmentTeamMembersQueryDto {
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
