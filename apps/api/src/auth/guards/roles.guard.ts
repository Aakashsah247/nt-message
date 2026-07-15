import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AccountRole } from '../../generated/prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedUser } from '../types/auth.types';

/*
 * The normal Express request does not define our custom user property.
 * Passport adds this user after successfully validating the JWT.
 */
type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    /*
     * Read required roles from either:
     * 1. The individual controller method
     * 2. The complete controller class
     */
    const requiredRoles = this.reflector.getAllAndOverride<AccountRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    /*
     * When no role is attached to the route,
     * this guard does not block the request.
     */
    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const user = request.user;

    /*
     * AccessTokenGuard should already have created request.user.
     * This extra check protects against incorrect guard usage.
     */
    if (!user) {
      throw new ForbiddenException(
        'Authenticated account information is missing.',
      );
    }

    const roleIsAllowed = requiredRoles.includes(user.role);

    if (!roleIsAllowed) {
      throw new ForbiddenException(
        'You do not have permission to perform this action.',
      );
    }

    return true;
  }
}
