import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class AdminLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message:
      'Username may contain letters, numbers, dots, underscores and hyphens only.',
  })
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
