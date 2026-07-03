import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class SendAttachmentMessageDto {
  @IsUUID('4', {
    message: 'Client message ID must be a valid UUID.',
  })
  clientMessageId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  caption?: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'Reply message ID must be a valid UUID.',
  })
  replyToMessageId?: string;

  @IsOptional()
  @IsIn(['VOICE_NOTE'], {
    message: 'Attachment kind is not supported.',
  })
  attachmentKind?: 'VOICE_NOTE';
}
