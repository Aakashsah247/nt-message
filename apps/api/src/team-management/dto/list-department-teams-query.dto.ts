import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ListDepartmentTeamsQueryDto {
  @IsOptional()
  @IsUUID('4')
  divisionId?: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
