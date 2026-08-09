import { ConflictException } from '@nestjs/common';

import { WorkItemStatus } from '../generated/prisma/enums';
import { WorkStatusTransitionService } from './work-status-transition.service';

// Focused status tests need enum values, not Prisma's generated query runtime.
jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

describe('WorkStatusTransitionService', () => {
  const service = new WorkStatusTransitionService();

  it('moves a newly assigned work item to acknowledged', () => {
    expect(service.getStatusAfterAcknowledgement(WorkItemStatus.ASSIGNED)).toBe(
      WorkItemStatus.ACKNOWLEDGED,
    );
  });

  it('allows a supporting employee to acknowledge after work has started', () => {
    expect(
      service.getStatusAfterAcknowledgement(WorkItemStatus.IN_PROGRESS),
    ).toBeNull();
  });

  it('starts acknowledged and reopened work', () => {
    expect(service.getStatusAfterStart(WorkItemStatus.ACKNOWLEDGED)).toBe(
      WorkItemStatus.IN_PROGRESS,
    );
    expect(service.getStatusAfterStart(WorkItemStatus.REOPENED)).toBe(
      WorkItemStatus.IN_PROGRESS,
    );
  });

  it('moves active or blocked work into help requested', () => {
    expect(service.getStatusAfterHelpRequest(WorkItemStatus.IN_PROGRESS)).toBe(
      WorkItemStatus.HELP_REQUESTED,
    );
    expect(service.getStatusAfterHelpRequest(WorkItemStatus.BLOCKED)).toBe(
      WorkItemStatus.HELP_REQUESTED,
    );
  });

  it('returns help-requested work to progress after help is accepted', () => {
    expect(
      service.getStatusAfterHelpAccepted(WorkItemStatus.HELP_REQUESTED),
    ).toBe(WorkItemStatus.IN_PROGRESS);
  });

  it('rejects help responses after work enters review or a terminal state', () => {
    expect(() =>
      service.assertCanRespondToHelpRequest(WorkItemStatus.HELP_REQUESTED),
    ).not.toThrow();
    expect(() =>
      service.assertCanRespondToHelpRequest(
        WorkItemStatus.COMPLETED_PENDING_REVIEW,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      service.assertCanRespondToHelpRequest(WorkItemStatus.CLOSED),
    ).toThrow(ConflictException);
  });

  it('allows completion only from active operational states', () => {
    expect(() =>
      service.assertCanSubmitCompletion(WorkItemStatus.IN_PROGRESS),
    ).not.toThrow();
    expect(() =>
      service.assertCanSubmitCompletion(WorkItemStatus.HELP_REQUESTED),
    ).not.toThrow();
    expect(() =>
      service.assertCanSubmitCompletion(WorkItemStatus.ASSIGNED),
    ).toThrow(ConflictException);
  });

  it('restricts review, reopen, cancellation and assignment changes', () => {
    expect(() =>
      service.assertCanReviewCompletion(
        WorkItemStatus.COMPLETED_PENDING_REVIEW,
      ),
    ).not.toThrow();
    expect(() => service.assertCanReopen(WorkItemStatus.CLOSED)).not.toThrow();
    expect(() => service.assertCanCancel(WorkItemStatus.CLOSED)).toThrow(
      ConflictException,
    );
    expect(() =>
      service.assertCanChangeAssignment(WorkItemStatus.CANCELLED),
    ).toThrow(ConflictException);
    expect(() =>
      service.assertCanChangeAssignment(
        WorkItemStatus.COMPLETED_PENDING_REVIEW,
      ),
    ).toThrow(ConflictException);
    expect(() =>
      service.assertCanUpdateDetails(WorkItemStatus.COMPLETED_PENDING_REVIEW),
    ).toThrow(ConflictException);
  });

  it('rejects terminal-state employee actions', () => {
    expect(() =>
      service.getStatusAfterAcknowledgement(WorkItemStatus.CLOSED),
    ).toThrow(ConflictException);
    expect(() => service.getStatusAfterStart(WorkItemStatus.CANCELLED)).toThrow(
      ConflictException,
    );
  });
});
