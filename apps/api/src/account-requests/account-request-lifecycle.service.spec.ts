import { ConflictException } from '@nestjs/common';

import { AccountRequestLifecycleState } from '../generated/prisma/client';
import { AccountRequestLifecycleService } from './account-request-lifecycle.service';

describe('AccountRequestLifecycleService', () => {
  const service = new AccountRequestLifecycleService();

  it.each([
    [
      AccountRequestLifecycleState.REQUESTED,
      AccountRequestLifecycleState.UNDER_REVIEW,
    ],
    [
      AccountRequestLifecycleState.UNDER_REVIEW,
      AccountRequestLifecycleState.RETURNED_FOR_CORRECTION,
    ],
    [
      AccountRequestLifecycleState.UNDER_REVIEW,
      AccountRequestLifecycleState.REJECTED,
    ],
    [
      AccountRequestLifecycleState.UNDER_REVIEW,
      AccountRequestLifecycleState.APPROVED,
    ],
    [
      AccountRequestLifecycleState.RETURNED_FOR_CORRECTION,
      AccountRequestLifecycleState.REQUESTED,
    ],
    [
      AccountRequestLifecycleState.APPROVED,
      AccountRequestLifecycleState.PROVISIONED,
    ],
    [
      AccountRequestLifecycleState.PROVISIONED,
      AccountRequestLifecycleState.ACTIVE,
    ],
  ])('allows %s -> %s', (from, to) => {
    expect(service.canTransition(from, to)).toBe(true);
    expect(() => service.assertTransition(from, to)).not.toThrow();
  });

  it.each([
    [
      AccountRequestLifecycleState.REQUESTED,
      AccountRequestLifecycleState.APPROVED,
    ],
    [
      AccountRequestLifecycleState.RETURNED_FOR_CORRECTION,
      AccountRequestLifecycleState.APPROVED,
    ],
    [
      AccountRequestLifecycleState.APPROVED,
      AccountRequestLifecycleState.ACTIVE,
    ],
    [
      AccountRequestLifecycleState.REJECTED,
      AccountRequestLifecycleState.REQUESTED,
    ],
    [
      AccountRequestLifecycleState.ACTIVE,
      AccountRequestLifecycleState.REQUESTED,
    ],
  ])('rejects %s -> %s', (from, to) => {
    expect(service.canTransition(from, to)).toBe(false);
    expect(() => service.assertTransition(from, to)).toThrow(ConflictException);
  });
});
