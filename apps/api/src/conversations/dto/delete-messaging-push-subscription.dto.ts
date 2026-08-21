import { IsUrl, MaxLength } from 'class-validator';

export class DeleteMessagingPushSubscriptionDto {
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  endpoint!: string;
}
