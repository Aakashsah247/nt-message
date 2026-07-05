import {
  ArrayUnique,
  IsArray,
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

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', {
    each: true,
    message: 'Mentioned account IDs must be valid UUIDs.',
  })
  mentionedAccountIds?: string[];
}
