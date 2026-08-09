import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDepartmentTeamDto {
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  teamName!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  memberEmployeeIds!: string[];

  @IsUUID('4')
  adminEmployeeId!: string;
}
