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

  @IsIn(['OFFICE', 'ORG_UNIT'])
  scopeType!: 'OFFICE' | 'ORG_UNIT';

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
}
