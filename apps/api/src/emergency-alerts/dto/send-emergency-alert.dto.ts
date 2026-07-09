import { IsUUID } from 'class-validator';

export class SendEmergencyAlertDto {
  @IsUUID('4')
  recipientAccountId!: string;
}
