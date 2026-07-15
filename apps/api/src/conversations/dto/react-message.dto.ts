import { IsIn } from 'class-validator';

export const SUPPORTED_MESSAGE_REACTIONS = [
  '👍',
  '❤️',
  '😂',
  '😮',
  '😢',
  '🙏',
] as const;

export type SupportedMessageReaction =
  (typeof SUPPORTED_MESSAGE_REACTIONS)[number];

export class ReactMessageDto {
  @IsIn(SUPPORTED_MESSAGE_REACTIONS, {
    message: 'Reaction is not supported.',
  })
  reaction!: SupportedMessageReaction;
}
