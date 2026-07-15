import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const conversationMuteSettings = [
  'OFF',
  '8_HOURS',
  '1_WEEK',
  'ALWAYS',
] as const;

export type ConversationMuteSetting = (typeof conversationMuteSettings)[number];

export class UpdateConversationPreferenceDto {
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsOptional()
  @IsBoolean()
  isArchived?: boolean;

  @IsOptional()
  @IsBoolean()
  markUnread?: boolean;

  @IsOptional()
  @IsIn(conversationMuteSettings, {
    message: 'Mute setting must be off, 8 hours, 1 week or always.',
  })
  mute?: ConversationMuteSetting;

  @IsOptional()
  @IsString()
  @MaxLength(5000, {
    message: 'Draft text must be at most 5000 characters.',
  })
  draftText?: string | null;
}
