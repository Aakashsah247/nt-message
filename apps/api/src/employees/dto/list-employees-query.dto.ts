import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { EmployeeStatus } from "../../generated/prisma/client";

export class ListEmployeesQueryDto {
  /*
   * Search can match employee ID, name, email,
   * department or designation.
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  /*
   * URL query parameters arrive as strings.
   * @Type converts them into numbers.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  /*
   * Limit is restricted to 100 records per request.
   * This prevents an excessively large database response.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}