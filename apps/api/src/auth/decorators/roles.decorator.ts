import { SetMetadata } from '@nestjs/common';
import { AccountRole } from '../../generated/prisma/client';

export const ROLES_KEY = 'required_roles';

/*
 * Example:
 *
 * @Roles(AccountRole.SUPER_ADMIN)
 */
export const Roles = (...roles: AccountRole[]) => SetMetadata(ROLES_KEY, roles);
