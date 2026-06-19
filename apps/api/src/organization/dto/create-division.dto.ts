import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateDivisionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, {
    message:
      'Division code may contain letters, numbers, underscores and hyphens only.',
  })
  code!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;
}
