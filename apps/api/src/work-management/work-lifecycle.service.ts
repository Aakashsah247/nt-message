import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  WorkActivityAction,
  WorkAssignmentRole,
  WorkHelpRequestStatus,
  WorkItemStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CoordinateWorkHelpDto } from './dto/coordinate-work-help.dto';
import { RequestWorkHelpDto } from './dto/request-work-help.dto';
import { RespondWorkHelpDto } from './dto/respond-work-help.dto';
import {
  workAccountSummarySelect,
  workCompatibilityDetailSelect,
} from './work-compatibility-selects';
import { DutyAvailabilityService } from './duty-availability.service';
import { WorkNotificationsService } from './work-notifications.service';
import { WorkScopeService, type WorkActorContext } from './work-scope.service';
import { WorkStatusTransitionService } from './work-status-transition.service';

const lifecycleCurrentSelect = {
  id: true,
  ticketNumber: true,
  title: true,
  status: true,
  version: true,
  officeId: true,
  primaryOwnerOrgUnitId: true,
  archiveEligibleAt: true,
  assignments: {
    where: {
      endedAt: null,
    },
    select: {
      id: true,
      assigneeAccountId: true,
      assignmentRole: true,
      acknowledgedAt: true,
      startedAt: true,
    },
  },
  completionReports: {
    orderBy: {
      createdAt: 'desc',
    },
    take: 1,
    select: {
      id: true,
      reviewStatus: true,
      customerId: true,
      rxLevelDbm: true,
    },
  },
  childWorkItems: {
    where: {
      status: {
        notIn: [WorkItemStatus.CLOSED, WorkItemStatus.CANCELLED],
      },
    },
    orderBy: { dueAt: 'desc' },
    take: 1,
    select: { id: true, dueAt: true },
  },
} satisfies Prisma.WorkItemSelect;

type LifecycleCurrentWorkItemPayload = Prisma.WorkItemGetPayload<{
  select: typeof lifecycleCurrentSelect;
}>;

type LifecycleCurrentWorkItem = LifecycleCurrentWorkItemPayload;

type WorkItemDetailPayload = Prisma.WorkItemGetPayload<{
  select: typeof workCompatibilityDetailSelect;
}>;

type WorkItemDetail = WorkItemDetailPayload;

type WorkDatabaseClient = Pick<Prisma.TransactionClient, 'workItem'>;

const completionReportSelect = {
  id: true,
  result: true,
  summary: true,
  cpcSerial: true,
  serviceNumber: true,
  customerId: true,
  rxLevelDbm: true,
  olt: true,
  fdcName: true,
  fapName: true,
  moreWorkRequired: true,
  reviewStatus: true,
  managerNote: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  submittedBy: {
    select: workAccountSummarySelect,
  },
  reviewedBy: {
    select: workAccountSummarySelect,
  },
} satisfies Prisma.WorkCompletionReportSelect;

const helpRequestSelect = {
  id: true,
  workItemId: true,
  reason: true,
  note: true,
  status: true,
  previousStatus: true,
  responseNote: true,
  respondedAt: true,
  createdAt: true,
  updatedAt: true,
  requestedBy: {
    select: workAccountSummarySelect,
  },
  requestedHelper: {
    select: workAccountSummarySelect,
  },
  respondedBy: {
    select: workAccountSummarySelect,
  },
  coordinatedBy: {
    select: workAccountSummarySelect,
  },
  coordinatedAt: true,
  workItem: {
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      dueAt: true,
    },
  },
} satisfies Prisma.WorkHelpRequestSelect;

