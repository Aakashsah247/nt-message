import {
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export const OFFICE_HEAD_TRANSFER_MODES = ['EMPLOYEE', 'OFFICE_HEAD'] as const;
export type OfficeHeadTransferMode =
  (typeof OFFICE_HEAD_TRANSFER_MODES)[number];

export class TransferOfficeHeadDto {
  @IsUUID('4')
  targetOfficeId!: string;

  @IsOptional()
  @IsUUID('4')
  targetOrgUnitId?: string;

  @IsUUID('4')
  replacementEmployeeId!: string;

  @IsIn(OFFICE_HEAD_TRANSFER_MODES)
  transferAs!: OfficeHeadTransferMode;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  effectiveAt?: string;
}
