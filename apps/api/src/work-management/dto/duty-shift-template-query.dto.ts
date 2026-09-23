import { IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';

export enum DutyShiftTargetScope {
  OFFICE = 'OFFICE',
  ORG_UNIT = 'ORG_UNIT',
}

export class DutyShiftTemplateQueryDto {
  @IsOptional()
  @IsEnum(DutyShiftTargetScope)
  targetScope?: DutyShiftTargetScope;

  @ValidateIf(
    (dto: DutyShiftTemplateQueryDto) =>
      dto.targetScope === DutyShiftTargetScope.ORG_UNIT,
  )
  @IsUUID('4')
  orgUnitId?: string;
}
