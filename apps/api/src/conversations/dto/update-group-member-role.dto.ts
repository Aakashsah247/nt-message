import { IsIn } from 'class-validator';

export class UpdateGroupMemberRoleDto {
  @IsIn(['ADMIN', 'MEMBER'])
  role: 'ADMIN' | 'MEMBER';
}
