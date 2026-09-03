import { ConflictException, Injectable } from '@nestjs/common';

import { AccountRequestLifecycleState } from '../generated/prisma/client';

const ALLOWED_TRANSITIONS: Record<
  AccountRequestLifecycleState,
  ReadonlySet<AccountRequestLifecycleState>
> = {
  [AccountRequestLifecycleState.REQUESTED]: new Set([
    AccountRequestLifecycleState.UNDER_REVIEW,
  ]),
  [AccountRequestLifecycleState.UNDER_REVIEW]: new Set([
    AccountRequestLifecycleState.RETURNED_FOR_CORRECTION,
    AccountRequestLifecycleState.REJECTED,
    AccountRequestLifecycleState.APPROVED,
  ]),
  [AccountRequestLifecycleState.RETURNED_FOR_CORRECTION]: new Set([
    AccountRequestLifecycleState.REQUESTED,
  ]),
  [AccountRequestLifecycleState.REJECTED]: new Set(),
  [AccountRequestLifecycleState.APPROVED]: new Set([
    AccountRequestLifecycleState.PROVISIONED,
  ]),
  [AccountRequestLifecycleState.PROVISIONED]: new Set([
    AccountRequestLifecycleState.ACTIVE,
  ]),
  [AccountRequestLifecycleState.ACTIVE]: new Set(),
};

@Injectable()
export class AccountRequestLifecycleService {
  canTransition(
    from: AccountRequestLifecycleState,
    to: AccountRequestLifecycleState,
  ): boolean {
    return ALLOWED_TRANSITIONS[from].has(to);
  }

  assertTransition(
    from: AccountRequestLifecycleState,
    to: AccountRequestLifecycleState,
  ): void {
    if (!this.canTransition(from, to)) {
      throw new ConflictException(
        `Account request cannot move from ${from} to ${to}.`,
      );
    }
  }
}
