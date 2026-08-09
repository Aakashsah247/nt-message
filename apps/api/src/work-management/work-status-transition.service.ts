import { ConflictException, Injectable } from '@nestjs/common';

import { WorkItemStatus } from '../generated/prisma/client';

@Injectable()
export class WorkStatusTransitionService {
  getStatusAfterAcknowledgement(
    currentStatus: WorkItemStatus,
  ): WorkItemStatus | null {
    if (currentStatus === WorkItemStatus.ASSIGNED) {
      return WorkItemStatus.ACKNOWLEDGED;
    }

    // Supporting employees can acknowledge after the primary employee has moved the ticket forward.
    if (
      currentStatus === WorkItemStatus.ACKNOWLEDGED ||
      currentStatus === WorkItemStatus.IN_PROGRESS ||
      currentStatus === WorkItemStatus.HELP_REQUESTED ||
      currentStatus === WorkItemStatus.REOPENED ||
      currentStatus === WorkItemStatus.BLOCKED
    ) {
      return null;
    }

    throw new ConflictException(
      'This work item can no longer be acknowledged.',
    );
  }

  getStatusAfterStart(currentStatus: WorkItemStatus): WorkItemStatus {
    if (
      currentStatus === WorkItemStatus.ACKNOWLEDGED ||
      currentStatus === WorkItemStatus.REOPENED
    ) {
      return WorkItemStatus.IN_PROGRESS;
    }

    if (currentStatus === WorkItemStatus.IN_PROGRESS) {
      return WorkItemStatus.IN_PROGRESS;
    }

    throw new ConflictException('This work item is not ready to start.');
  }

  getStatusAfterHelpRequest(currentStatus: WorkItemStatus): WorkItemStatus {
    if (
      currentStatus === WorkItemStatus.IN_PROGRESS ||
      currentStatus === WorkItemStatus.BLOCKED ||
      currentStatus === WorkItemStatus.HELP_REQUESTED
    ) {
      return WorkItemStatus.HELP_REQUESTED;
    }

    throw new ConflictException(
      'Help can be requested only after the work has started or become blocked.',
    );
  }

  getStatusAfterHelpAccepted(currentStatus: WorkItemStatus): WorkItemStatus {
    if (
      currentStatus === WorkItemStatus.HELP_REQUESTED ||
      currentStatus === WorkItemStatus.BLOCKED
    ) {
      return WorkItemStatus.IN_PROGRESS;
    }

    if (currentStatus === WorkItemStatus.IN_PROGRESS) {
      return currentStatus;
    }

    throw new ConflictException(
      'This work item is no longer waiting for supporting help.',
    );
  }

  assertCanRespondToHelpRequest(currentStatus: WorkItemStatus): void {
    if (
      currentStatus === WorkItemStatus.IN_PROGRESS ||
      currentStatus === WorkItemStatus.HELP_REQUESTED ||
      currentStatus === WorkItemStatus.BLOCKED
    ) {
      return;
    }

    throw new ConflictException(
      'This help request can no longer be answered because the work status changed.',
    );
  }

  assertCanSubmitCompletion(currentStatus: WorkItemStatus): void {
    if (
      currentStatus === WorkItemStatus.IN_PROGRESS ||
      currentStatus === WorkItemStatus.HELP_REQUESTED ||
      currentStatus === WorkItemStatus.BLOCKED
    ) {
      return;
    }

    throw new ConflictException(
      'This work item is not ready for a completion report.',
    );
  }

  assertCanReviewCompletion(currentStatus: WorkItemStatus): void {
    if (currentStatus === WorkItemStatus.COMPLETED_PENDING_REVIEW) {
      return;
    }

    throw new ConflictException(
      'This work item is not waiting for manager review.',
    );
  }

  assertCanReopen(currentStatus: WorkItemStatus): void {
    if (
      currentStatus === WorkItemStatus.COMPLETED_PENDING_REVIEW ||
      currentStatus === WorkItemStatus.CLOSED
    ) {
      return;
    }

    throw new ConflictException('This work item cannot be reopened.');
  }

  assertCanCancel(currentStatus: WorkItemStatus): void {
    if (
      currentStatus === WorkItemStatus.CLOSED ||
      currentStatus === WorkItemStatus.CANCELLED
    ) {
      throw new ConflictException(
        'A closed or cancelled work item cannot be cancelled again.',
      );
    }
  }

  assertCanChangeAssignment(currentStatus: WorkItemStatus): void {
    if (
      currentStatus === WorkItemStatus.COMPLETED_PENDING_REVIEW ||
      currentStatus === WorkItemStatus.CLOSED ||
      currentStatus === WorkItemStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Assignments cannot be changed while work is under review, closed or cancelled.',
      );
    }
  }

  assertCanUpdateDetails(currentStatus: WorkItemStatus): void {
    if (
      currentStatus === WorkItemStatus.COMPLETED_PENDING_REVIEW ||
      currentStatus === WorkItemStatus.CLOSED ||
      currentStatus === WorkItemStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Work details cannot be edited while work is under review, closed or cancelled.',
      );
    }
  }
}
