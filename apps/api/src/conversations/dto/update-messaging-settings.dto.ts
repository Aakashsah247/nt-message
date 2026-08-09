import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateMessagingSettingsDto {
  @IsOptional()
  @IsBoolean()
  showOnlineStatus?: boolean;

  @IsOptional()
  @IsBoolean()
  showReadReceipts?: boolean;

  @IsOptional()
  @IsBoolean()
  requireMessageRequests?: boolean;
}
