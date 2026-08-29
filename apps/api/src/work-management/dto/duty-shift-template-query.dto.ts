import { IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export enum DutyShiftTargetScope {
  BRANCH = 'BRANCH',
  DIVISION = 'DIVISION',
  DEPARTMENT = 'DEPARTMENT',
}

export class DutyShiftTemplateQueryDto {
  @IsOptional()
  @IsEnum(DutyShiftTargetScope)
  targetScope?: DutyShiftTargetScope;

  @ValidateIf((dto: DutyShiftTemplateQueryDto) => dto.targetScope === DutyShiftTargetScope.DIVISION || dto.targetScope === DutyShiftTargetScope.DEPARTMENT)
  @IsUUID('4')
  divisionId?: string;

  @ValidateIf((dto: DutyShiftTemplateQueryDto) => dto.targetScope === DutyShiftTargetScope.DEPARTMENT)
  @IsUUID('4')
  departmentId?: string;
}
