import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AccountClass } from '../../generated/prisma/client';
import { ACCOUNT_CLASSES_KEY } from '../decorators/account-classes.decorator';
import type { AuthenticatedUser } from '../types/auth.types';

type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser;
};

@Injectable()
export class AccountClassesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredAccountClasses = this.reflector.getAllAndOverride<
      AccountClass[]
    >(ACCOUNT_CLASSES_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredAccountClasses?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user?.accountClass) {
      throw new ForbiddenException(
        'Authenticated account class information is missing.',
      );
    }

    if (!requiredAccountClasses.includes(user.accountClass)) {
      throw new ForbiddenException(
        'You do not have permission to perform this action.',
      );
    }

    return true;
  }
}
