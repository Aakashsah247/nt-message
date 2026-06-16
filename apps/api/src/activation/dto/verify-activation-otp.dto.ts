import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class VerifyActivationOtpDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: "Employee ID has an invalid format.",
  })
  empId!: string;

  @IsString()
  @Matches(/^\+?[0-9]{7,20}$/, {
    message:
      "Phone number must contain 7 to 20 digits.",
  })
  phoneNumber!: string;

  @IsEmail()
  @MaxLength(255)
  officialEmail!: string;

  @IsString()
  @Matches(/^[0-9]{6}$/, {
    message: "OTP must contain exactly 6 digits.",
  })
  otp!: string;
}