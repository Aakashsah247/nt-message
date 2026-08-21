import { IsUUID } from 'class-validator';

export class ManageFolderItemDto {
  @IsUUID('4')
  conversationId!: string;
}
