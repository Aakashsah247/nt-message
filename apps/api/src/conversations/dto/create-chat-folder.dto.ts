import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class CreateChatFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  color?: string;

  @IsOptional()
  @IsBoolean()
  includePrivate?: boolean;

  @IsOptional()
  @IsBoolean()
  includeGroups?: boolean;

  @IsOptional()
  @IsBoolean()
  includeOfficial?: boolean;

  @IsOptional()
  @IsBoolean()
  includeUnreadOnly?: boolean;

  @IsOptional()
  @IsBoolean()
  excludeMuted?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  conversationIds?: string[];

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  targetAccountIds?: string[];
}
