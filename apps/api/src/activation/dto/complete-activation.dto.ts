import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class CompleteActivationDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  activationToken!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/,
    {
      message:
        "Password must include uppercase, lowercase, number and special character.",
    },
  )
  password!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  confirmPassword!: string;
}
