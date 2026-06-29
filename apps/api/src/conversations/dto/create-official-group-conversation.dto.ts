import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOfficialGroupConversationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsIn(['ORGANIZATION', 'DIVISION', 'DEPARTMENT'])
  scopeType!: 'ORGANIZATION' | 'DIVISION' | 'DEPARTMENT';

  @IsOptional()
  @IsUUID('4', {
    message: 'Official group division ID must be a valid UUID.',
  })
  divisionId?: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'Official group department ID must be a valid UUID.',
  })
  departmentId?: string;
}
