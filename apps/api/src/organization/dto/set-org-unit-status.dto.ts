import { IsBoolean } from 'class-validator';

export class SetOrgUnitStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
