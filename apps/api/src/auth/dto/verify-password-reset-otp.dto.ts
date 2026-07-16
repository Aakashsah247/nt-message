import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';

export class VerifyPasswordResetOtpDto {
  @IsString()
  @IsEmail()
  @MaxLength(255)
  officialEmail!: string;

  @IsString()
  @Matches(/^\d{6}$/, {
    message: 'Recovery code must contain exactly 6 digits.',
  })
  otp!: string;
}
