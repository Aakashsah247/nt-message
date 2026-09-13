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
  AccountClass,
  OrgLeadershipType,
  DutyActivityAction,
  DutyExceptionType,
  EmployeeStatus,
  EmploymentStatus,
  WorkAvailabilityPreference,
  WorkAssignmentRole,
  WorkItemStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { MessagingPresenceService } from '../realtime/messaging-presence.service';
import { UpdateWorkAvailabilityDto } from './dto/update-work-availability.dto';
import { DutyNotificationsService } from './duty-notifications.service';
import { workAccountSummarySelect } from './work-compatibility-selects';
import { WorkScopeService } from './work-scope.service';

const KATHMANDU_OFFSET_MINUTES = 5 * 60 + 45;
const ACTIVE_WORK_STATUSES = [
  WorkItemStatus.ASSIGNED,
  WorkItemStatus.ACKNOWLEDGED,
  WorkItemStatus.IN_PROGRESS,
  WorkItemStatus.HELP_REQUESTED,
  WorkItemStatus.COMPLETED_PENDING_REVIEW,
  WorkItemStatus.REOPENED,
  WorkItemStatus.BLOCKED,
] as const;

const dutyAssignmentSummarySelect = {
  id: true,
  dutyDate: true,
  startsAt: true,
  endsAt: true,
  reportingLocation: true,
  notes: true,
  authority: true,
  overrideReason: true,
  hierarchyOverride: true,
  conflictOverride: true,
  cancelledAt: true,
  shiftTemplateId: true,
  shiftName: true,
  shiftStartMinute: true,
  shiftEndMinute: true,
  shiftSpansNextDay: true,
  // Personal duty responses expose only safe operational identity and governance context.
  createdBy: { select: workAccountSummarySelect },
  shift: {
    select: {
      id: true,
      name: true,
      startMinute: true,
      endMinute: true,
      spansNextDay: true,
    },
  },
  supervisor: { select: workAccountSummarySelect },
  officeId: true,
  orgUnitId: true,
  operationalTeamId: true,
  office: { select: { id: true, code: true, name: true } },
  operationalTeam: { select: { id: true, code: true, name: true, orgUnitId: true } },
  orgUnit: { select: { id: true, code: true, name: true } },
} satisfies Prisma.DutyAssignmentSelect;

const recommendationAccountSelect = {
  id: true,
  role: true,
  username: true,
  showOnlineStatus: true,
  employee: {
    select: {
      id: true,
      empId: true,
      empName: true,
      designation: true,
    },
  },
} satisfies Prisma.AccountSelect;

type RecommendationAccount = Prisma.AccountGetPayload<{
  select: typeof recommendationAccountSelect;
}>;

export type DutyEffectiveStatus =
  | 'ON_DUTY'
  | 'OFF_DUTY'
  | 'UPCOMING'
  | 'LEAVE'
  | 'HOLIDAY';

export type EffectiveHelpAvailability = 'AVAILABLE' | 'BUSY' | 'OFF_DUTY';

