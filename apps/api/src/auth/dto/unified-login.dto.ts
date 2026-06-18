import {
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class UnifiedLoginDto {
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  identifier!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}