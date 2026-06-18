import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class EmployeeLoginDto {
  @IsEmail({}, {
    message:
      "Enter a valid official email address.",
  })
  @MaxLength(255)
  officialEmail!: string;

  @IsString()
  @MinLength(1, {
    message: "Password is required.",
  })
  @MaxLength(128)
  password!: string;
}