import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class UnifiedLoginDto {
  @IsEmail(
    {},
    {
      message: 'Enter your official email address.',
    },
  )
  @MaxLength(255)
  identifier!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}
