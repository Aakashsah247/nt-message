import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  WorkActivityAction,
  WorkItemStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { ManageWorkRetentionDto } from './dto/manage-work-retention.dto';
import { workItemDetailSelect } from './work-items.service';
import { WorkScopeService, type WorkActorContext } from './work-scope.service';

const retentionCurrentSelect = {
  id: true,
  ticketNumber: true,
  title: true,
  status: true,
  version: true,
  archiveEligibleAt: true,
  deletionEligibleAt: true,
  retentionHoldAt: true,
  retentionHoldReason: true,
  deletionRequestedAt: true,
  deletionRequestReason: true,
} satisfies Prisma.WorkItemSelect;

type RetentionCurrent = Prisma.WorkItemGetPayload<{
  select: typeof retentionCurrentSelect;
}>;

@Injectable()
export class WorkRetentionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workScopeService: WorkScopeService,
  ) {}

  async placeHold(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ManageWorkRetentionDto,
  ) {
    const actor = await this.resolveRetentionManager(user);
    const workItem = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleTerminal(
          transaction,
          actor,
          workItemId,
        );

        if (current.retentionHoldAt) {
          throw new ConflictException(
            'This ticket already has a retention hold.',
          );
        }

        const heldAt = new Date();
        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            retentionHoldAt: null,
          },
          data: {
            retentionHoldAt: heldAt,
            retentionHoldReason: dto.reason,
            retentionHoldByAccountId: actor.accountId,
            // A hold cancels any pending deletion request until the hold is released.
            deletionRequestedAt: null,
            deletionRequestReason: null,
            deletionRequestedByAccountId: null,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);
        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.RETENTION_HOLD_APPLIED,
            fromStatus: current.status,
            toStatus: current.status,
            details: { reason: dto.reason, heldAt: heldAt.toISOString() },
          },
        });

        return transaction.workItem.findUniqueOrThrow({
          where: { id: current.id },
          select: workItemDetailSelect,
        });
      },
    );

    return {
      message: 'Retention hold applied. The ticket cannot enter deletion review.',
      workItem,
    };
  }

  async releaseHold(user: AuthenticatedUser, workItemId: string) {
    const actor = await this.resolveRetentionManager(user);
    const workItem = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleTerminal(
          transaction,
          actor,
          workItemId,
        );

        if (!current.retentionHoldAt) {
          throw new ConflictException(
            'This ticket does not have a retention hold.',
          );
        }

        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            retentionHoldAt: { not: null },
          },
          data: {
            retentionHoldAt: null,
            retentionHoldReason: null,
            retentionHoldByAccountId: null,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);
        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.RETENTION_HOLD_RELEASED,
            fromStatus: current.status,
            toStatus: current.status,
            details: { previousReason: current.retentionHoldReason },
          },
        });

        return transaction.workItem.findUniqueOrThrow({
          where: { id: current.id },
          select: workItemDetailSelect,
        });
      },
    );

    return { message: 'Retention hold released.', workItem };
  }

  async requestDeletionReview(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ManageWorkRetentionDto,
  ) {
    const actor = await this.resolveRetentionManager(user);
    const workItem = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleTerminal(
          transaction,
          actor,
          workItemId,
        );
        const now = new Date();

        if (
          !current.archiveEligibleAt ||
          current.archiveEligibleAt.getTime() > now.getTime()
        ) {
          throw new ConflictException(
            'Only read-only archived tickets can enter deletion review.',
          );
        }

        if (
          !current.deletionEligibleAt ||
          current.deletionEligibleAt.getTime() > now.getTime()
        ) {
          throw new ConflictException(
            'This ticket has not reached the three-year deletion-review date.',
          );
        }

        if (current.retentionHoldAt) {
          throw new ConflictException(
            'Release the retention hold before requesting deletion review.',
          );
        }

        if (current.deletionRequestedAt) {
          throw new ConflictException(
            'Deletion review has already been requested for this ticket.',
          );
        }

        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            retentionHoldAt: null,
            deletionRequestedAt: null,
          },
          data: {
            deletionRequestedAt: now,
            deletionRequestReason: dto.reason,
            deletionRequestedByAccountId: actor.accountId,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);
        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.DELETION_REVIEW_REQUESTED,
            fromStatus: current.status,
            toStatus: current.status,
            details: {
              reason: dto.reason,
              requestedAt: now.toISOString(),
              permanentDeletionEnabled: false,
            },
          },
        });

        return transaction.workItem.findUniqueOrThrow({
          where: { id: current.id },
          select: workItemDetailSelect,
        });
      },
    );

    return {
      message:
        'Deletion review requested. The ticket remains archived until a future Software-System Operator reviews it.',
      workItem,
    };
  }

  async cancelDeletionReview(user: AuthenticatedUser, workItemId: string) {
    const actor = await this.resolveRetentionManager(user);
    const workItem = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleTerminal(
          transaction,
          actor,
          workItemId,
        );

        if (!current.deletionRequestedAt) {
          throw new ConflictException(
            'This ticket does not have a pending deletion-review request.',
          );
        }

        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            deletionRequestedAt: { not: null },
          },
          data: {
            deletionRequestedAt: null,
            deletionRequestReason: null,
            deletionRequestedByAccountId: null,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);
        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.DELETION_REVIEW_CANCELLED,
            fromStatus: current.status,
            toStatus: current.status,
            details: { previousReason: current.deletionRequestReason },
          },
        });

        return transaction.workItem.findUniqueOrThrow({
          where: { id: current.id },
          select: workItemDetailSelect,
        });
      },
    );

    return { message: 'Deletion-review request cancelled.', workItem };
  }

  private async resolveRetentionManager(
    user: AuthenticatedUser,
  ): Promise<WorkActorContext> {
    const actor = await this.workScopeService.resolveActorContext(user);

    if (actor.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only the Super Admin can place retention holds or request deletion review.',
      );
    }

    return actor;
  }

  private async findVisibleTerminal(
    transaction: Prisma.TransactionClient,
    actor: WorkActorContext,
    workItemId: string,
  ): Promise<RetentionCurrent> {
    const workItem = await transaction.workItem.findFirst({
      where: {
        AND: [
          { id: workItemId },
          this.workScopeService.buildVisibleWorkWhere(actor),
        ],
      },
      select: retentionCurrentSelect,
    });

    if (!workItem) {
      throw new NotFoundException('Work item was not found.');
    }

    if (
      workItem.status !== WorkItemStatus.CLOSED &&
      workItem.status !== WorkItemStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Retention controls are available only for closed or cancelled tickets.',
      );
    }

    return workItem;
  }

  private assertSingleUpdate(count: number): void {
    if (count !== 1) {
      throw new ConflictException(
        'This retention record changed while the action was being processed. Refresh and try again.',
      );
    }
  }
}
