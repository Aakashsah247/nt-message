import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class MoveOrgUnitDto {
  @IsOptional()
  @IsUUID('4')
  parentOrgUnitId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
