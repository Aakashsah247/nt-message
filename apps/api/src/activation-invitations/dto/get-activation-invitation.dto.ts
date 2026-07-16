import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class GetActivationInvitationDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'The activation invitation is invalid.',
  })
  token!: string;
}
