import {
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class EmployeeLoginDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message:
      "Employee ID has an invalid format.",
  })
  empId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}