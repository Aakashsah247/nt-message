import {
  BadRequestException,
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
  WorkAssignmentRole,
  WorkCompletionReviewStatus,
  WorkHelpRequestStatus,
  WorkItemStatus,
  WorkItemType,
  WorkSalesCoordinationStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CancelWorkItemDto } from './dto/cancel-work-item.dto';
import { CoordinateWorkHelpDto } from './dto/coordinate-work-help.dto';
import { ManageWorkSupportDto } from './dto/manage-work-support.dto';
import { ReassignWorkDto } from './dto/reassign-work.dto';
import { RequestWorkHelpDto } from './dto/request-work-help.dto';
import { RespondWorkHelpDto } from './dto/respond-work-help.dto';
import { ReviewWorkCompletionDto } from './dto/review-work-completion.dto';
import { SendWorkToSalesDto } from './dto/send-work-to-sales.dto';
import { CompleteSalesWorkDto } from './dto/complete-sales-work.dto';
import { SubmitWorkCompletionDto } from './dto/submit-work-completion.dto';
import { UpdateWorkItemDto } from './dto/update-work-item.dto';
import {
  workAccountSummarySelect,
  workItemDetailSelect,
} from './work-items.service';
import { DutyAvailabilityService } from './duty-availability.service';
import { WorkNotificationsService } from './work-notifications.service';
import { WorkScopeService, type WorkActorContext } from './work-scope.service';
import { WorkStatusTransitionService } from './work-status-transition.service';

