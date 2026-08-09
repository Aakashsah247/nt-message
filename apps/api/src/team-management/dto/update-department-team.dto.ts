import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateDepartmentTeamDto {
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
