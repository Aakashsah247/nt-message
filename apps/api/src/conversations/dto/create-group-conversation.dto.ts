import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateGroupConversationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(99)
  @ArrayUnique()
  @IsUUID('4', {
    each: true,
    message: 'Every group member account ID must be a valid UUID.',
  })
  memberAccountIds: string[];
}
