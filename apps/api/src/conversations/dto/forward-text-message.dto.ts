import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class ForwardTextMessageDto {
  @IsUUID('4', {
    message: 'Forward request ID must be a valid UUID.',
  })
  clientForwardId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsUUID('4', {
    each: true,
    message: 'Every destination conversation ID must be a valid UUID.',
  })
  destinationConversationIds: string[];
}
