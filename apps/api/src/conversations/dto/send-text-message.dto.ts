import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendTextMessageDto {
  @IsUUID('4', {
    message: 'Client message ID must be a valid UUID.',
  })
  clientMessageId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'Reply message ID must be a valid UUID.',
  })
  replyToMessageId?: string;
}
