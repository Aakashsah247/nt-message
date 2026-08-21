import {
  IsBoolean,
  IsNotEmpty,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class MessagingPushSubscriptionKeysDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  p256dh!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  auth!: string;
}

export class UpsertMessagingPushSubscriptionDto {
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  endpoint!: string;

  @ValidateNested()
  @Type(() => MessagingPushSubscriptionKeysDto)
  keys!: MessagingPushSubscriptionKeysDto;

  @IsBoolean()
  showPreview!: boolean;

  @IsBoolean()
  isMuted!: boolean;
}
