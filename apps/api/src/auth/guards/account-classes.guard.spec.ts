import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { AccountClass, AccountRole } from '../../generated/prisma/client';
import { AccountClassesGuard } from './account-classes.guard';

function createContext(accountClass?: AccountClass): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          accountId: 'account-1',
          sessionId: 'session-1',
          username: 'tester',
          accountClass,
          role: AccountRole.EMPLOYEE,
        },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('AccountClassesGuard', () => {
  it('allows an account class explicitly permitted by the route', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AccountClass.OFFICE_USER]),
    } as unknown as Reflector;
    const guard = new AccountClassesGuard(reflector);

    expect(guard.canActivate(createContext(AccountClass.OFFICE_USER))).toBe(
      true,
    );
  });

  it('rejects an account class that is not permitted by the route', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AccountClass.SUPER_ADMIN]),
    } as unknown as Reflector;
    const guard = new AccountClassesGuard(reflector);

    expect(() =>
      guard.canActivate(createContext(AccountClass.OFFICE_USER)),
    ).toThrow('You do not have permission to perform this action.');
  });

  it('rejects requests that do not carry the Phase 13 accountClass claim', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([AccountClass.OFFICE_USER]),
    } as unknown as Reflector;
    const guard = new AccountClassesGuard(reflector);

    expect(() => guard.canActivate(createContext())).toThrow(
      'Authenticated account class information is missing.',
    );
  });
});
