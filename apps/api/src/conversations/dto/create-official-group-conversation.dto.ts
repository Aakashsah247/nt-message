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

  @IsIn(['ORGANIZATION', 'DIVISION', 'DEPARTMENT', 'OFFICE', 'ORG_UNIT'])
  scopeType!:
    | 'ORGANIZATION'
    | 'DIVISION'
    | 'DEPARTMENT'
    | 'OFFICE'
    | 'ORG_UNIT';

  @IsOptional()
  @IsUUID('4', {
    message: 'Official group office ID must be a valid UUID.',
  })
  officeId?: string;

  @IsOptional()
  @IsUUID('4', {
    message: 'Official group OrgUnit ID must be a valid UUID.',
  })
  orgUnitId?: string;

  @IsOptional()
  @IsIn(['DIRECT_MEMBERS', 'ENTIRE_SUBTREE'])
  membershipMode?: 'DIRECT_MEMBERS' | 'ENTIRE_SUBTREE';

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