const lifecycleCurrentSelect = {
  id: true,
  ticketNumber: true,
  title: true,
  type: true,
  status: true,
  requestNumber: true,
  cpcSerial: true,
  serviceNumber: true,
  olt: true,
  fdcName: true,
  fapName: true,
  version: true,
  divisionId: true,
  departmentId: true,
  assignedTeamId: true,
  salesMemberAccountId: true,
  salesCoordinationStatus: true,
  salesDocumentsSentAt: true,
  salesCompletedAt: true,
  salesCompletionNote: true,
  registeredAt: true,
  plannedStartAt: true,
  dueAt: true,
  locationText: true,
  completedAt: true,
  closedAt: true,
  cancelledAt: true,
  archiveEligibleAt: true,
  deletionEligibleAt: true,
  createdByAccountId: true,
  responsibleManagerAccountId: true,
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

type LifecycleCurrentWorkItem = Prisma.WorkItemGetPayload<{
  select: typeof lifecycleCurrentSelect;
}>;

type WorkItemDetail = Prisma.WorkItemGetPayload<{
  select: typeof workItemDetailSelect;
}>;

type WorkDatabaseClient = Pick<Prisma.TransactionClient, 'workItem'>;

const customerIdRequiredCompletionTypes = new Set<WorkItemType>([
  WorkItemType.NEW_CONNECTION,
  WorkItemType.UPDATE_SERVICES,
  WorkItemType.TROUBLE_TICKET,
  WorkItemType.EMERGENCY_WORK,
]);

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
  requestedDepartment: {
    select: { id: true, divisionId: true, code: true, name: true },
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
      responsibleManagerAccountId: true,
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

  async update(
    user: AuthenticatedUser,
    workItemId: string,
    dto: UpdateWorkItemDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.workScopeService.assertCanManageWork(actor);

    if (
      dto.registeredAt === undefined &&
      dto.plannedStartAt === undefined &&
      dto.dueAt === undefined &&
      dto.locationText === undefined
    ) {
      throw new BadRequestException(
        'At least one work item change is required.',
      );
    }

    const updated = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleCurrent(
          transaction,
          actor,
          workItemId,
        );
        this.assertCanManageCurrentWork(actor, current);
        this.statusTransitions.assertCanUpdateDetails(current.status);

        const isAdministrativeWork =
          current.type === WorkItemType.ADMINISTRATIVE_TASK;
        const registeredAt =
          isAdministrativeWork || dto.registeredAt === undefined
            ? current.registeredAt
            : this.parseDate(dto.registeredAt, 'Registered date and time');
        const plannedStartAt =
          dto.plannedStartAt === undefined
            ? current.plannedStartAt
            : this.parseDate(dto.plannedStartAt, 'Planned start time');
        const dueAt =
          dto.dueAt === undefined
            ? current.dueAt
            : this.parseDate(dto.dueAt, 'Due time');

        if (
          !isAdministrativeWork &&
          registeredAt.getTime() > Date.now()
        ) {
          throw new BadRequestException(
            'Registered date and time cannot be in the future.',
          );
        }

        if (dto.dueAt !== undefined && dueAt.getTime() <= Date.now()) {
          throw new BadRequestException('Due time must be in the future.');
        }

        if (!plannedStartAt) {
          throw new BadRequestException('Planned start time is required.');
        }

        if (
          !isAdministrativeWork &&
          plannedStartAt.getTime() < registeredAt.getTime()
        ) {
          throw new BadRequestException(
            'Planned start time cannot be earlier than the registered date and time.',
          );
        }

        if (dueAt.getTime() <= plannedStartAt.getTime()) {
          throw new BadRequestException(
            'Due time must be later than the planned start time.',
          );
        }

        const latestDelegatedDueAt = current.childWorkItems[0]?.dueAt;
        if (latestDelegatedDueAt && dueAt.getTime() < latestDelegatedDueAt.getTime()) {
          throw new ConflictException(
            'The parent task due time cannot be earlier than unfinished delegated work.',
          );
        }

        const normalizedLocation =
          dto.locationText === undefined
            ? current.locationText
            : this.normalizeOptionalText(dto.locationText);
        const dueDateChanged = dueAt.getTime() !== current.dueAt.getTime();
        const registrationChanged =
          registeredAt.getTime() !== current.registeredAt.getTime();
        const detailsChanged =
          registrationChanged ||
          plannedStartAt.getTime() !== current.plannedStartAt?.getTime() ||
          normalizedLocation !== current.locationText;

        if (!dueDateChanged && !detailsChanged) {
          return {
            changed: false,
            workItem: await this.findDetail(transaction, current.id),
          };
        }

        // Recheck the current version inside the transaction so stale manager screens fail safely.
        const result = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
          },
          data: {
            registeredAt,
            plannedStartAt,
            dueAt,
            locationText: normalizedLocation,
            dueSoonNotifiedAt: dueDateChanged ? null : undefined,
            overdueNotifiedAt: dueDateChanged ? null : undefined,
            version: {
              increment: 1,
            },
          },
        });
        this.assertSingleUpdate(result.count);

        const activityRows: Prisma.WorkActivityCreateManyInput[] = [];

        if (dueDateChanged) {
          activityRows.push({
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.DUE_DATE_CHANGED,
            fromStatus: current.status,
            toStatus: current.status,
            details: {
              previousDueAt: current.dueAt.toISOString(),
              dueAt: dueAt.toISOString(),
            },
          });
        }

        if (detailsChanged) {
          activityRows.push({
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.DETAILS_UPDATED,
            fromStatus: current.status,
            toStatus: current.status,
            details: {
              ...(isAdministrativeWork
                ? {}
                : {
                    previousRegisteredAt: registrationChanged
                      ? current.registeredAt.toISOString()
                      : undefined,
                    registeredAt: registeredAt.toISOString(),
                  }),
              plannedStartAt: plannedStartAt.toISOString(),
              locationText: normalizedLocation,
            },
          });
        }

        if (activityRows.length > 0) {
          await transaction.workActivity.createMany({ data: activityRows });
        }
        return {
          changed: true,
          workItem: await this.findDetail(transaction, current.id),
        };
      },
    );

    if (updated.changed) {
      await this.notify(updated.workItem, actor.accountId, 'DETAILS_UPDATED', {
        title: 'Work details updated',
        body: `${updated.workItem.ticketNumber}: ${updated.workItem.title}`,
      });
    }

    return {
      message: updated.changed
        ? 'Work item updated successfully.'
        : 'No work item changes were required.',
      workItem: updated.workItem,
    };
  }

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

    if (dto.requestedHelperAccountId && dto.requestedDepartmentId) {
      throw new BadRequestException(
        'Select either a specific helper or another department, not both.',
      );
    }

    // Direct employee help requires a department boundary; division-level work must be coordinated first.
    if (dto.requestedHelperAccountId && !visible.departmentId) {
      throw new BadRequestException(
        'Division-level management work must request coordinated help through a department.',
      );
    }

    const helper =
      dto.requestedHelperAccountId && visible.departmentId
        ? await this.workScopeService.resolveHelpCandidate(
            actor,
            dto.requestedHelperAccountId,
            visible.departmentId,
          )
        : null;

    if (helper && visible.departmentId) {
      // Direct requests are limited to coworkers who are currently on duty and available.
      await this.dutyAvailability.assertCanReceiveDirectHelp(
        helper.id,
        visible.departmentId,
      );
    }

    let requestedDepartment: { id: string; divisionId: string } | null = null;

    if (dto.requestedDepartmentId) {
      requestedDepartment = await this.prisma.department.findFirst({
        where: {
          id: dto.requestedDepartmentId,
          divisionId: visible.divisionId,
          isActive: true,
          // Division-level management work has no home department to exclude.
          ...(visible.departmentId
            ? { NOT: { id: visible.departmentId } }
            : {}),
        },
        select: { id: true, divisionId: true },
      });

      if (!requestedDepartment) {
        throw new ForbiddenException(
          'Cross-department help can be requested only from another active department in the same division.',
        );
      }
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

        // The primary employee must still own and have started the ticket when the transaction runs.
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
            requestedDepartmentId: requestedDepartment?.id ?? null,
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
              requestedDepartmentId: requestedDepartment?.id ?? null,
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

    const coordinationRecipients = requestedDepartment
      ? await this.dutyAvailability.getCoordinationRecipients(
          requestedDepartment.divisionId,
        )
      : [];

    await this.notify(result.workItem, actor.accountId, 'HELP_REQUESTED', {
      title: requestedDepartment
        ? 'Cross-department help requested'
        : 'Help requested for work',
      body: `${result.workItem.ticketNumber}: ${result.workItem.title}`,
      extraRecipients: helper ? [helper.id] : coordinationRecipients,
      metadata: {
        helpRequestId: result.helpRequest.id,
        requestedDepartmentId: requestedDepartment?.id ?? null,
      },
    });

    return {
      message: helper
        ? 'Help request sent successfully.'
        : requestedDepartment
          ? 'The cross-department help request has been sent to management.'
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
          workItem: { select: { departmentId: true } },
        },
      });

      if (
        pendingRequest?.status === WorkHelpRequestStatus.PENDING &&
        pendingRequest.requestedHelperAccountId === actor.accountId
      ) {
        // Recheck duty and availability at acceptance time because conditions may change after the request was sent.
        // Revalidate the department boundary at acceptance because ticket scope may have changed.
        if (!pendingRequest.workItem.departmentId) {
          throw new BadRequestException(
            'Division-level management work cannot accept a direct employee helper request.',
          );
        }
        await this.dutyAvailability.assertCanReceiveDirectHelp(
          actor.accountId,
          pendingRequest.workItem.departmentId,
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

  async coordinateHelpRequest(
    user: AuthenticatedUser,
    helpRequestId: string,
    dto: CoordinateWorkHelpDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.workScopeService.assertCanManageWork(actor);
    const requestPreview = await this.prisma.workHelpRequest.findUnique({
      where: { id: helpRequestId },
      select: {
        id: true,
        status: true,
        requestedDepartmentId: true,
        workItemId: true,
        workItem: {
          select: { divisionId: true, departmentId: true },
        },
      },
    });

    if (!requestPreview) {
      throw new NotFoundException('Help request was not found.');
    }

    if (requestPreview.status !== WorkHelpRequestStatus.PENDING) {
      throw new ConflictException(
        'This help request has already been resolved.',
      );
    }

    if (!requestPreview.requestedDepartmentId) {
      throw new BadRequestException(
        'Only a cross-department help request requires management coordination.',
      );
    }

    // Loading the ticket through the normal visibility rule prevents cross-scope coordination.
    await this.findVisibleCurrent(
      this.prisma,
      actor,
      requestPreview.workItemId,
    );
    const [helper] = await this.workScopeService.resolveAssignableAccounts(
      actor,
      [dto.helperAccountId],
    );

    if (
      helper.employee?.departmentId !== requestPreview.requestedDepartmentId
    ) {
      throw new ForbiddenException(
        'The selected helper does not belong to the requested department.',
      );
    }

    await this.dutyAvailability.assertCanReceiveDirectHelp(
      helper.id,
      requestPreview.requestedDepartmentId,
    );

    const result = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const request = await transaction.workHelpRequest.findUnique({
          where: { id: helpRequestId },
          select: {
            id: true,
            status: true,
            requestedByAccountId: true,
            requestedDepartmentId: true,
            workItem: { select: lifecycleCurrentSelect },
          },
        });

        if (!request) {
          throw new NotFoundException('Help request was not found.');
        }

        if (request.status !== WorkHelpRequestStatus.PENDING) {
          throw new ConflictException(
            'This help request has already been resolved.',
          );
        }

        if (request.requestedDepartmentId !== helper.employee?.departmentId) {
          throw new ForbiddenException(
            'The selected helper does not belong to the requested department.',
          );
        }

        const current = request.workItem;
        this.statusTransitions.assertCanRespondToHelpRequest(current.status);
        const alreadyAssigned = current.assignments.some(
          (assignment) => assignment.assigneeAccountId === helper.id,
        );

        if (alreadyAssigned) {
          throw new ConflictException(
            'The selected employee is already assigned to this work item.',
          );
        }

        const now = new Date();
        const nextStatus = this.statusTransitions.getStatusAfterHelpAccepted(
          current.status,
        );
        await transaction.workAssignment.create({
          data: {
            workItemId: current.id,
            assigneeAccountId: helper.id,
            assignmentRole: WorkAssignmentRole.SUPPORTING,
            assignedByAccountId: actor.accountId,
            acknowledgedAt: now,
          },
        });
        await transaction.workHelpRequest.update({
          where: { id: request.id },
          data: {
            status: WorkHelpRequestStatus.ACCEPTED,
            requestedHelperAccountId: helper.id,
            respondedByAccountId: helper.id,
            responseNote: this.normalizeOptionalText(dto.note),
            respondedAt: now,
            coordinatedByAccountId: actor.accountId,
            coordinatedAt: now,
          },
        });
        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
          },
          data: { status: nextStatus, version: { increment: 1 } },
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
                helperAccountId: helper.id,
                source: 'MANAGEMENT_COORDINATION',
              },
            },
            {
              workItemId: current.id,
              actorAccountId: actor.accountId,
              action: WorkActivityAction.SUPPORT_ADDED,
              fromStatus: current.status,
              toStatus: nextStatus,
              details: {
                assigneeAccountId: helper.id,
                source: 'MANAGEMENT_COORDINATION',
              },
            },
          ],
        });

        return this.findDetail(transaction, current.id);
      },
    );

    await this.notify(result, actor.accountId, 'HELP_ACCEPTED', {
      title: 'Cross-department help assigned',
      body: `${result.ticketNumber}: ${result.title}`,
      extraRecipients: [helper.id],
      metadata: { helpRequestId, coordinated: true },
    });

    return {
      message: 'Supporting employee coordinated successfully.',
      workItem: result,
    };
  }

  async sendToSales(
    user: AuthenticatedUser,
    workItemId: string,
    dto: SendWorkToSalesDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const result = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleCurrent(
          transaction,
          actor,
          workItemId,
        );
        const primary = this.getRequiredPrimaryAssignment(
          current,
          actor.accountId,
        );

        if (!primary.startedAt) {
          throw new BadRequestException(
            'Start this work before sending it to Sales.',
          );
        }
        if (!current.salesMemberAccountId) {
          throw new BadRequestException(
            'This work does not have a Sales Member.',
          );
        }
        if (
          current.salesCoordinationStatus !==
          WorkSalesCoordinationStatus.WAITING_FOR_DOCUMENTS
        ) {
          throw new ConflictException(
            current.salesCoordinationStatus ===
              WorkSalesCoordinationStatus.COMPLETED
              ? 'Sales work is already completed.'
              : 'This work was already sent to Sales.',
          );
        }
        if (
          current.status !== WorkItemStatus.IN_PROGRESS &&
          current.status !== WorkItemStatus.HELP_REQUESTED &&
          current.status !== WorkItemStatus.REOPENED
        ) {
          throw new ConflictException(
            'This work cannot be sent to Sales in its current state.',
          );
        }

        const sentAt = new Date();
        const note = this.normalizeOptionalText(dto.note);
        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
            salesCoordinationStatus:
              WorkSalesCoordinationStatus.WAITING_FOR_DOCUMENTS,
          },
          data: {
            salesCoordinationStatus:
              WorkSalesCoordinationStatus.READY_FOR_SALES,
            salesDocumentsSentAt: sentAt,
            salesCompletedAt: null,
            salesCompletionNote: null,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);

        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.SALES_DOCUMENTS_SENT,
            fromStatus: current.status,
            toStatus: current.status,
            details: {
              salesMemberAccountId: current.salesMemberAccountId,
              note,
              sentAt: sentAt.toISOString(),
            },
          },
        });

        return this.findDetail(transaction, current.id);
      },
    );

    await this.notify(result, actor.accountId, 'SALES_DOCUMENTS_SENT', {
      title: 'Work ready for Sales',
      body: `${result.ticketNumber}: ${result.title}`,
      notificationRecipients: result.salesMember ? [result.salesMember.id] : [],
      metadata: { salesCoordinationStatus: 'READY_FOR_SALES' },
    });

    return { message: 'Sent to Sales.', workItem: result };
  }

  async completeSalesWork(
    user: AuthenticatedUser,
    workItemId: string,
    dto: CompleteSalesWorkDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const result = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleCurrent(
          transaction,
          actor,
          workItemId,
        );

        if (current.salesMemberAccountId !== actor.accountId) {
          throw new ForbiddenException(
            'Only the assigned Sales Member can finish the Sales work.',
          );
        }
        if (
          current.salesCoordinationStatus !==
          WorkSalesCoordinationStatus.READY_FOR_SALES
        ) {
          throw new ConflictException(
            current.salesCoordinationStatus ===
              WorkSalesCoordinationStatus.COMPLETED
              ? 'Sales work is already completed.'
              : 'Wait until the primary team sends the work to Sales.',
          );
        }
        if (
          current.status === WorkItemStatus.CLOSED ||
          current.status === WorkItemStatus.CANCELLED
        ) {
          throw new ConflictException(
            'Sales work cannot be changed after the work is closed.',
          );
        }

        const completedAt = new Date();
        const note = this.normalizeOptionalText(dto.note);
        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
            salesCoordinationStatus:
              WorkSalesCoordinationStatus.READY_FOR_SALES,
          },
          data: {
            salesCoordinationStatus: WorkSalesCoordinationStatus.COMPLETED,
            salesCompletedAt: completedAt,
            salesCompletionNote: note,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);

        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.SALES_WORK_COMPLETED,
            fromStatus: current.status,
            toStatus: current.status,
            details: {
              note,
              completedAt: completedAt.toISOString(),
            },
          },
        });

        return this.findDetail(transaction, current.id);
      },
    );

    const primaryRecipients = result.assignments
      .filter(
        (assignment) => assignment.assignmentRole === WorkAssignmentRole.PRIMARY,
      )
      .map((assignment) => assignment.assignee.id);
    await this.notify(result, actor.accountId, 'SALES_WORK_COMPLETED', {
      title: 'Sales work completed',
      body: `${result.ticketNumber}: You can continue the work.`,
      notificationRecipients: [
        ...primaryRecipients,
        result.responsibleManager.id,
      ],
      metadata: { salesCoordinationStatus: 'COMPLETED' },
    });

    return { message: 'Sales work completed.', workItem: result };
  }

  async submitCompletion(
    user: AuthenticatedUser,
    workItemId: string,
    dto: SubmitWorkCompletionDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const result = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleCurrent(
          transaction,
          actor,
          workItemId,
        );
        const primary = this.getRequiredPrimaryAssignment(
          current,
          actor.accountId,
        );

        if (!primary.startedAt) {
          throw new BadRequestException(
            'Start this work item before submitting a completion report.',
          );
        }

        if (current.childWorkItems.length > 0) {
          throw new ConflictException(
            'Delegated work is still unfinished. Complete or cancel it before submitting this task.',
          );
        }

        if (
          current.salesMemberAccountId &&
          current.salesCoordinationStatus !== WorkSalesCoordinationStatus.COMPLETED
        ) {
          throw new ConflictException(
            'Sales work is not finished yet. Wait for Sales before submitting this work.',
          );
        }

        const latestReport = current.completionReports[0];
        const isInformationResponse =
          current.status === WorkItemStatus.COMPLETED_PENDING_REVIEW &&
          latestReport?.reviewStatus ===
            WorkCompletionReviewStatus.INFORMATION_REQUESTED;

        if (!isInformationResponse) {
          this.statusTransitions.assertCanSubmitCompletion(current.status);
        }

        // Completion is submitted by the active primary assignee; supporting staff remain collaborators.
        const summary = this.normalizeRequiredText(dto.summary, 'Summary');

        // WM-V2 unified completion: every operational work type submits the
        // field RX reading and receives a snapshot of the saved network facts.
        // Customer ID is required only where the business process uses it, is
        // optional for Network Maintenance, and is intentionally absent from
        // Routine Work, Inspection and Administrative Work.
        const usesOperationalCompletionPackage =
          current.type !== WorkItemType.ADMINISTRATIVE_TASK;
        const requiresCustomerId =
          customerIdRequiredCompletionTypes.has(current.type);
        const allowsOptionalCustomerId =
          current.type === WorkItemType.MAINTENANCE;
        let customerId: string | null = null;
        let rxLevelDbm: number | null = null;

        const previousCustomerId = isInformationResponse
          ? latestReport?.customerId ?? undefined
          : undefined;
        const suppliedCustomerId = dto.customerId ?? previousCustomerId;

        if (requiresCustomerId) {
          customerId = this.normalizeRequiredText(
            suppliedCustomerId,
            'Customer ID',
          );
        } else if (allowsOptionalCustomerId) {
          customerId = this.normalizeOptionalText(suppliedCustomerId);
        }

        if (usesOperationalCompletionPackage) {
          const suppliedRxLevel =
            dto.rxLevelDbm ??
            (isInformationResponse ? latestReport?.rxLevelDbm : null);
          if (suppliedRxLevel === null || suppliedRxLevel === undefined) {
            throw new BadRequestException('RX Level is required.');
          }
          rxLevelDbm = suppliedRxLevel;
        }

        // Closing/reference display prefers Token Number and falls back to
        // Service Number. Some work types (for example Network Maintenance)
        // legitimately have neither, so absence does not block completion.
        const completionReference = current.requestNumber
          ? { type: 'TOKEN_NUMBER', value: current.requestNumber }
          : current.type !== WorkItemType.NEW_CONNECTION && current.serviceNumber
            ? { type: 'SERVICE_NUMBER', value: current.serviceNumber }
            : null;

        const report = await transaction.workCompletionReport.create({
          data: {
            workItemId: current.id,
            submittedByAccountId: actor.accountId,
            result: dto.result,
            summary,
            cpcSerial:
              current.type === WorkItemType.NEW_CONNECTION
                ? current.cpcSerial
                : null,
            serviceNumber:
              usesOperationalCompletionPackage &&
              current.type !== WorkItemType.NEW_CONNECTION
                ? current.serviceNumber
                : null,
            customerId,
            rxLevelDbm,
            olt: usesOperationalCompletionPackage ? current.olt : null,
            fdcName: usesOperationalCompletionPackage ? current.fdcName : null,
            fapName: usesOperationalCompletionPackage ? current.fapName : null,
            moreWorkRequired: dto.moreWorkRequired,
          },
          select: completionReportSelect,
        });
        const completedAt = new Date();
        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
          },
          data: {
            status: WorkItemStatus.COMPLETED_PENDING_REVIEW,
            completedAt,
            closedAt: null,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);

        // Pending help requests are no longer actionable once the work enters manager review.
        await transaction.workHelpRequest.updateMany({
          where: {
            workItemId: current.id,
            status: WorkHelpRequestStatus.PENDING,
          },
          data: {
            status: WorkHelpRequestStatus.CANCELLED,
            responseNote: 'Completion was submitted for manager review.',
            respondedByAccountId: actor.accountId,
            respondedAt: completedAt,
          },
        });

        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.COMPLETION_SUBMITTED,
            fromStatus: current.status,
            toStatus: WorkItemStatus.COMPLETED_PENDING_REVIEW,
            details: {
              completionReportId: report.id,
              result: dto.result,
              moreWorkRequired: dto.moreWorkRequired,
              informationResponse: isInformationResponse,
              structuredCompletionIncluded: usesOperationalCompletionPackage,
              completionReferenceType: completionReference?.type ?? null,
              completionReference: completionReference?.value ?? null,
            },
          },
        });

        return {
          report,
          workItem: await this.findDetail(transaction, current.id),
        };
      },
    );

    await this.notify(
      result.workItem,
      actor.accountId,
      'COMPLETION_SUBMITTED',
      {
        title: 'Work submitted for review',
        body: `${result.workItem.ticketNumber}: ${result.workItem.title}`,
        metadata: { completionReportId: result.report.id },
      },
    );

    return {
      message: 'Completion report submitted for manager review.',
      ...result,
    };
  }

  async requestMoreInformation(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ReviewWorkCompletionDto,
  ) {
    return this.reviewCompletion(
      user,
      workItemId,
      dto,
      'INFORMATION_REQUESTED',
    );
  }

  async close(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ReviewWorkCompletionDto,
  ) {
    return this.reviewCompletion(user, workItemId, dto, 'CLOSED');
  }

  async reopen(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ReviewWorkCompletionDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const workItem = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleCurrent(
          transaction,
          actor,
          workItemId,
        );
        this.workScopeService.assertCanReviewWork(
          actor,
          current.responsibleManagerAccountId,
        );
        this.statusTransitions.assertCanReopen(current.status);
        const note = this.normalizeRequiredText(dto.note, 'Review note');
        const latestReport = current.completionReports[0];

        // Reopening a closed ticket must not rewrite the historical accepted review.
        if (
          latestReport &&
          current.status === WorkItemStatus.COMPLETED_PENDING_REVIEW
        ) {
          await transaction.workCompletionReport.update({
            where: { id: latestReport.id },
            data: {
              reviewStatus: WorkCompletionReviewStatus.REJECTED,
              managerNote: note,
              reviewedByAccountId: actor.accountId,
              reviewedAt: new Date(),
            },
          });
        }

        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
          },
          data: {
            status: WorkItemStatus.REOPENED,
            completedAt: null,
            closedAt: null,
            cancelledAt: null,
            archiveEligibleAt: null,
            deletionEligibleAt: null,
            retentionHoldAt: null,
            retentionHoldReason: null,
            retentionHoldByAccountId: null,
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
            action: WorkActivityAction.REOPENED,
            fromStatus: current.status,
            toStatus: WorkItemStatus.REOPENED,
            details: { note, completionReportId: latestReport?.id ?? null },
          },
        });

        return this.findDetail(transaction, current.id);
      },
    );

    await this.notify(workItem, actor.accountId, 'REOPENED', {
      title: 'Work reopened',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
    });

    return { message: 'Work item reopened successfully.', workItem };
  }

  async cancel(
    user: AuthenticatedUser,
    workItemId: string,
    dto: CancelWorkItemDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.workScopeService.assertCanManageWork(actor);
    const workItem = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleCurrent(
          transaction,
          actor,
          workItemId,
        );
        this.assertCanManageCurrentWork(actor, current);
        if (current.childWorkItems.length > 0) {
          throw new ConflictException(
            'Cancel or complete the unfinished delegated work before cancelling this task.',
          );
        }
        this.statusTransitions.assertCanCancel(current.status);
        const reason = this.normalizeRequiredText(
          dto.reason,
          'Cancellation reason',
        );
        const cancelledAt = new Date();
        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
          },
          data: {
            status: WorkItemStatus.CANCELLED,
            completedAt: null,
            closedAt: null,
            cancelledAt,
            archiveEligibleAt: this.addYears(cancelledAt, 1),
            deletionEligibleAt: this.addYears(cancelledAt, 3),
            retentionHoldAt: null,
            retentionHoldReason: null,
            retentionHoldByAccountId: null,
            deletionRequestedAt: null,
            deletionRequestReason: null,
            deletionRequestedByAccountId: null,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);
        await transaction.workHelpRequest.updateMany({
          where: {
            workItemId: current.id,
            status: WorkHelpRequestStatus.PENDING,
          },
          data: {
            status: WorkHelpRequestStatus.CANCELLED,
            responseNote: 'Work item cancelled by management.',
            respondedByAccountId: actor.accountId,
            respondedAt: new Date(),
          },
        });
        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.CANCELLED,
            fromStatus: current.status,
            toStatus: WorkItemStatus.CANCELLED,
            details: { reason },
          },
        });
        return this.findDetail(transaction, current.id);
      },
    );

    await this.notify(workItem, actor.accountId, 'CANCELLED', {
      title: 'Work cancelled',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
    });

    return { message: 'Work item cancelled successfully.', workItem };
  }

  async reassignPrimary(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ReassignWorkDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.workScopeService.assertCanManageWork(actor);
    const visible = await this.findVisibleCurrent(
      this.prisma,
      actor,
      workItemId,
    );
    this.assertCanManageCurrentWork(actor, visible);
    if (visible.type !== WorkItemType.ADMINISTRATIVE_TASK) {
      throw new ConflictException(
        'Operational work stays Team-owned and cannot be transferred to one individual.',
      );
    }
    if (visible.assignedTeamId) {
      throw new ConflictException(
        'Team-owned Administrative Work stays on the shared Team ticket and cannot be transferred to one individual.',
      );
    }
    if (visible.childWorkItems.length > 0) {
      throw new ConflictException(
        'Complete or cancel the unfinished delegated work before reassigning this task.',
      );
    }
    const nextPrimary =
      await this.workScopeService.resolvePrimaryReassignmentAccount(
        actor,
        dto.primaryAssigneeAccountId,
        visible.divisionId,
        visible.departmentId,
      );
    this.workScopeService.assertAdministrativeIndividualAssignee(
      actor,
      nextPrimary,
    );
    const reason = this.normalizeRequiredText(
      dto.reason,
      'Reassignment reason',
    );
    const result = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleCurrent(
          transaction,
          actor,
          workItemId,
        );
        this.assertCanManageCurrentWork(actor, current);
        if (current.childWorkItems.length > 0) {
          throw new ConflictException(
            'Complete or cancel the unfinished delegated work before reassigning this task.',
          );
        }
        this.statusTransitions.assertCanChangeAssignment(current.status);
        const currentPrimary = this.getActivePrimaryAssignment(current);

        if (currentPrimary.assigneeAccountId === nextPrimary.id) {
          throw new ConflictException(
            'The selected employee is already the primary assignee.',
          );
        }

        if (
          current.assignments.some(
            (assignment) => assignment.assigneeAccountId === nextPrimary.id,
          )
        ) {
          throw new ConflictException(
            'Remove the employee from supporting work before making them primary.',
          );
        }

        const now = new Date();

        // End the previous assignment instead of deleting it so responsibility history is preserved.
        await transaction.workAssignment.update({
          where: { id: currentPrimary.id },
          data: { endedAt: now, endReason: reason },
        });
        await transaction.workAssignment.create({
          data: {
            workItemId: current.id,
            assigneeAccountId: nextPrimary.id,
            assignmentRole: WorkAssignmentRole.PRIMARY,
            assignedByAccountId: actor.accountId,
          },
        });
        await transaction.workHelpRequest.updateMany({
          where: {
            workItemId: current.id,
            status: WorkHelpRequestStatus.PENDING,
          },
          data: {
            status: WorkHelpRequestStatus.CANCELLED,
            responseNote: 'Primary responsibility was reassigned.',
            respondedByAccountId: actor.accountId,
            respondedAt: now,
          },
        });
        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
          },
          data: {
            status: WorkItemStatus.ASSIGNED,
            completedAt: null,
            closedAt: null,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);
        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.REASSIGNED,
            fromStatus: current.status,
            toStatus: WorkItemStatus.ASSIGNED,
            details: {
              previousPrimaryAccountId: currentPrimary.assigneeAccountId,
              primaryAssigneeAccountId: nextPrimary.id,
              reason,
            },
          },
        });

        return {
          previousPrimaryAccountId: currentPrimary.assigneeAccountId,
          workItem: await this.findDetail(transaction, current.id),
        };
      },
    );

    await this.notify(result.workItem, actor.accountId, 'REASSIGNED', {
      title: 'Work reassigned',
      body: `${result.workItem.ticketNumber}: ${result.workItem.title}`,
      extraRecipients: [result.previousPrimaryAccountId, nextPrimary.id],
    });

    return { message: 'Primary employee reassigned successfully.', ...result };
  }

  async addSupport(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ManageWorkSupportDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);

    // Verify ticket ownership before resolving another account to avoid cross-scope enumeration.
    const visible = await this.findVisibleCurrent(
      this.prisma,
      actor,
      workItemId,
    );
    this.assertCanManageCurrentWork(actor, visible);
    const support = await this.workScopeService.resolveSupportAccount(
      actor,
      dto.accountId,
      visible.divisionId,
    );
    const workItem = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleCurrent(
          transaction,
          actor,
          workItemId,
        );
        this.assertCanManageCurrentWork(actor, current);
        this.statusTransitions.assertCanChangeAssignment(current.status);

        if (
          current.assignments.some(
            (assignment) => assignment.assigneeAccountId === support.id,
          )
        ) {
          throw new ConflictException(
            'The selected employee is already assigned to this work item.',
          );
        }

        const nextStatus =
          current.status === WorkItemStatus.HELP_REQUESTED ||
          current.status === WorkItemStatus.BLOCKED
            ? WorkItemStatus.IN_PROGRESS
            : current.status;
        await transaction.workAssignment.create({
          data: {
            workItemId: current.id,
            assigneeAccountId: support.id,
            assignmentRole: WorkAssignmentRole.SUPPORTING,
            assignedByAccountId: actor.accountId,
          },
        });
        const pendingHelp = await transaction.workHelpRequest.findFirst({
          where: {
            workItemId: current.id,
            status: WorkHelpRequestStatus.PENDING,
            OR: [
              { requestedHelperAccountId: support.id },
              { requestedHelperAccountId: null },
            ],
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true },
        });

        if (pendingHelp) {
          await transaction.workHelpRequest.update({
            where: { id: pendingHelp.id },
            data: {
              status: WorkHelpRequestStatus.ACCEPTED,
              respondedByAccountId: actor.accountId,
              responseNote: 'Added by the responsible management workflow.',
              respondedAt: new Date(),
            },
          });
        }

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
            action: WorkActivityAction.SUPPORT_ADDED,
            fromStatus: current.status,
            toStatus: nextStatus,
            details: {
              assigneeAccountId: support.id,
              reason: this.normalizeOptionalText(dto.reason),
              helpRequestId: pendingHelp?.id ?? null,
            },
          },
        });
        return this.findDetail(transaction, current.id);
      },
    );

    await this.notify(workItem, actor.accountId, 'SUPPORT_ADDED', {
      title: 'Supporting employee added',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
      extraRecipients: [support.id],
    });

    return { message: 'Supporting employee added successfully.', workItem };
  }

  async removeSupport(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ManageWorkSupportDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.workScopeService.assertCanManageWork(actor);
    const workItem = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleCurrent(
          transaction,
          actor,
          workItemId,
        );
        this.assertCanManageCurrentWork(actor, current);
        this.statusTransitions.assertCanChangeAssignment(current.status);
        const assignment = current.assignments.find(
          (candidate) =>
            candidate.assigneeAccountId === dto.accountId &&
            candidate.assignmentRole === WorkAssignmentRole.SUPPORTING,
        );

        if (!assignment) {
          throw new NotFoundException(
            'The selected supporting assignment was not found.',
          );
        }

        const reason =
          this.normalizeOptionalText(dto.reason) ??
          'Removed by authorized management.';
        await transaction.workAssignment.update({
          where: { id: assignment.id },
          data: { endedAt: new Date(), endReason: reason },
        });
        const update = await transaction.workItem.updateMany({
          where: { id: current.id, version: current.version },
          data: { version: { increment: 1 } },
        });
        this.assertSingleUpdate(update.count);
        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.SUPPORT_REMOVED,
            fromStatus: current.status,
            toStatus: current.status,
            details: { assigneeAccountId: dto.accountId, reason },
          },
        });
        return this.findDetail(transaction, current.id);
      },
    );

    await this.notify(workItem, actor.accountId, 'SUPPORT_REMOVED', {
      title: 'Supporting employee removed',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
      extraRecipients: [dto.accountId],
    });

    return { message: 'Supporting employee removed successfully.', workItem };
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
    const where: Prisma.WorkHelpRequestWhereInput =
      actor.role === AccountRole.EMPLOYEE
        ? {
            requestedHelperAccountId: actor.accountId,
            status: WorkHelpRequestStatus.PENDING,
          }
        : {
            status: WorkHelpRequestStatus.PENDING,
            workItem: {
              is: this.workScopeService.buildVisibleWorkWhere(actor),
            },
          };
    const requests = await this.prisma.workHelpRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: helpRequestSelect,
    });
    return { data: requests };
  }

  private async reviewCompletion(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ReviewWorkCompletionDto,
    action: 'INFORMATION_REQUESTED' | 'CLOSED',
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const workItem = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleCurrent(
          transaction,
          actor,
          workItemId,
        );
        this.workScopeService.assertCanReviewWork(
          actor,
          current.responsibleManagerAccountId,
        );
        this.statusTransitions.assertCanReviewCompletion(current.status);
        const latestReport = current.completionReports[0];

        if (
          !latestReport ||
          latestReport.reviewStatus !==
            WorkCompletionReviewStatus.PENDING_REVIEW
        ) {
          throw new ConflictException(
            'No completion report is currently waiting for review.',
          );
        }

        const note = this.normalizeRequiredText(dto.note, 'Review note');
        const reviewedAt = new Date();
        const closing = action === 'CLOSED';

        // Sales is a blocking dependency for applicable work. Re-check it at
        // approval time so a stale or manually altered ticket cannot bypass the
        // same rule enforced when the employee submits completion.
        if (
          closing &&
          current.salesMemberAccountId &&
          current.salesCoordinationStatus !== WorkSalesCoordinationStatus.COMPLETED
        ) {
          throw new ConflictException(
            'Sales work is not finished yet. Wait for Sales before approving this work.',
          );
        }

        // Review decisions remain attached to the exact submitted report for auditability.
        await transaction.workCompletionReport.update({
          where: { id: latestReport.id },
          data: {
            reviewStatus: closing
              ? WorkCompletionReviewStatus.ACCEPTED
              : WorkCompletionReviewStatus.INFORMATION_REQUESTED,
            managerNote: note,
            reviewedByAccountId: actor.accountId,
            reviewedAt,
          },
        });
        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
          },
          data: {
            status: closing ? WorkItemStatus.CLOSED : current.status,
            closedAt: closing ? reviewedAt : null,
            cancelledAt: closing ? null : current.cancelledAt,
            archiveEligibleAt: closing
              ? this.addYears(reviewedAt, 1)
              : current.archiveEligibleAt,
            deletionEligibleAt: closing
              ? this.addYears(reviewedAt, 3)
              : current.deletionEligibleAt,
            retentionHoldAt: closing ? null : undefined,
            retentionHoldReason: closing ? null : undefined,
            retentionHoldByAccountId: closing ? null : undefined,
            deletionRequestedAt: closing ? null : undefined,
            deletionRequestReason: closing ? null : undefined,
            deletionRequestedByAccountId: closing ? null : undefined,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);
        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: closing
              ? WorkActivityAction.CLOSED
              : WorkActivityAction.INFORMATION_REQUESTED,
            fromStatus: current.status,
            toStatus: closing ? WorkItemStatus.CLOSED : current.status,
            details: { note, completionReportId: latestReport.id },
          },
        });
        return this.findDetail(transaction, current.id);
      },
    );

    await this.notify(
      workItem,
      actor.accountId,
      action === 'CLOSED' ? 'CLOSED' : 'INFORMATION_REQUESTED',
      {
        title:
          action === 'CLOSED'
            ? 'Work approved'
            : 'Work returned for correction',
        body: `${workItem.ticketNumber}: ${workItem.title}`,
      },
    );

    return {
      message:
        action === 'CLOSED'
          ? 'Work approved successfully.'
          : 'Work returned to the employee for correction.',
      workItem,
    };
  }

  private assertCanManageCurrentWork(
    actor: WorkActorContext,
    current: LifecycleCurrentWorkItem,
  ): void {
    this.workScopeService.assertCanManageWork(actor);

    const actorIsActiveAssignee = current.assignments.some(
      (assignment) => assignment.assigneeAccountId === actor.accountId,
    );

    if (actorIsActiveAssignee) {
      throw new ForbiddenException(
        'You cannot change or cancel a task assigned to you. Use My Work to complete it.',
      );
    }

    const ownsManagementAction =
      actor.role === AccountRole.SUPER_ADMIN ||
      current.createdByAccountId === actor.accountId ||
      current.responsibleManagerAccountId === actor.accountId;

    if (!ownsManagementAction) {
      throw new ForbiddenException(
        'Only the person who assigned this task or its reviewer can manage it.',
      );
    }
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
    return client.workItem.findUniqueOrThrow({
      where: { id: workItemId },
      select: workItemDetailSelect,
    });
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
      workItem.responsibleManager.id,
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

  private addYears(value: Date, years: number): Date {
    const result = new Date(value);
    result.setUTCFullYear(result.getUTCFullYear() + years);
    return result;
  }

  private parseDate(value: string, fieldName: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} is invalid.`);
    }

    return date;
  }

  private normalizeRequiredText(
    value: string | null | undefined,
    fieldName: string,
  ): string {
    const normalized = value?.trim().replace(/\s+/g, ' ') ?? '';

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    return normalized;
  }

  private normalizeOptionalText(value: string | undefined): string | null {
    const normalized = value?.trim().replace(/\s+/g, ' ');
    return normalized || null;
  }
}
