import { IsOptional, IsUUID } from "class-validator";

export class ManageFolderItemDto {
  @IsOptional()
  @IsUUID("4")
  conversationId?: string;

  @IsOptional()
  @IsUUID("4")
  targetAccountId?: string;
}