@Injectable()
export class WorkLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workScopeService: WorkScopeService,
    private readonly statusTransitions: WorkStatusTransitionService,
    private readonly workNotifications: WorkNotificationsService,
    private readonly dutyAvailability: DutyAvailabilityService,
  ) {}

  async requestHelp(
    user: AuthenticatedUser,
    workItemId: string,
    dto: RequestWorkHelpDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const visible = await this.findVisibleCurrent(
      this.prisma,
      actor,
      workItemId,
    );
    const primary = this.getPrimaryAssignmentForActor(visible, actor.accountId);

    if (!primary?.startedAt) {
      throw new ForbiddenException(
        'Only the active primary assignee can request help after starting the work.',
      );
    }

    if (!visible.officeId || !visible.primaryOwnerOrgUnitId) {
      throw new ConflictException(
        'This work item must be reconciled to a V3 Office and OrgUnit before help can be requested.',
      );
    }

    const helper = dto.requestedHelperAccountId
      ? await this.workScopeService.resolveHelpCandidate(
          actor,
          dto.requestedHelperAccountId,
          visible.primaryOwnerOrgUnitId,
        )
      : null;

    if (helper) {
      await this.dutyAvailability.assertCanReceiveDirectHelp(
        helper.id,
        visible.primaryOwnerOrgUnitId,
      );
    }

    if (
      helper &&
      visible.assignments.some(
        (assignment) => assignment.assigneeAccountId === helper.id,
      )
    ) {
      throw new ConflictException(
        'The selected employee is already assigned to this work item.',
      );
    }

    const result = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleCurrent(
          transaction,
          actor,
          workItemId,
        );
        const currentPrimary = this.getRequiredPrimaryAssignment(
          current,
          actor.accountId,
        );

        if (!currentPrimary.startedAt) {
          throw new ForbiddenException(
            'Only the active primary assignee can request help after starting the work.',
          );
        }

        if (
          helper &&
          current.assignments.some(
            (assignment) => assignment.assigneeAccountId === helper.id,
          )
        ) {
          throw new ConflictException(
            'The selected employee is already assigned to this work item.',
          );
        }

        const duplicatePendingRequest =
          await transaction.workHelpRequest.findFirst({
            where: {
              workItemId: current.id,
              requestedByAccountId: actor.accountId,
              requestedHelperAccountId: helper?.id ?? null,
              status: WorkHelpRequestStatus.PENDING,
            },
            select: { id: true },
          });

        if (duplicatePendingRequest) {
          throw new ConflictException(
            helper
              ? 'A pending help request has already been sent to this employee.'
              : 'Management has already been notified that help is required.',
          );
        }

        const nextStatus = this.statusTransitions.getStatusAfterHelpRequest(
          current.status,
        );
        const note = this.normalizeOptionalText(dto.note);
        const helpRequest = await transaction.workHelpRequest.create({
          data: {
            workItemId: current.id,
            requestedByAccountId: actor.accountId,
            requestedHelperAccountId: helper?.id ?? null,
            reason: dto.reason,
            note,
            previousStatus: current.status,
          },
          select: helpRequestSelect,
        });

        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
          },
          data: {
            status: nextStatus,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);

        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.HELP_REQUESTED,
            fromStatus: current.status,
            toStatus: nextStatus,
            details: {
              helpRequestId: helpRequest.id,
              reason: dto.reason,
              requestedHelperAccountId: helper?.id ?? null,
              orgUnitId: current.primaryOwnerOrgUnitId,
              note,
            },
          },
        });

        return {
          helpRequest,
          workItem: await this.findDetail(transaction, current.id),
        };
      },
    );

    await this.notify(result.workItem, actor.accountId, 'HELP_REQUESTED', {
      title: 'Help requested for work',
      body: `${result.workItem.ticketNumber}: ${result.workItem.title}`,
      extraRecipients: helper ? [helper.id] : [],
      metadata: {
        helpRequestId: result.helpRequest.id,
        orgUnitId: visible.primaryOwnerOrgUnitId,
      },
    });

    return {
      message: helper
        ? 'Help request sent successfully.'
        : 'Your responsible manager has been notified that help is required.',
      ...result,
    };
  }

  async respondToHelpRequest(
    user: AuthenticatedUser,
    helpRequestId: string,
    dto: RespondWorkHelpDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);

    if (dto.accept) {
      const pendingRequest = await this.prisma.workHelpRequest.findUnique({
        where: { id: helpRequestId },
        select: {
          status: true,
          requestedHelperAccountId: true,
          workItem: { select: { primaryOwnerOrgUnitId: true } },
        },
      });

      if (
        pendingRequest?.status === WorkHelpRequestStatus.PENDING &&
        pendingRequest.requestedHelperAccountId === actor.accountId
      ) {
        const orgUnitId = pendingRequest.workItem.primaryOwnerOrgUnitId;
        if (!orgUnitId) {
          throw new ConflictException(
            'This work item must be reconciled to a V3 OrgUnit before direct help can be accepted.',
          );
        }
        await this.dutyAvailability.assertCanReceiveDirectHelp(
          actor.accountId,
          orgUnitId,
        );
      }
    }

    const result = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const request = await transaction.workHelpRequest.findUnique({
          where: { id: helpRequestId },
          select: {
            id: true,
            status: true,
            workItemId: true,
            requestedByAccountId: true,
            requestedHelperAccountId: true,
            workItem: {
              select: lifecycleCurrentSelect,
            },
          },
        });

        if (!request) {
          throw new NotFoundException('Help request was not found.');
        }

        if (request.requestedHelperAccountId !== actor.accountId) {
          throw new ForbiddenException(
            'Only the selected supporting employee can respond to this help request.',
          );
        }

        if (request.status !== WorkHelpRequestStatus.PENDING) {
          throw new ConflictException(
            'This help request has already been answered.',
          );
        }

        const current = request.workItem;
        this.statusTransitions.assertCanRespondToHelpRequest(current.status);
        const responseNote = this.normalizeOptionalText(dto.note);
        const respondedAt = new Date();

        if (!dto.accept) {
          await transaction.workHelpRequest.update({
            where: { id: request.id },
            data: {
              status: WorkHelpRequestStatus.DECLINED,
              respondedByAccountId: actor.accountId,
              responseNote,
              respondedAt,
            },
          });
          const update = await transaction.workItem.updateMany({
            where: {
              id: current.id,
              version: current.version,
            },
            data: { version: { increment: 1 } },
          });
          this.assertSingleUpdate(update.count);
          await transaction.workActivity.create({
            data: {
              workItemId: current.id,
              actorAccountId: actor.accountId,
              action: WorkActivityAction.HELP_DECLINED,
              fromStatus: current.status,
              toStatus: current.status,
              details: {
                helpRequestId: request.id,
                responseNote,
              },
            },
          });

          return {
            accepted: false,
            workItem: await this.findDetail(transaction, current.id),
          };
        }

        const nextStatus = this.statusTransitions.getStatusAfterHelpAccepted(
          current.status,
        );
        const alreadyAssigned = current.assignments.some(
          (assignment) => assignment.assigneeAccountId === actor.accountId,
        );

        if (!alreadyAssigned) {
          await transaction.workAssignment.create({
            data: {
              workItemId: current.id,
              assigneeAccountId: actor.accountId,
              assignmentRole: WorkAssignmentRole.SUPPORTING,
              assignedByAccountId: request.requestedByAccountId,
              acknowledgedAt: respondedAt,
            },
          });
        }

        await transaction.workHelpRequest.update({
          where: { id: request.id },
          data: {
            status: WorkHelpRequestStatus.ACCEPTED,
            respondedByAccountId: actor.accountId,
            responseNote,
            respondedAt,
          },
        });
        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
          },
          data: {
            status: nextStatus,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);

        await transaction.workActivity.createMany({
          data: [
            {
              workItemId: current.id,
              actorAccountId: actor.accountId,
              action: WorkActivityAction.HELP_ACCEPTED,
              fromStatus: current.status,
              toStatus: nextStatus,
              details: {
                helpRequestId: request.id,
                responseNote,
              },
            },
            ...(!alreadyAssigned
              ? [
                  {
                    workItemId: current.id,
                    actorAccountId: actor.accountId,
                    action: WorkActivityAction.SUPPORT_ADDED,
                    fromStatus: current.status,
                    toStatus: nextStatus,
                    details: {
                      assigneeAccountId: actor.accountId,
                      source: 'HELP_REQUEST',
                    },
                  } satisfies Prisma.WorkActivityCreateManyInput,
                ]
              : []),
          ],
        });

        return {
          accepted: true,
          workItem: await this.findDetail(transaction, current.id),
        };
      },
    );

    await this.notify(
      result.workItem,
      actor.accountId,
      result.accepted ? 'HELP_ACCEPTED' : 'HELP_DECLINED',
      {
        title: result.accepted
          ? 'Help request accepted'
          : 'Help request declined',
        body: `${result.workItem.ticketNumber}: ${result.workItem.title}`,
        metadata: { helpRequestId },
      },
    );

    return {
      message: result.accepted
        ? 'You have been added as a supporting employee.'
        : 'Help request declined.',
      workItem: result.workItem,
    };
  }

  coordinateHelpRequest(
    user: AuthenticatedUser,
    helpRequestId: string,
    dto: CoordinateWorkHelpDto,
  ): Promise<never> {
    void user;
    void helpRequestId;
    void dto;
    return Promise.reject(
      new ConflictException(
        'The legacy cross-department coordination flow is retired. Use V3 OrgUnit collaboration instead.',
      ),
    );
  }

  async listCompletionReports(user: AuthenticatedUser, workItemId: string) {
    const actor = await this.workScopeService.resolveActorContext(user);
    await this.findVisibleCurrent(this.prisma, actor, workItemId, true);
    const reports = await this.prisma.workCompletionReport.findMany({
      where: { workItemId },
      orderBy: { createdAt: 'desc' },
      select: completionReportSelect,
    });
    return { data: reports };
  }

  async listHelpRequests(user: AuthenticatedUser, workItemId: string) {
    const actor = await this.workScopeService.resolveActorContext(user);
    await this.findVisibleCurrent(this.prisma, actor, workItemId, true);
    const requests = await this.prisma.workHelpRequest.findMany({
      where: { workItemId },
      orderBy: { createdAt: 'desc' },
      select: helpRequestSelect,
    });
    return { data: requests };
  }

  async listPendingHelpRequests(user: AuthenticatedUser) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const hasScopedOversight =
      actor.accountClass === AccountClass.SUPER_ADMIN ||
      (actor.visibleOrgUnitIds?.length ?? 0) > 0 ||
      (actor.operationalTeamLeadIds?.length ?? 0) > 0;
    const where: Prisma.WorkHelpRequestWhereInput = hasScopedOversight
      ? {
          status: WorkHelpRequestStatus.PENDING,
          workItem: {
            is: this.workScopeService.buildVisibleWorkWhere(actor),
          },
        }
      : {
          requestedHelperAccountId: actor.accountId,
          status: WorkHelpRequestStatus.PENDING,
        };
    const requests = await this.prisma.workHelpRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: helpRequestSelect,
    });
    return { data: requests };
  }

  private async findVisibleCurrent(
    client: WorkDatabaseClient,
    actor: WorkActorContext,
    workItemId: string,
    allowArchived = false,
  ): Promise<LifecycleCurrentWorkItem> {
    const current = await client.workItem.findFirst({
      where: {
        AND: [
          { id: workItemId },
          this.workScopeService.buildVisibleWorkWhere(actor),
        ],
      },
      select: lifecycleCurrentSelect,
    });

    if (!current) {
      throw new NotFoundException('Work item was not found.');
    }

    if (
      !allowArchived &&
      current.archiveEligibleAt &&
      current.archiveEligibleAt.getTime() <= Date.now()
    ) {
      throw new ConflictException(
        'Archived work is read-only and cannot be changed.',
      );
    }

    return current;
  }

  private async findDetail(
    client: WorkDatabaseClient,
    workItemId: string,
  ): Promise<WorkItemDetail> {
    const workItem = await client.workItem.findUniqueOrThrow({
      where: { id: workItemId },
      select: workCompatibilityDetailSelect,
    });

    return workItem;
  }

  private getRequiredPrimaryAssignment(
    current: LifecycleCurrentWorkItem,
    accountId: string,
  ) {
    const assignment = this.getPrimaryAssignmentForActor(current, accountId);

    if (!assignment) {
      throw new ForbiddenException(
        'Only the active primary assignee can perform this action.',
      );
    }

    return assignment;
  }

  private getPrimaryAssignmentForActor(
    current: LifecycleCurrentWorkItem,
    accountId: string,
  ) {
    return current.assignments.find(
      (assignment) =>
        assignment.assignmentRole === WorkAssignmentRole.PRIMARY &&
        assignment.assigneeAccountId === accountId,
    );
  }

  private getActivePrimaryAssignment(current: LifecycleCurrentWorkItem) {
    const assignment = current.assignments.find(
      (candidate) => candidate.assignmentRole === WorkAssignmentRole.PRIMARY,
    );

    if (!assignment) {
      throw new ConflictException(
        'The work item does not have an active primary assignee.',
      );
    }

    return assignment;
  }

  private async notify(
    workItem: WorkItemDetail,
    actorAccountId: string,
    action: Parameters<
      WorkNotificationsService['publishWorkUpdate']
    >[0]['action'],
    input: {
      title: string;
      body: string;
      extraRecipients?: string[];
      notificationRecipients?: string[];
      metadata?: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    // Sales responsibility is a visibility/notification relationship, not a technical assignment.
    // Include it explicitly so customer-side owners stay informed without gaining completion authority.
    const recipients = [
      workItem.createdBy.id,
      ...workItem.assignments.map((assignment) => assignment.assignee.id),
      ...(workItem.salesMember ? [workItem.salesMember.id] : []),
      ...(input.extraRecipients ?? []),
      actorAccountId,
    ];
    await this.workNotifications.publishWorkUpdate({
      workItem,
      action,
      actorAccountId,
      recipientAccountIds: recipients,
      notificationRecipientAccountIds: input.notificationRecipients,
      title: input.title,
      body: input.body,
      metadata: input.metadata,
    });
  }

  private assertSingleUpdate(count: number): void {
    if (count !== 1) {
      throw new ConflictException(
        'This work item changed while the action was being processed. Refresh and try again.',
      );
    }
  }

  private normalizeOptionalText(value: string | undefined): string | null {
    const normalized = value?.trim().replace(/\s+/g, ' ');
    return normalized || null;
  }
}
