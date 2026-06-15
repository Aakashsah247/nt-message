import { SetMetadata } from "@nestjs/common";
import { AccountRole } from "../../generated/prisma/client";

/*
 * This key is used by RolesGuard to read the roles
 * attached to a controller or endpoint.
 */
export const ROLES_KEY = "required_roles";

/*
 * Example:
 *
 * @Roles(AccountRole.ADMIN)
 *
 * This stores the required role as route metadata.
 */
export const Roles = (...roles: AccountRole[]) =>
  SetMetadata(ROLES_KEY, roles);