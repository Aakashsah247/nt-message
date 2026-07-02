import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateGroupConversationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
