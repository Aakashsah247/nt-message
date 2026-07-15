import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsUUID,
} from 'class-validator';

export const privateGroupHistoryWindows = [
  'NONE',
  'LAST_15_MINUTES',
  'LAST_1_HOUR',
  'LAST_24_HOURS',
] as const;

export type PrivateGroupHistoryWindow =
  (typeof privateGroupHistoryWindows)[number];

export class CreatePrivateGroupFromPrivateConversationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', {
    each: true,
    message: 'Every selected private group member account ID must be valid.',
  })
  memberAccountIds!: string[];

  @IsIn(privateGroupHistoryWindows, {
    message:
      'History access must be none, last 15 minutes, last 1 hour or last 24 hours.',
  })
  historyWindow!: PrivateGroupHistoryWindow;
}
