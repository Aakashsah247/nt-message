import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export enum PerformanceReportGroup {
  EMPLOYEE = 'EMPLOYEE',
  DEPARTMENT = 'DEPARTMENT',
  DIVISION = 'DIVISION',
}

export enum PerformanceReportStaffMode {
  WITH_WORK = 'WITH_WORK',
  ALL = 'ALL',
}

export enum PerformanceReportWorkType {
  ALL = 'ALL',
  ROUTINE_TASK = 'ROUTINE_TASK',
  TROUBLE_TICKET = 'TROUBLE_TICKET',
  MAINTENANCE = 'MAINTENANCE',
  NEW_CONNECTION = 'NEW_CONNECTION',
  UPDATE_SERVICES = 'UPDATE_SERVICES',
  INSPECTION = 'INSPECTION',
  EMERGENCY_WORK = 'EMERGENCY_WORK',
  ADMINISTRATIVE_TASK = 'ADMINISTRATIVE_TASK',
}

export enum PerformanceReportSection {
  WORK_SUMMARY = 'WORK_SUMMARY',
  WORK_DETAILS = 'WORK_DETAILS',
  DUTY_SUMMARY = 'DUTY_SUMMARY',
  DUTY_DETAILS = 'DUTY_DETAILS',
}

export class PerformanceReportQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to?: string;

  @IsOptional()
  @IsUUID('4')
  divisionId?: string;

  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsOptional()
  @IsUUID('4')
  employeeAccountId?: string;

  @IsOptional()
  @IsEnum(PerformanceReportGroup)
  groupBy?: PerformanceReportGroup;

  @IsOptional()
  @IsEnum(PerformanceReportStaffMode)
  staffMode?: PerformanceReportStaffMode;

  @IsOptional()
  @IsEnum(PerformanceReportWorkType)
  workType?: PerformanceReportWorkType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class ExportPerformanceReportQueryDto extends PerformanceReportQueryDto {
  @IsEnum(PerformanceReportSection)
  section!: PerformanceReportSection;
}
