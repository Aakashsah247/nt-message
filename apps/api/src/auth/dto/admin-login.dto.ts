import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsEmail(
    {},
    {
      message: 'Enter the official Super Admin email address.',
    },
  )
  @MaxLength(255)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
