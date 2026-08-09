import { IsArray, IsUUID } from "class-validator";

export class ReorderChatFoldersDto {
  @IsArray()
  @IsUUID("4", { each: true })
  folderIds!: string[];
}