@Injectable()
export class DutyAvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workScopeService: WorkScopeService,
    private readonly messagingPresence: MessagingPresenceService,
    private readonly dutyNotifications: DutyNotificationsService,
  ) {}

  async getMyDutySummary(user: AuthenticatedUser) {
    const accountId = user.accountId;
    const now = new Date();
    const today = this.parseDateOnly(this.localDateString(now));
    const [exception, current, next, upcoming, availability] = await Promise.all([
      this.prisma.dutyException.findUnique({
        where: {
          employeeAccountId_exceptionDate: {
            employeeAccountId: accountId,
            exceptionDate: today,
          },
        },
        select: { id: true, type: true, note: true, exceptionDate: true },
      }),
      this.prisma.dutyAssignment.findFirst({
        where: {
          employeeAccountId: accountId,
          startsAt: { lte: now },
          endsAt: { gt: now },
          cancelledAt: null,
        },
        orderBy: { startsAt: 'asc' },
        select: dutyAssignmentSummarySelect,
      }),
      this.prisma.dutyAssignment.findFirst({
        where: {
          employeeAccountId: accountId,
          startsAt: { gt: now },
          cancelledAt: null,
        },
        orderBy: { startsAt: 'asc' },
        select: dutyAssignmentSummarySelect,
      }),
      this.prisma.dutyAssignment.findMany({
        where: {
          employeeAccountId: accountId,
          startsAt: { gte: now },
          cancelledAt: null,
        },
        orderBy: { startsAt: 'asc' },
        take: 14,
        select: dutyAssignmentSummarySelect,
      }),
      this.prisma.employeeWorkAvailability.findUnique({
        where: { accountId },
        select: { preference: true, updatedAt: true },
      }),
    ]);

    // Leave and holiday records override a scheduled window without deleting roster history.
    const effectiveStatus: DutyEffectiveStatus = exception
      ? exception.type === DutyExceptionType.LEAVE
        ? 'LEAVE'
        : 'HOLIDAY'
      : current
        ? 'ON_DUTY'
        : next && this.dateOnlyString(next.dutyDate) === this.dateOnlyString(today)
          ? 'UPCOMING'
          : 'OFF_DUTY';
    const preference =
      availability?.preference ?? WorkAvailabilityPreference.AVAILABLE;

    return {
      timezone: 'Asia/Kathmandu' as const,
      generatedAt: now.toISOString(),
      effectiveStatus,
      availability: {
        preference,
        effective: this.effectiveAvailability(effectiveStatus, preference),
        updatedAt: availability?.updatedAt.toISOString() ?? null,
      },
      exception: exception
        ? {
            ...exception,
            exceptionDate: this.dateOnlyString(exception.exceptionDate),
          }
        : null,
      current: current ? this.serializeDutySummary(current) : null,
      next: next ? this.serializeDutySummary(next) : null,
      upcoming: upcoming.map((assignment) =>
        this.serializeDutySummary(assignment),
      ),
    };
  }

  async updateMyAvailability(
    user: AuthenticatedUser,
    dto: UpdateWorkAvailabilityDto,
  ) {
    const accountId = user.accountId;
    const availability = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const record = await transaction.employeeWorkAvailability.upsert({
          where: { accountId },
          create: {
            accountId,
            preference: dto.preference,
          },
          update: { preference: dto.preference },
          select: { preference: true, updatedAt: true },
        });
        await transaction.dutyActivity.create({
          data: {
            employeeAccountId: accountId,
            actorAccountId: accountId,
            action: DutyActivityAction.AVAILABILITY_CHANGED,
            details: { preference: dto.preference },
          },
        });
        return record;
      },
    );

    await this.dutyNotifications.publishDutyUpdate({
      assignmentId: null,
      employeeAccountId: accountId,
      action: 'AVAILABILITY_CHANGED',
      actorAccountId: accountId,
      recipientAccountIds: [accountId],
      title: 'Help availability updated',
      body:
        dto.preference === WorkAvailabilityPreference.AVAILABLE
          ? 'You are available to help while on duty.'
          : 'You are marked busy with current work.',
      metadata: { preference: dto.preference },
    });

    const summary = await this.getMyDutySummary(user);
    return {
      message: 'Help availability updated successfully.',
      availability: summary.availability,
    };
  }

  async listHelpRecommendations(
    user: AuthenticatedUser,
    workItemId: string,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const workItem = await this.prisma.workItem.findFirst({
      where: {
        id: workItemId,
        assignments: {
          some: {
            assigneeAccountId: actor.accountId,
            assignmentRole: WorkAssignmentRole.PRIMARY,
            endedAt: null,
            startedAt: { not: null },
          },
        },
        status: {
          in: [
            WorkItemStatus.IN_PROGRESS,
            WorkItemStatus.HELP_REQUESTED,
            WorkItemStatus.BLOCKED,
            WorkItemStatus.REOPENED,
          ],
        },
      },
      select: {
        id: true,
        ticketNumber: true,
        title: true,
        officeId: true,
        primaryOwnerOrgUnitId: true,
        assignments: {
          where: { endedAt: null },
          select: { assigneeAccountId: true },
        },
      },
    });

    if (!workItem) {
      throw new ForbiddenException(
        'Only the active primary employee can find helpers for this work item.',
      );
    }

    if (!workItem.officeId || !workItem.primaryOwnerOrgUnitId) {
      throw new ConflictException(
        'This work item must be reconciled to a V3 Office and OrgUnit before helper recommendations are available.',
      );
    }

    const excludedIds = [
      actor.accountId,
      ...workItem.assignments.map((assignment) => assignment.assigneeAccountId),
    ];
    const recommendations = await this.buildOrgUnitRecommendations(
      workItem.officeId,
      workItem.primaryOwnerOrgUnitId,
      excludedIds,
    );

    return {
      workItem: {
        id: workItem.id,
        ticketNumber: workItem.ticketNumber,
        title: workItem.title,
        officeId: workItem.officeId,
        orgUnitId: workItem.primaryOwnerOrgUnitId,
      },
      data: recommendations,
    };
  }

  async listManagementHelpRecommendations(
    user: AuthenticatedUser,
    orgUnitId: string,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.workScopeService.assertCanManageWork(actor);

    if (
      !actor.officeId ||
      !(actor.assignableOrgUnitIds ?? []).includes(orgUnitId)
    ) {
      throw new ForbiddenException(
        'The selected OrgUnit is outside your management scope.',
      );
    }

    const orgUnit = await this.prisma.orgUnit.findFirst({
      where: { id: orgUnitId, officeId: actor.officeId, isActive: true },
      select: { id: true, officeId: true, code: true, name: true },
    });

    if (!orgUnit) {
      throw new ForbiddenException(
        'The selected OrgUnit is outside your management scope.',
      );
    }

    return {
      orgUnit,
      data: await this.buildOrgUnitRecommendations(
        orgUnit.officeId,
        orgUnit.id,
        [],
      ),
    };
  }

  async assertCanReceiveDirectHelp(
    helperAccountId: string,
    orgUnitId: string,
  ): Promise<void> {
    const now = new Date();
    const helper = await this.prisma.account.findFirst({
      where: {
        id: helperAccountId,
        isEnabled: true,
        accountClass: AccountClass.OFFICE_USER,
        employee: {
          is: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            isActivated: true,
            orgMemberships: {
              some: {
                orgUnitId,
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
              },
            },
          },
        },
      },
      select: { id: true },
    });

    if (!helper) {
      throw new NotFoundException(
        'The selected helper is not an eligible employee in this OrgUnit.',
      );
    }

    const today = this.parseDateOnly(this.localDateString(now));
    const [duty, exception, availability] = await Promise.all([
      this.prisma.dutyAssignment.findFirst({
        where: {
          employeeAccountId: helperAccountId,
          orgUnitId,
          startsAt: { lte: now },
          endsAt: { gt: now },
          cancelledAt: null,
        },
        select: { id: true },
      }),
      this.prisma.dutyException.findUnique({
        where: {
          employeeAccountId_exceptionDate: {
            employeeAccountId: helperAccountId,
            exceptionDate: today,
          },
        },
        select: { id: true },
      }),
      this.prisma.employeeWorkAvailability.findUnique({
        where: { accountId: helperAccountId },
        select: { preference: true },
      }),
    ]);

    if (!duty || exception) {
      throw new ConflictException(
        'The selected employee is not currently on duty.',
      );
    }

    if (availability?.preference === WorkAvailabilityPreference.BUSY) {
      throw new ConflictException(
        'The selected employee is currently marked busy.',
      );
    }
  }

  private async buildOrgUnitRecommendations(
    officeId: string,
    orgUnitId: string,
    excludedIds: string[],
  ) {
    const now = new Date();
    const candidates = await this.prisma.account.findMany({
      where: {
        id: excludedIds.length > 0 ? { notIn: excludedIds } : undefined,
        isEnabled: true,
        accountClass: AccountClass.OFFICE_USER,
        employee: {
          is: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            isActivated: true,
            orgMemberships: {
              some: {
                officeId,
                orgUnitId,
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
              },
            },
          },
        },
      },
      orderBy: { employee: { empName: 'asc' } },
      select: recommendationAccountSelect,
    });
    const today = this.parseDateOnly(this.localDateString(now));
    const candidateIds = candidates.map((candidate) => candidate.id);

    if (candidateIds.length === 0) return [];

    const [duties, exceptions, preferences, workloadRows] = await Promise.all([
      this.prisma.dutyAssignment.findMany({
        where: {
          employeeAccountId: { in: candidateIds },
          orgUnitId,
          startsAt: { lte: now },
          endsAt: { gt: now },
          cancelledAt: null,
        },
        select: {
          employeeAccountId: true,
          endsAt: true,
          reportingLocation: true,
        },
      }),
      this.prisma.dutyException.findMany({
        where: {
          employeeAccountId: { in: candidateIds },
          exceptionDate: today,
        },
        select: { employeeAccountId: true },
      }),
      this.prisma.employeeWorkAvailability.findMany({
        where: { accountId: { in: candidateIds } },
        select: { accountId: true, preference: true },
      }),
      this.prisma.workAssignment.findMany({
        where: {
          assigneeAccountId: { in: candidateIds },
          endedAt: null,
          workItem: { status: { in: [...ACTIVE_WORK_STATUSES] } },
        },
        select: {
          assigneeAccountId: true,
          workItem: {
            select: { status: true, dueAt: true },
          },
        },
      }),
    ]);
    const dutyByAccount = new Map(
      duties.map((duty) => [duty.employeeAccountId, duty]),
    );
    const exceptionIds = new Set(
      exceptions.map((exception) => exception.employeeAccountId),
    );
    const preferenceByAccount = new Map(
      preferences.map((preference) => [
        preference.accountId,
        preference.preference,
      ]),
    );
    const workloadByAccount = this.workloads(candidateIds, workloadRows, now);
    const presenceByAccount = new Map(
      this.messagingPresence
        .getSnapshot()
        .map((presence) => [presence.accountId, presence]),
    );

    const recommendations = candidates.map((candidate) => {
      const duty = dutyByAccount.get(candidate.id);
      const onDuty = Boolean(duty) && !exceptionIds.has(candidate.id);
      const preference =
        preferenceByAccount.get(candidate.id) ??
        WorkAvailabilityPreference.AVAILABLE;
      const availability: EffectiveHelpAvailability = !onDuty
        ? 'OFF_DUTY'
        : preference === WorkAvailabilityPreference.BUSY
          ? 'BUSY'
          : 'AVAILABLE';
      const presence = presenceByAccount.get(candidate.id);
      // Respect each employee's presence privacy while still exposing duty availability.
      const isOnline = candidate.showOnlineStatus
        ? presence?.isOnline ?? false
        : null;
      const workload = workloadByAccount.get(candidate.id) ?? {
        active: 0,
        overdue: 0,
      };

      return {
        account: {
          id: candidate.id,
          role: candidate.role,
          username: candidate.username,
          employee: candidate.employee,
        },
        onDuty,
        dutyEndsAt: duty?.endsAt.toISOString() ?? null,
        reportingLocation: duty?.reportingLocation ?? null,
        preference,
        availability,
        isOnline,
        onlineStatusVisible: candidate.showOnlineStatus,
        workload,
        eligibleForDirectHelp: availability === 'AVAILABLE',
      };
    });

    recommendations.sort((first, second) => {
      const availabilityDifference =
        Number(!first.eligibleForDirectHelp) -
        Number(!second.eligibleForDirectHelp);
      if (availabilityDifference !== 0) return availabilityDifference;
      const onlineRank = (value: boolean | null) =>
        value === true ? 0 : value === false ? 1 : 2;
      const onlineDifference =
        onlineRank(first.isOnline) - onlineRank(second.isOnline);
      if (onlineDifference !== 0) return onlineDifference;
      const overdueDifference = first.workload.overdue - second.workload.overdue;
      if (overdueDifference !== 0) return overdueDifference;
      const activeDifference = first.workload.active - second.workload.active;
      if (activeDifference !== 0) return activeDifference;
      const firstName =
        first.account.employee?.empName ?? first.account.username ?? '';
      const secondName =
        second.account.employee?.empName ?? second.account.username ?? '';
      return firstName.localeCompare(secondName);
    });

    return recommendations;
  }

  private serializeDutySummary(
    assignment: Prisma.DutyAssignmentGetPayload<{
      select: typeof dutyAssignmentSummarySelect;
    }>,
  ) {
    const startMinute =
      assignment.shiftStartMinute ?? assignment.shift?.startMinute ?? 0;
    const endMinute = assignment.shiftEndMinute ?? assignment.shift?.endMinute ?? 0;

    return {
      ...assignment,
      dutyDate: this.dateOnlyString(assignment.dutyDate),
      startsAt: assignment.startsAt.toISOString(),
      endsAt: assignment.endsAt.toISOString(),
      cancelledAt: assignment.cancelledAt?.toISOString() ?? null,
      shift: {
        id: assignment.shift?.id ?? null,
        name: assignment.shiftName ?? assignment.shift?.name ?? 'Deleted shift',
        startMinute,
        endMinute,
        startTime: this.minuteLabel(startMinute),
        endTime: this.minuteLabel(endMinute),
        spansNextDay:
          assignment.shiftSpansNextDay ?? assignment.shift?.spansNextDay ?? false,
        deleted: assignment.shift === null,
      },
    };
  }

  private effectiveAvailability(
    status: DutyEffectiveStatus,
    preference: WorkAvailabilityPreference,
  ): EffectiveHelpAvailability {
    if (status !== 'ON_DUTY') return 'OFF_DUTY';
    return preference === WorkAvailabilityPreference.BUSY
      ? 'BUSY'
      : 'AVAILABLE';
  }

  private workloads(
    accountIds: string[],
    rows: Array<{
      assigneeAccountId: string;
      workItem: {
        status: WorkItemStatus;
        dueAt: Date;
      };
    }>,
    now: Date,
  ) {
    const map = new Map(
      accountIds.map((accountId) => [
        accountId,
        { active: 0, overdue: 0 },
      ]),
    );

    for (const row of rows) {
      const workload = map.get(row.assigneeAccountId);
      if (!workload) continue;
      workload.active += 1;
      if (row.workItem.dueAt.getTime() < now.getTime()) {
        workload.overdue += 1;
      }
    }

    return map;
  }

  private localDateString(date: Date): string {
    const local = new Date(date.getTime() + KATHMANDU_OFFSET_MINUTES * 60_000);
    return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`;
  }

  private parseDateOnly(value: string): Date {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private dateOnlyString(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private minuteLabel(value: number): string {
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }
}
