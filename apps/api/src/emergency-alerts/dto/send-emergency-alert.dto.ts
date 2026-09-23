import {
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SendEmergencyAlertDto {
  @IsUUID('4')
  recipientAccountId!: string;

  @IsIn(['EN', 'NE'])
  language!: 'EN' | 'NE';

  @IsIn(['QUICK', 'CUSTOM'])
  messageMode!: 'QUICK' | 'CUSTOM';

  @ValidateIf((dto: SendEmergencyAlertDto) => dto.messageMode === 'CUSTOM')
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  customMessage?: string;
}
