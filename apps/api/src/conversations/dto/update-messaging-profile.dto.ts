import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateMessagingProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;
}
