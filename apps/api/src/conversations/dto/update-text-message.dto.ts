import {
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateTextMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text: string;
}
