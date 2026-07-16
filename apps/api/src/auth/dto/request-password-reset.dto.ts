import { IsEmail, IsString, MaxLength } from 'class-validator';

export class RequestPasswordResetDto {
  @IsString()
  @IsEmail()
  @MaxLength(255)
  officialEmail!: string;
}
