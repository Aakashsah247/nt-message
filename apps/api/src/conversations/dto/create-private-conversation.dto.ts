import { IsUUID } from 'class-validator';

export class CreatePrivateConversationDto {
  @IsUUID('4', {
    message: 'Participant account ID must be a valid UUID.',
  })
  participantAccountId: string;
}
