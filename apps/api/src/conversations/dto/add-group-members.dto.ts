import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

export class AddGroupMembersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsUUID('4', {
    each: true,
    message: 'Every group member account ID must be a valid UUID.',
  })
  memberAccountIds: string[];
}
