import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateOfficeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, {
    message:
      'Office code may contain letters, numbers, underscores and hyphens only.',
  })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;
}
