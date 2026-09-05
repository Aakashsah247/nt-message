import {
  IsIn,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class OrganizationDelegationContextQueryDto {
  @IsOptional()
  @IsUUID('4')
  orgUnitId?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  includeDescendants?: 'true' | 'false';
}
