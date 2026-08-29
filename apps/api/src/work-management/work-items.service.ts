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
  WorkContactType,
  WorkHelpRequestStatus,
  WorkItemStatus,
  WorkItemType,
  WorkServiceType,
  WorkSalesCoordinationStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CreateWorkItemDto } from './dto/create-work-item.dto';
import {
  ListWorkItemsQueryDto,
  WorkQueueFocus,
  WorkQueueView,
} from './dto/list-work-items-query.dto';
import { WorkNotificationsService } from './work-notifications.service';
import { WorkScopeService } from './work-scope.service';
import type {
  WorkAccountRecord,
  WorkActorContext,
  WorkTeamRecord,
} from './work-scope.service';
import { WorkStatusTransitionService } from './work-status-transition.service';

export const workAccountSummarySelect = {
  id: true,
  role: true,
  username: true,
  superAdminProfile: { select: { fullName: true } },
  employee: {
    select: {
      id: true,
      empId: true,
      empName: true,
      designation: true,
      divisionId: true,
      departmentId: true,
    },
  },
} satisfies Prisma.AccountSelect;

export const workTeamSummarySelect = {
  id: true,
  name: true,
  departmentId: true,
  isActive: true,
  archivedAt: true,
  teamAdmin: {
    select: {
      id: true,
      empId: true,
      empName: true,
      designation: true,
      account: {
        select: workAccountSummarySelect,
      },
    },
  },
  _count: {
    select: {
      members: true,
    },
  },
} satisfies Prisma.DepartmentTeamSelect;

// Detail pages need the full current team roster so every authorized viewer
// sees the same shared-team participants. List/queue payloads intentionally
// keep using the lightweight summary above to avoid inflating large results.
export const workTeamDetailSelect = {
  ...workTeamSummarySelect,
  members: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      employee: {
        select: {
          id: true,
          empId: true,
          empName: true,
          designation: true,
          account: {
            select: workAccountSummarySelect,
          },
        },
      },
    },
  },
} satisfies Prisma.DepartmentTeamSelect;

export const workItemListSelect = {
  id: true,
  ticketNumber: true,
  type: true,
  title: true,
  description: true,
  category: true,
  customerName: true,
  customerContactType: true,
  customerContactNumber: true,
  serviceTypes: true,
  otherServiceText: true,
  requestNumber: true,
  cpcSerial: true,
  serviceNumber: true,
  olt: true,
  fdcName: true,
  fapName: true,
  status: true,
  divisionId: true,
  departmentId: true,
  parentWorkItemId: true,
  assignedTeamId: true,
  salesMemberAccountId: true,
  salesCoordinationStatus: true,
  salesDocumentsSentAt: true,
  salesCompletedAt: true,
  salesCompletionNote: true,
  locationText: true,
  registeredAt: true,
  plannedStartAt: true,
  dueAt: true,
  completedAt: true,
  closedAt: true,
  cancelledAt: true,
  archiveEligibleAt: true,
  deletionEligibleAt: true,
  retentionHoldAt: true,
  retentionHoldReason: true,
  deletionRequestedAt: true,
  deletionRequestReason: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  division: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  department: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  assignedTeam: {
    select: workTeamSummarySelect,
  },
  salesMember: {
    select: workAccountSummarySelect,
  },
  createdBy: {
    select: workAccountSummarySelect,
  },
  responsibleManager: {
    select: workAccountSummarySelect,
  },
  retentionHoldBy: {
    select: workAccountSummarySelect,
  },
  deletionRequestedBy: {
    select: workAccountSummarySelect,
  },
  assignments: {
    where: {
      endedAt: null,
    },
    orderBy: [
      {
        assignmentRole: 'asc',
      },
      {
        createdAt: 'asc',
      },
    ],
    select: {
      id: true,
      assignmentRole: true,
      acknowledgedAt: true,
      startedAt: true,
      createdAt: true,
      assignee: {
        select: workAccountSummarySelect,
      },
      assignedBy: {
        select: workAccountSummarySelect,
      },
    },
  },
} satisfies Prisma.WorkItemSelect;

const ACTIVE_WORK_STATUSES = [
  WorkItemStatus.ASSIGNED,
  WorkItemStatus.ACKNOWLEDGED,
  WorkItemStatus.IN_PROGRESS,
  WorkItemStatus.HELP_REQUESTED,
  WorkItemStatus.COMPLETED_PENDING_REVIEW,
  WorkItemStatus.REOPENED,
  WorkItemStatus.BLOCKED,
] as const;

const TERMINAL_WORK_STATUSES = [
  WorkItemStatus.CLOSED,
  WorkItemStatus.CANCELLED,
] as const;

const DEFAULT_HISTORY_DAYS = 30;
const FILTER_REQUIRED_SENTINEL_ID = '00000000-0000-0000-0000-000000000000';

export interface WorkDelegationProgress {
  total: number;
  completed: number;
  inProgress: number;
  awaitingReview: number;
  notStarted: number;
  cancelled: number;
  completionPercentage: number;
}

export interface WorkDelegatedMemberProgress {
  id: string;
  parentWorkItemId: string | null;
  depth: number;
  ticketNumber: string;
  title: string;
  instructions: string | null;
  status: WorkItemStatus;
  dueAt: Date;
  createdAt: Date;
  completedAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  primaryAssignee: Prisma.AccountGetPayload<{
    select: typeof workAccountSummarySelect;
  }> | null;
  assignedBy: Prisma.AccountGetPayload<{
    select: typeof workAccountSummarySelect;
  }> | null;
  latestProgressSummary: string | null;
  isOverdue: boolean;
}

export interface WorkDelegatedTracking {
  total: number;
  completed: number;
  inProgress: number;
  awaitingReview: number;
  notStarted: number;
  cancelled: number;
  overdue: number;
  completionPercentage: number;
  members: WorkDelegatedMemberProgress[];
}

const workDelegatedTrackingSelect = {
  id: true,
  parentWorkItemId: true,
  ticketNumber: true,
  title: true,
  description: true,
  status: true,
  dueAt: true,
  createdAt: true,
  completedAt: true,
  closedAt: true,
  cancelledAt: true,
  assignments: {
    where: {
      assignmentRole: WorkAssignmentRole.PRIMARY,
      endedAt: null,
    },
    take: 1,
    select: {
      assignee: { select: workAccountSummarySelect },
      assignedBy: { select: workAccountSummarySelect },
    },
  },
  completionReports: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    select: { summary: true },
  },
} satisfies Prisma.WorkItemSelect;

export const workItemDetailSelect = {
  ...workItemListSelect,
  assignedTeam: {
    select: workTeamDetailSelect,
  },
  parentWorkItem: {
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
          dueAt: true,
    },
  },
  childWorkItems: {
    orderBy: [{ status: 'asc' }, { dueAt: 'asc' }],
    take: 50,
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
          dueAt: true,
    },
  },
  completionReports: {
    orderBy: {
      createdAt: 'desc',
    },
    take: 20,
    select: {
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
    },
  },
  helpRequests: {
    orderBy: {
      createdAt: 'desc',
    },
    take: 20,
    select: {
      id: true,
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
    },
  },
} satisfies Prisma.WorkItemSelect;

@Injectable()
export class WorkItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workScopeService: WorkScopeService,
    private readonly statusTransitions: WorkStatusTransitionService,
    private readonly workNotifications: WorkNotificationsService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateWorkItemDto) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.workScopeService.assertCanCreateWork(actor);

    // Parent links preserve accountability while delegated work follows its own lifecycle.
    const parentWorkItem = dto.parentWorkItemId
      ? await this.findVisibleWorkItem(actor, dto.parentWorkItemId)
      : null;

    if (parentWorkItem) {
      this.assertWorkIsOperational(parentWorkItem.archiveEligibleAt);

      if (parentWorkItem.type !== WorkItemType.ADMINISTRATIVE_TASK) {
        throw new BadRequestException(
          'Only individually assigned Administrative Work can be delegated. Operational work stays Team-owned.',
        );
      }

      if (parentWorkItem.assignedTeamId) {
        throw new BadRequestException(
          'Team-owned Administrative Work stays on one shared ticket and cannot create delegated child work.',
        );
      }

      if (
        parentWorkItem.status === WorkItemStatus.CLOSED ||
        parentWorkItem.status === WorkItemStatus.CANCELLED
      ) {
        throw new ConflictException(
          'A closed or cancelled administrative task cannot be delegated.',
        );
      }

      if (
        actor.role !== AccountRole.SENIOR_MANAGEMENT &&
        actor.role !== AccountRole.TEAM_MANAGER
      ) {
        throw new ForbiddenException(
          'Only Senior Management or a Team Manager can delegate received Administrative Work.',
        );
      }

      const parentPrimary = parentWorkItem.assignments.find(
        (assignment) =>
          assignment.assignmentRole === WorkAssignmentRole.PRIMARY,
      );

      if (parentPrimary?.assignee.id !== actor.accountId) {
        throw new ForbiddenException(
          'Delegate is available only for Administrative Work currently assigned to you.',
        );
      }

      if (!parentPrimary.startedAt) {
        throw new BadRequestException(
          'Start the administrative task before delegating part of it.',
        );
      }

      if (!dto.delegationInstructions?.trim()) {
        throw new BadRequestException(
          'Delegation instructions are required.',
        );
      }
    }

    const effectiveType = parentWorkItem?.type ?? dto.type;
    const isAdministrativeWork =
      effectiveType === WorkItemType.ADMINISTRATIVE_TASK;
    const supportingIds = dto.supportingAssigneeAccountIds ?? [];
    let assignedTeam: WorkTeamRecord | null = null;
    let salesMember: WorkAccountRecord | null = null;
    let primaryAssignee: WorkAccountRecord;
    let assignmentAccounts: Array<{
      account: WorkAccountRecord;
      role: WorkAssignmentRole;
    }>;

    if (parentWorkItem) {
      if (dto.assignedTeamId || dto.salesMemberAccountId) {
        throw new BadRequestException(
          'Delegated Administrative Work cannot change the parent Team or Sales assignment.',
        );
      }
      if (supportingIds.length > 0) {
        throw new BadRequestException(
          'Delegate to one individual at a time so the administrative chain stays accountable.',
        );
      }
      if (!dto.primaryAssigneeAccountId) {
        throw new BadRequestException(
          'Choose the individual receiving this delegated administrative work.',
        );
      }

      const [selectedPrimary] =
        await this.workScopeService.resolveAssignableAccounts(actor, [
          dto.primaryAssigneeAccountId,
        ]);
      if (!selectedPrimary?.employee?.divisionId) {
        throw new BadRequestException(
          'The selected individual does not have an active division assignment.',
        );
      }
      this.workScopeService.assertAdministrativeIndividualAssignee(
        actor,
        selectedPrimary,
      );
      primaryAssignee = selectedPrimary;
      assignmentAccounts = [
        { account: selectedPrimary, role: WorkAssignmentRole.PRIMARY },
      ];
    } else {
      const administrativeWork = dto.type === WorkItemType.ADMINISTRATIVE_TASK;
      const hasTeam = Boolean(dto.assignedTeamId);
      const hasIndividual = Boolean(dto.primaryAssigneeAccountId);

      if (administrativeWork && hasTeam === hasIndividual) {
        throw new BadRequestException(
          'Administrative work must be assigned to exactly one Team or one Individual.',
        );
      }
      if (!administrativeWork && hasIndividual) {
        throw new BadRequestException(
          'Operational work must be assigned to a Team, not directly to one Individual.',
        );
      }
      if (!administrativeWork && !hasTeam) {
        throw new BadRequestException(
          'Choose an active Team for this operational work.',
        );
      }

      if (hasTeam && dto.assignedTeamId) {
        assignedTeam = await this.workScopeService.resolveAssignableTeam(
          actor,
          dto.assignedTeamId,
        );
        const adminAccount = assignedTeam.teamAdmin.account;

        if (!adminAccount) {
          throw new BadRequestException(
            'The selected team does not have an active Team Admin account.',
          );
        }

        primaryAssignee = adminAccount;
        // Team membership grants shared visibility and notifications. The Team Admin
        // is only the initial PRIMARY placeholder; the first active team member who
        // starts the shared work becomes the current PRIMARY worker.
        assignmentAccounts = [
          { account: adminAccount, role: WorkAssignmentRole.PRIMARY },
        ];
      } else {
        const [selectedPrimary] =
          await this.workScopeService.resolveAssignableAccounts(actor, [
            dto.primaryAssigneeAccountId!,
          ]);
        if (!selectedPrimary?.employee?.divisionId) {
          throw new BadRequestException(
            'The selected individual does not have an active division assignment.',
          );
        }
        this.workScopeService.assertAdministrativeIndividualAssignee(
          actor,
          selectedPrimary,
        );
        primaryAssignee = selectedPrimary;
        assignmentAccounts = [
          { account: selectedPrimary, role: WorkAssignmentRole.PRIMARY },
        ];
      }
    }

    if (!primaryAssignee.employee?.divisionId) {
      throw new BadRequestException(
        'The primary work owner does not have an active division assignment.',
      );
    }

    // Scope is always derived from the validated team or individual owner, never from browser fields.
    const workDivisionId = assignedTeam
      ? assignedTeam.department.divisionId
      : primaryAssignee.employee.divisionId;
    const workDepartmentId = assignedTeam
      ? assignedTeam.departmentId
      : primaryAssignee.employee.departmentId;

    if (
      primaryAssignee.role !== AccountRole.SENIOR_MANAGEMENT &&
      !workDepartmentId
    ) {
      throw new BadRequestException(
        'The primary work owner does not have a complete department assignment.',
      );
    }

    if (parentWorkItem && parentWorkItem.divisionId !== workDivisionId) {
      throw new BadRequestException(
        'Delegated Administrative Work must remain inside the parent task division.',
      );
    }

    if (
      actor.role === AccountRole.TEAM_MANAGER &&
      parentWorkItem &&
      parentWorkItem.departmentId !== workDepartmentId
    ) {
      throw new BadRequestException(
        'A Team Manager can delegate Administrative Work only inside the same department.',
      );
    }

    const administrativeIndividualWork =
      isAdministrativeWork && !assignedTeam;
    if (
      administrativeIndividualWork &&
      dto.responsibleManagerAccountId &&
      dto.responsibleManagerAccountId !== actor.accountId
    ) {
      throw new BadRequestException(
        'Individual Administrative Work is reviewed by the management account that assigned or delegated it.',
      );
    }

    // Administrative individual work preserves upward accountability: the assigning
    // manager is always the reviewer. Team-owned work keeps the existing reviewer flow.
    const responsibleManager =
      await this.workScopeService.resolveResponsibleManager(
        actor,
        parentWorkItem || administrativeIndividualWork
          ? actor.accountId
          : dto.responsibleManagerAccountId,
        workDivisionId,
        workDepartmentId,
      );

    const allowsSalesMember =
      !parentWorkItem &&
      (effectiveType === WorkItemType.NEW_CONNECTION ||
        effectiveType === WorkItemType.UPDATE_SERVICES);
    const assignedTeamMemberAccountIds = new Set(
      assignedTeam?.members.flatMap((membership) => {
        const accountId = membership.employee.account?.id;
        return accountId ? [accountId] : [];
      }) ?? [],
    );

    if (allowsSalesMember && !dto.salesMemberAccountId) {
      throw new BadRequestException(
        'Choose a Sales Member for New Installation and Update Services work.',
      );
    }

    if (dto.salesMemberAccountId) {
      if (!allowsSalesMember) {
        throw new BadRequestException(
          'A Sales Member applies only to New Installation and Update Services work.',
        );
      }
      salesMember = await this.workScopeService.resolveSalesMember(
        actor,
        dto.salesMemberAccountId,
        workDivisionId,
      );
      if (assignedTeamMemberAccountIds.has(salesMember.id)) {
        throw new BadRequestException(
          'The Sales Member must not already belong to the assigned main team.',
        );
      }
    }

    const supportMembers = parentWorkItem
      ? []
      : await this.workScopeService.resolveSupportMembers(
          actor,
          supportingIds,
          workDivisionId,
        );
    const reservedAccountIds = new Set([
      primaryAssignee.id,
      ...(salesMember ? [salesMember.id] : []),
    ]);

    for (const supportMember of supportMembers) {
      if (assignedTeamMemberAccountIds.has(supportMember.id)) {
        throw new BadRequestException(
          'Supporting Staff must not already belong to the assigned main team.',
        );
      }
      if (reservedAccountIds.has(supportMember.id)) {
        throw new BadRequestException(
          'The primary owner or Sales Member cannot be selected again as Supporting Staff.',
        );
      }
      assignmentAccounts.push({
        account: supportMember,
        role: WorkAssignmentRole.SUPPORTING,
      });
      reservedAccountIds.add(supportMember.id);
    }

    let title: string;
    let description: string;
    let customerName: string | null = null;
    let customerContactType: WorkContactType | null = null;
    let customerContactNumber: string | null = null;
    let locationText: string | null = null;
    let requestNumber: string | null = null;
    let cpcSerial: string | null = null;
    let serviceNumber: string | null = null;
    let olt: string | null = null;
    let fdcName: string | null = null;
    let fapName: string | null = null;
    let serviceTypes: WorkServiceType[] = [];
    let otherServiceText: string | null = null;

    if (parentWorkItem) {
      // Delegated Administrative Work keeps the parent task context while adding clear instructions for the lower-level owner.
      title = parentWorkItem.title;
      description = `${parentWorkItem.description}

Delegation instructions:
${this.normalizeRequiredText(dto.delegationInstructions, 'Delegation instructions')}`;
      customerName = parentWorkItem.customerName;
      customerContactType = parentWorkItem.customerContactType;
      customerContactNumber = parentWorkItem.customerContactNumber;
      locationText = parentWorkItem.locationText;
      requestNumber = parentWorkItem.requestNumber;
      cpcSerial = parentWorkItem.cpcSerial;
      serviceNumber = parentWorkItem.serviceNumber;
      olt = parentWorkItem.olt;
      fdcName = parentWorkItem.fdcName;
      fapName = parentWorkItem.fapName;
      serviceTypes = parentWorkItem.serviceTypes;
      otherServiceText = parentWorkItem.otherServiceText;
    } else if (isAdministrativeWork) {
      // Administrative work is described directly because it has no customer or network record.
      title = this.normalizeRequiredText(dto.title, 'Task title');
      description = dto.description?.trim() ?? '';

      if (title.length > 160) {
        throw new BadRequestException(
          'Task title must contain no more than 160 characters.',
        );
      }

      if (!description) {
        throw new BadRequestException('Task description is required.');
      }

      if (description.length > 4000) {
        throw new BadRequestException(
          'Task description must contain no more than 4000 characters.',
        );
      }
    } else {
      customerName = this.normalizeRequiredText(
        dto.customerName,
        'Customer name',
      );

      if (!dto.customerContactType) {
        throw new BadRequestException('Contact type is required.');
      }

      customerContactType = dto.customerContactType;
      customerContactNumber = this.normalizeCustomerContactNumber(
        customerContactType,
        dto.customerContactNumber,
      );
      locationText = this.normalizeRequiredText(dto.locationText, 'Location');

      const usesRequestNumber =
        effectiveType === WorkItemType.NEW_CONNECTION ||
        effectiveType === WorkItemType.UPDATE_SERVICES;
      requestNumber = usesRequestNumber
        ? this.normalizeRequiredText(dto.requestNumber, 'Token number')
        : null;

      cpcSerial =
        effectiveType === WorkItemType.NEW_CONNECTION
          ? this.normalizeRequiredText(dto.cpcSerial, 'CPC Serial')
          : null;

      // New Installation is identified by Token Number + CPC Serial. Do not
      // require or store a separate Service Number for newly created installation
      // work. Existing historical records keep any value already stored.
      serviceNumber =
        effectiveType === WorkItemType.MAINTENANCE ||
        effectiveType === WorkItemType.NEW_CONNECTION
          ? null
          : this.normalizeRequiredText(dto.serviceNumber, 'Service number');
      olt = this.normalizeRequiredText(dto.olt, 'OLT');
      fdcName = this.normalizeRequiredText(dto.fdcName, 'FDC name');
      fapName = this.normalizeRequiredText(dto.fapName, 'FAP name');
      serviceTypes = [...new Set(dto.serviceTypes ?? [])];
      const requiresServiceSelection =
        effectiveType === WorkItemType.TROUBLE_TICKET ||
        effectiveType === WorkItemType.NEW_CONNECTION ||
        effectiveType === WorkItemType.UPDATE_SERVICES;

      if (requiresServiceSelection && serviceTypes.length === 0) {
        throw new BadRequestException(
          'Select at least one service for Trouble Ticket, New Installation or Update Services work.',
        );
      }

      if (!requiresServiceSelection && serviceTypes.length > 0) {
        throw new BadRequestException(
          'Service selections apply only to Trouble Ticket, New Installation or Update Services work.',
        );
      }

      const includesOtherService = serviceTypes.includes(WorkServiceType.OTHER);
      otherServiceText = includesOtherService
        ? this.normalizeRequiredText(dto.otherServiceText, 'Other service')
        : null;

      if (!includesOtherService && dto.otherServiceText?.trim()) {
        throw new BadRequestException(
          'Other service details require the Other service option.',
        );
      }

      // Customer-facing work uses structured fields to generate a consistent ticket summary.
      title = this.buildGeneratedWorkTitle(
        effectiveType,
        customerName,
        requestNumber ?? serviceNumber,
      );
      description = this.buildGeneratedWorkDescription({
        type: effectiveType,
        customerName,
        customerContactType,
        customerContactNumber,
        locationText,
        requestNumber,
        cpcSerial,
        serviceNumber,
        olt,
        fdcName,
        fapName,
        serviceTypes,
        otherServiceText,
      });
    }
    if (!dto.plannedStartAt) {
      throw new BadRequestException('Planned start time is required.');
    }

    const plannedStartAt = this.parseRequiredDate(
      dto.plannedStartAt,
      'Planned start time',
    );
    const dueAt = this.parseRequiredDate(dto.dueAt, 'Due time');
    const now = Date.now();
    let registeredAt: Date;

    if (parentWorkItem) {
      registeredAt = parentWorkItem.registeredAt;
    } else if (isAdministrativeWork) {
      // Administrative Work has no business-facing registration timestamp.
      // Keep a safe internal value only because the existing database column is non-null.
      registeredAt = new Date(Math.min(now, plannedStartAt.getTime()));
    } else {
      if (!dto.registeredAt) {
        throw new BadRequestException(
          'Registered date and time is required.',
        );
      }

      registeredAt = this.parseRequiredDate(
        dto.registeredAt,
        'Registered date and time',
      );
    }

    if (
      !isAdministrativeWork &&
      !parentWorkItem &&
      registeredAt.getTime() > now
    ) {
      throw new BadRequestException(
        'Registered date and time cannot be in the future.',
      );
    }

    if (
      !isAdministrativeWork &&
      plannedStartAt.getTime() < registeredAt.getTime()
    ) {
      throw new BadRequestException(
        'Planned start time cannot be earlier than the registered date and time.',
      );
    }

    if (dueAt.getTime() <= now) {
      throw new BadRequestException('Due time must be in the future.');
    }

    if (dueAt.getTime() <= plannedStartAt.getTime()) {
      throw new BadRequestException(
        'Due time must be later than the planned start time.',
      );
    }

    if (parentWorkItem && dueAt.getTime() > parentWorkItem.dueAt.getTime()) {
      throw new BadRequestException(
        'The delegated task due time cannot be later than the parent task due time.',
      );
    }

    if (parentWorkItem) {
      const duplicateDelegatedTask = await this.prisma.workItem.findFirst({
        where: {
          parentWorkItemId: parentWorkItem.id,
          status: { in: [...ACTIVE_WORK_STATUSES] },
          assignments: {
            some: {
              assigneeAccountId: primaryAssignee.id,
              assignmentRole: WorkAssignmentRole.PRIMARY,
              endedAt: null,
            },
          },
        },
        select: { id: true },
      });

      if (duplicateDelegatedTask) {
        throw new ConflictException(
          'This individual already has active delegated work under this parent task.',
        );
      }
    }

    const created = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const ticketNumber = await this.createTicketNumber(
          transaction,
          primaryAssignee,
        );
        const assignments = assignmentAccounts.map(({ account, role }) => ({
          accountId: account.id,
          role,
        }));

        const workItem = await transaction.workItem.create({
          data: {
            ticketNumber,
            type: effectiveType,
            title,
            description,
            category: null,
            customerName,
            customerContactType,
            customerContactNumber,
            serviceTypes,
            otherServiceText,
            requestNumber,
            cpcSerial,
            serviceNumber,
            olt,
            fdcName,
            fapName,
            status: WorkItemStatus.ASSIGNED,
            divisionId: workDivisionId,
            departmentId: workDepartmentId,
            parentWorkItemId: parentWorkItem?.id ?? null,
            assignedTeamId: assignedTeam?.id ?? null,
            salesMemberAccountId: salesMember?.id ?? null,
            salesCoordinationStatus: salesMember
              ? WorkSalesCoordinationStatus.WAITING_FOR_DOCUMENTS
              : null,
            locationText,
            registeredAt,
            plannedStartAt,
            dueAt,
            createdByAccountId: actor.accountId,
            responsibleManagerAccountId: responsibleManager.id,
            assignments: {
              create: assignments.map((assignment) => ({
                assigneeAccountId: assignment.accountId,
                assignmentRole: assignment.role,
                assignedByAccountId: actor.accountId,
              })),
            },
          },
          select: workItemListSelect,
        });

        // Ticket history is append-only so assignment responsibility remains auditable.
        await transaction.workActivity.createMany({
          data: [
            {
              workItemId: workItem.id,
              actorAccountId: actor.accountId,
              action: WorkActivityAction.CREATED,
              toStatus: WorkItemStatus.ASSIGNED,
              details: {
                ticketNumber,
                workType: effectiveType,
                    requestNumber,
                cpcSerial,
                serviceNumber,
                serviceTypes,
                parentWorkItemId: parentWorkItem?.id ?? null,
                assignedTeamId: assignedTeam?.id ?? null,
                salesMemberAccountId: salesMember?.id ?? null,
                supportingAssigneeAccountIds: supportMembers.map(
                  (member) => member.id,
                ),
                ...(isAdministrativeWork
                  ? {}
                  : { registeredAt: registeredAt.toISOString() }),
                plannedStartAt: plannedStartAt.toISOString(),
                dueAt: dueAt.toISOString(),
                delegationInstructions: parentWorkItem
                  ? dto.delegationInstructions?.trim()
                  : null,
              },
            },
            ...(parentWorkItem
              ? [
                  {
                    workItemId: workItem.id,
                    actorAccountId: actor.accountId,
                    action: WorkActivityAction.DELEGATED,
                    toStatus: WorkItemStatus.ASSIGNED,
                    details: {
                      parentWorkItemId: parentWorkItem.id,
                      parentTicketNumber: parentWorkItem.ticketNumber,
                    },
                  },
                ]
              : []),
            ...(assignedTeam
              ? [
                  {
                    workItemId: workItem.id,
                    actorAccountId: actor.accountId,
                    action: WorkActivityAction.TEAM_ASSIGNED,
                    toStatus: WorkItemStatus.ASSIGNED,
                    details: {
                      teamId: assignedTeam.id,
                      teamName: assignedTeam.name,
                      teamAdminAccountId: primaryAssignee.id,
                      memberCount: assignedTeam.members.length,
                    },
                  },
                ]
              : []),
            ...(salesMember
              ? [
                  {
                    workItemId: workItem.id,
                    actorAccountId: actor.accountId,
                    action: WorkActivityAction.SALES_MEMBER_ASSIGNED,
                    toStatus: WorkItemStatus.ASSIGNED,
                    details: {
                      salesMemberAccountId: salesMember.id,
                    },
                  },
                ]
              : []),
            ...assignments.map((assignment) => ({
              workItemId: workItem.id,
              actorAccountId: actor.accountId,
              action: WorkActivityAction.ASSIGNED,
              toStatus: WorkItemStatus.ASSIGNED,
              details: {
                assigneeAccountId: assignment.accountId,
                assignmentRole: assignment.role,
              },
            })),
          ],
        });

        if (parentWorkItem) {
          // Record the delegation on the parent task so higher management can audit the full administrative chain.
          await transaction.workActivity.create({
            data: {
              workItemId: parentWorkItem.id,
              actorAccountId: actor.accountId,
              action: WorkActivityAction.DELEGATED,
              fromStatus: parentWorkItem.status,
              toStatus: parentWorkItem.status,
              details: {
                delegatedWorkItemId: workItem.id,
                delegatedTicketNumber: workItem.ticketNumber,
                delegatedAccountId: primaryAssignee.id,
                dueAt: dueAt.toISOString(),
                instructions: dto.delegationInstructions?.trim(),
              },
            },
          });
        }

        return workItem;
      },
    );

    await this.publishUpdate(created, actor.accountId, 'CREATED', {
      title: 'New work assigned',
      body: `${created.ticketNumber}: ${created.title}`,
    });

    return {
      message: parentWorkItem
        ? 'Administrative work delegated successfully.'
        : 'Work assigned successfully.',
      workItem: created,
    };
  }

  async list(user: AuthenticatedUser, query: ListWorkItemsQueryDto) {
    const actor = await this.workScopeService.resolveActorContext(user);
    // Reuse one server-owned scope filter for queue, history and archive authorization.
    const scopeWhere = this.workScopeService.buildVisibleWorkWhere(actor);
    const search = query.search?.trim();
    const now = new Date();
    const view = query.view ?? WorkQueueView.ACTIVE;
    // Role defaults prevent higher-management queues from becoming full subordinate ticket lists.
    const focus = this.resolveQueueFocus(actor, query.focus);
    const filters: Prisma.WorkItemWhereInput[] = [scopeWhere];

    if (
      view === WorkQueueView.DELETION_REVIEW &&
      actor.role !== AccountRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Deletion review is available only to the Super Admin until a platform operator role is introduced.',
      );
    }

    const historyRange = this.resolveHistoryRange(query, now, view);
    filters.push(this.buildQueueViewWhere(view, now, historyRange));
    filters.push(this.buildQueueFocusWhere(actor, focus, now, query, view));

    if (query.status) {
      filters.push({ status: query.status });
    }

    if (query.type) {
      filters.push({ type: query.type });
    }


    if (query.category?.trim()) {
      filters.push({
        category: {
          contains: query.category.trim(),
          mode: 'insensitive',
        },
      });
    }

    if (query.divisionId) {
      filters.push({ divisionId: query.divisionId });
    }

    if (query.departmentId) {
      filters.push({ departmentId: query.departmentId });
    }

    if (query.assigneeAccountId) {
      filters.push({
        assignments: {
          some: {
            assigneeAccountId: query.assigneeAccountId,
            endedAt: null,
          },
        },
      });
    }

    if (query.assignedTeamId) {
      filters.push({ assignedTeamId: query.assignedTeamId });
    }

    if (query.salesMemberAccountId) {
      filters.push({ salesMemberAccountId: query.salesMemberAccountId });
    }

    if (query.dueFrom || query.dueTo) {
      filters.push({
        dueAt: {
          ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
          ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
        },
      });
    }

    if (query.plannedFrom || query.plannedTo) {
      // Daily work boards are driven by the editable planned-start schedule, not ticket creation time.
      filters.push({
        plannedStartAt: {
          ...(query.plannedFrom ? { gte: new Date(query.plannedFrom) } : {}),
          ...(query.plannedTo ? { lte: new Date(query.plannedTo) } : {}),
        },
      });
    }

    if (search) {
      filters.push({
        OR: [
          {
            ticketNumber: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            title: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            category: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            customerName: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            customerContactNumber: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            serviceNumber: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            olt: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            fdcName: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            fapName: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            locationText: {
              contains: search,
              mode: 'insensitive',
            },
          },
          {
            assignedTeam: {
              is: {
                name: {
                  contains: search,
                  mode: 'insensitive',
                },
              },
            },
          },
          {
            salesMember: {
              is: {
                employee: {
                  is: {
                    OR: [
                      { empName: { contains: search, mode: 'insensitive' } },
                      { empId: { contains: search, mode: 'insensitive' } },
                    ],
                  },
                },
              },
            },
          },
        ],
      });
    }

    const where: Prisma.WorkItemWhereInput = {
      AND: filters,
    };
    const skip = (query.page - 1) * query.limit;
    const orderBy: Prisma.WorkItemOrderByWithRelationInput[] =
      view === WorkQueueView.ACTIVE
        ? [{ dueAt: 'asc' }, { createdAt: 'desc' }]
        : [{ updatedAt: 'desc' }, { ticketNumber: 'desc' }];

    const lastThirtyDays = new Date(
      now.getTime() - DEFAULT_HISTORY_DAYS * 24 * 60 * 60 * 1000,
    );
    const scoped = (whereInput: Prisma.WorkItemWhereInput) => ({
      AND: [scopeWhere, whereInput],
    });

    const [
      items,
      total,
      active,
      recentHistory,
      archive,
      eligibleForDeletion,
      deletionRequested,
      assignedToMe,
      createdByMe,
      awaitingMyReview,
      exceptions,
    ] = await Promise.all([
      this.prisma.workItem.findMany({
        where,
        skip,
        take: query.limit,
        orderBy,
        select: workItemListSelect,
      }),
      this.prisma.workItem.count({ where }),
      this.prisma.workItem.count({
        where: scoped({ status: { in: [...ACTIVE_WORK_STATUSES] } }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: { in: [...TERMINAL_WORK_STATUSES] },
          archiveEligibleAt: { gt: now },
          OR: [
            {
              status: WorkItemStatus.CLOSED,
              closedAt: { gte: lastThirtyDays },
            },
            {
              status: WorkItemStatus.CANCELLED,
              cancelledAt: { gte: lastThirtyDays },
            },
          ],
        }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: { in: [...TERMINAL_WORK_STATUSES] },
          archiveEligibleAt: { lte: now },
        }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: { in: [...TERMINAL_WORK_STATUSES] },
          archiveEligibleAt: { lte: now },
          deletionEligibleAt: { lte: now },
        }),
      }),
      this.prisma.workItem.count({
        where: scoped({ deletionRequestedAt: { not: null } }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: { in: [...ACTIVE_WORK_STATUSES] },
          assignments: {
            some: { assigneeAccountId: actor.accountId, endedAt: null },
          },
        }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: { in: [...ACTIVE_WORK_STATUSES] },
          createdByAccountId: actor.accountId,
        }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: WorkItemStatus.COMPLETED_PENDING_REVIEW,
          responsibleManagerAccountId: actor.accountId,
        }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: { in: [...ACTIVE_WORK_STATUSES] },
          OR: [
            this.buildEscalatedHelpWhere(actor),
            { dueAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
          ],
        }),
      }),
    ]);

    // Delegation progress is aggregated separately so queue rows stay lightweight at scale.
    const itemsWithDelegationProgress =
      await this.attachDelegationProgress(items);

    return {
      data: itemsWithDelegationProgress,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
      queue: {
        view,
        focus,
        defaultHistoryDays: DEFAULT_HISTORY_DAYS,
        // The explorer advertises its filter gate so the UI can explain why no rows were loaded.
        explorerRequiresFilter:
          focus === WorkQueueFocus.EXPLORER && !this.hasExplorerFilter(query),
        focusCounts: {
          assignedToMe,
          createdByMe,
          awaitingMyReview,
          exceptions,
        },
        counts: {
          active,
          recentHistory,
          archive,
          eligibleForDeletion,
          deletionRequested,
        },
      },
      filters: {
        view,
        focus,
        status: query.status ?? null,
        type: query.type ?? null,
        search: search || null,
        category: query.category?.trim() || null,
        divisionId: query.divisionId ?? null,
        departmentId: query.departmentId ?? null,
        assigneeAccountId: query.assigneeAccountId ?? null,
        assignedTeamId: query.assignedTeamId ?? null,
        salesMemberAccountId: query.salesMemberAccountId ?? null,
        dueFrom: query.dueFrom ?? null,
        dueTo: query.dueTo ?? null,
        plannedFrom: query.plannedFrom ?? null,
        plannedTo: query.plannedTo ?? null,
        historyFrom: historyRange?.from.toISOString() ?? null,
        historyTo: historyRange?.to.toISOString() ?? null,
      },
    };
  }

  private resolveQueueFocus(
    actor: WorkActorContext,
    requestedFocus: WorkQueueFocus | undefined,
  ): WorkQueueFocus {
    // Employee work is always account-scoped. Without an explicit employee default,
    // the shared list endpoint opened Created by Me and hid both current and past assignments.
    if (actor.role === AccountRole.EMPLOYEE) {
      return WorkQueueFocus.ASSIGNED_TO_ME;
    }

    // Every management workspace opens with the work created by that manager.
    // Role queues remain available as a separate view for wider operational follow-up.
    const defaultFocus = WorkQueueFocus.CREATED_BY_ME;
    const focus = requestedFocus ?? defaultFocus;

    if (
      actor.role === AccountRole.TEAM_MANAGER &&
      [WorkQueueFocus.ACTION_CENTER, WorkQueueFocus.EXCEPTIONS].includes(focus)
    ) {
      throw new ForbiddenException(
        'This work focus is reserved for division or branch oversight.',
      );
    }

    if (
      actor.role !== AccountRole.TEAM_MANAGER &&
      focus === WorkQueueFocus.TEAM_QUEUE
    ) {
      throw new ForbiddenException(
        'Department Queue is available only to Team Managers.',
      );
    }

    if (
      actor.role === AccountRole.SUPER_ADMIN &&
      focus === WorkQueueFocus.ASSIGNED_TO_ME
    ) {
      throw new ForbiddenException(
        'My Work is not available to the Super Admin account.',
      );
    }

    return focus;
  }

  private buildQueueFocusWhere(
    actor: WorkActorContext,
    focus: WorkQueueFocus,
    now: Date,
    query: ListWorkItemsQueryDto,
    view: WorkQueueView,
  ): Prisma.WorkItemWhereInput {
    if (view === WorkQueueView.DELETION_REVIEW) {
      return {};
    }

    // Higher-management action centers surface material exceptions, not every recently late ticket.
    const seriouslyOverdueBefore = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    );

    if (focus === WorkQueueFocus.TEAM_QUEUE) {
      return {
        NOT: {
          assignments: {
            some: {
              assigneeAccountId: actor.accountId,
            },
          },
        },
      };
    }

    if (focus === WorkQueueFocus.ASSIGNED_TO_ME) {
      return {
        OR: [
          {
            assignments: {
              some: {
                assigneeAccountId: actor.accountId,
                ...(view === WorkQueueView.ACTIVE ? { endedAt: null } : {}),
              },
            },
          },
          // Current team members can follow team work without receiving an
          // individual assignment or technical completion authority.
          {
            assignedTeam: {
              is: {
                members: {
                  some: {
                    employee: {
                      is: {
                        account: { is: { id: actor.accountId } },
                      },
                    },
                  },
                },
              },
            },
          },
          // Sales Members need queue visibility and notifications, but only the
          // active PRIMARY assignment receives technical lifecycle authority.
          { salesMemberAccountId: actor.accountId },
        ],
      };
    }

    if (focus === WorkQueueFocus.CREATED_BY_ME) {
      return { createdByAccountId: actor.accountId };
    }

    if (focus === WorkQueueFocus.AWAITING_MY_REVIEW) {
      return {
        responsibleManagerAccountId: actor.accountId,
        status: WorkItemStatus.COMPLETED_PENDING_REVIEW,
      };
    }

    if (focus === WorkQueueFocus.EXCEPTIONS) {
      return {
        OR: [
          this.buildEscalatedHelpWhere(actor),
          { dueAt: { lt: seriouslyOverdueBefore } },
        ],
      };
    }

    if (focus === WorkQueueFocus.EXPLORER) {
      // Returning an impossible identifier avoids expensive broad queries before a filter is chosen.
      return this.hasExplorerFilter(query)
        ? {}
        : { id: FILTER_REQUIRED_SENTINEL_ID };
    }

    // Division and branch queues are for work assigned to other people.
    // Personal assignments remain only in My Work, even when the account also manages the scope.
    return {
      AND: [
        {
          NOT: {
            assignments: {
              some: {
                assigneeAccountId: actor.accountId,
              },
            },
          },
        },
        {
          OR: [
            { createdByAccountId: actor.accountId },
            {
              responsibleManagerAccountId: actor.accountId,
              status: WorkItemStatus.COMPLETED_PENDING_REVIEW,
            },
            this.buildEscalatedHelpWhere(actor),
            { dueAt: { lt: seriouslyOverdueBefore } },
          ],
        },
      ],
    };
  }

  private hasExplorerFilter(query: ListWorkItemsQueryDto): boolean {
    return Boolean(
      query.search?.trim() ||
      query.status ||
      query.type ||
      query.category?.trim() ||
      query.divisionId ||
      query.departmentId ||
      query.assigneeAccountId ||
      query.dueFrom ||
      query.dueTo ||
      query.plannedFrom ||
      query.plannedTo,
    );
  }

  private buildEscalatedHelpWhere(
    actor: WorkActorContext,
  ): Prisma.WorkItemWhereInput {
    // A help ticket reaches higher-management queues only when that actor owns or coordinates it.
    const pendingCoordinatedHelp: Prisma.WorkHelpRequestWhereInput = {
      status: WorkHelpRequestStatus.PENDING,
      requestedDepartmentId: { not: null },
      ...(actor.role === AccountRole.SENIOR_MANAGEMENT
        ? {
            requestedDepartment: {
              is: {
                divisionId: actor.divisionId ?? '__missing_division__',
              },
            },
          }
        : {}),
    };

    return {
      status: WorkItemStatus.HELP_REQUESTED,
      OR: [
        { responsibleManagerAccountId: actor.accountId },
        { helpRequests: { some: pendingCoordinatedHelp } },
      ],
    };
  }

  private extractDelegationInstructions(description: string): string | null {
    const markers = [
      '\n\nDelegation instructions:\n',
      // Preserve readability for historical delegated records created before WM-V2 hierarchy cleanup.
      '\n\nTeam instructions:\n',
    ];

    for (const marker of markers) {
      const markerIndex = description.lastIndexOf(marker);
      if (markerIndex < 0) continue;
      const instructions = description.slice(markerIndex + marker.length).trim();
      if (instructions) return instructions;
    }

    return null;
  }

  private async buildDelegatedWorkTracking(
    actor: WorkActorContext,
    rootWorkItemId: string,
  ): Promise<WorkDelegatedTracking> {
    const members: WorkDelegatedMemberProgress[] = [];
    const visibleScope = this.workScopeService.buildVisibleWorkWhere(actor);
    const now = Date.now();
    let parentIds = [rootWorkItemId];
    let depth = 1;

    // A bounded breadth-first walk gives higher management the full assignment chain
    // without allowing an accidental or malicious cycle to create an unbounded query.
    while (parentIds.length > 0 && depth <= 6 && members.length < 200) {
      const rows = await this.prisma.workItem.findMany({
        where: {
          AND: [visibleScope, { parentWorkItemId: { in: parentIds } }],
        },
        orderBy: [{ createdAt: 'asc' }, { dueAt: 'asc' }],
        take: 200 - members.length,
        select: workDelegatedTrackingSelect,
      });

      if (rows.length === 0) break;

      for (const row of rows) {
        const primary = row.assignments[0] ?? null;
        members.push({
          id: row.id,
          parentWorkItemId: row.parentWorkItemId,
          depth,
          ticketNumber: row.ticketNumber,
          title: row.title,
          instructions: this.extractDelegationInstructions(row.description),
          status: row.status,
          dueAt: row.dueAt,
          createdAt: row.createdAt,
          completedAt: row.completedAt,
          closedAt: row.closedAt,
          cancelledAt: row.cancelledAt,
          primaryAssignee: primary?.assignee ?? null,
          assignedBy: primary?.assignedBy ?? null,
          latestProgressSummary: row.completionReports[0]?.summary ?? null,
          isOverdue:
            row.status !== WorkItemStatus.CLOSED &&
            row.status !== WorkItemStatus.CANCELLED &&
            row.dueAt.getTime() < now,
        });
      }

      parentIds = rows.map((row) => row.id);
      depth += 1;
    }

    const completed = members.filter(
      (member) => member.status === WorkItemStatus.CLOSED,
    ).length;
    const awaitingReview = members.filter(
      (member) => member.status === WorkItemStatus.COMPLETED_PENDING_REVIEW,
    ).length;
    const notStarted = members.filter(
      (member) => member.status === WorkItemStatus.ASSIGNED,
    ).length;
    const cancelled = members.filter(
      (member) => member.status === WorkItemStatus.CANCELLED,
    ).length;
    const inProgress =
      members.length - completed - awaitingReview - notStarted - cancelled;
    const overdue = members.filter((member) => member.isOverdue).length;

    return {
      total: members.length,
      completed,
      inProgress,
      awaitingReview,
      notStarted,
      cancelled,
      overdue,
      completionPercentage:
        members.length === 0
          ? 0
          : Math.round((completed / members.length) * 100),
      members,
    };
  }

  private async attachDelegationProgress<T extends { id: string }>(
    items: T[],
  ): Promise<Array<T & { delegationProgress: WorkDelegationProgress }>> {
    if (items.length === 0) return [];

    const progressByParent = new Map<string, WorkDelegationProgress>();
    const rows = await this.prisma.workItem.groupBy({
      by: ['parentWorkItemId', 'status'],
      where: {
        parentWorkItemId: { in: items.map((item) => item.id) },
      },
      _count: { _all: true },
    });

    for (const row of rows) {
      if (!row.parentWorkItemId) continue;

      const progress =
        progressByParent.get(row.parentWorkItemId) ??
        this.createEmptyDelegationProgress();
      const count = row._count._all;
      progress.total += count;

      if (row.status === WorkItemStatus.CLOSED) {
        progress.completed += count;
      } else if (row.status === WorkItemStatus.COMPLETED_PENDING_REVIEW) {
        progress.awaitingReview += count;
      } else if (row.status === WorkItemStatus.ASSIGNED) {
        progress.notStarted += count;
      } else if (row.status === WorkItemStatus.CANCELLED) {
        progress.cancelled += count;
      } else {
        progress.inProgress += count;
      }

      progressByParent.set(row.parentWorkItemId, progress);
    }

    return items.map((item) => {
      const progress =
        progressByParent.get(item.id) ?? this.createEmptyDelegationProgress();
      // Overall progress uses completed delegated tasks divided by all delegated tasks.
      progress.completionPercentage =
        progress.total === 0
          ? 0
          : Math.round((progress.completed / progress.total) * 100);

      return { ...item, delegationProgress: progress };
    });
  }

  private createEmptyDelegationProgress(): WorkDelegationProgress {
    return {
      total: 0,
      completed: 0,
      inProgress: 0,
      awaitingReview: 0,
      notStarted: 0,
      cancelled: 0,
      completionPercentage: 0,
    };
  }

  private buildQueueViewWhere(
    view: WorkQueueView,
    now: Date,
    historyRange: { from: Date; to: Date } | null,
  ): Prisma.WorkItemWhereInput {
    if (view === WorkQueueView.ACTIVE) {
      return { status: { in: [...ACTIVE_WORK_STATUSES] } };
    }

    if (view === WorkQueueView.HISTORY) {
      const range = historyRange ?? {
        from: new Date(
          now.getTime() - DEFAULT_HISTORY_DAYS * 24 * 60 * 60 * 1000,
        ),
        to: now,
      };
      return {
        status: { in: [...TERMINAL_WORK_STATUSES] },
        archiveEligibleAt: { gt: now },
        OR: [
          {
            status: WorkItemStatus.CLOSED,
            closedAt: { gte: range.from, lte: range.to },
          },
          {
            status: WorkItemStatus.CANCELLED,
            cancelledAt: { gte: range.from, lte: range.to },
          },
        ],
      };
    }

    if (view === WorkQueueView.ARCHIVE) {
      return {
        status: { in: [...TERMINAL_WORK_STATUSES] },
        archiveEligibleAt: { lte: now },
      };
    }

    return {
      status: { in: [...TERMINAL_WORK_STATUSES] },
      archiveEligibleAt: { lte: now },
      deletionEligibleAt: { lte: now },
    };
  }

  private resolveHistoryRange(
    query: ListWorkItemsQueryDto,
    now: Date,
    view: WorkQueueView,
  ): { from: Date; to: Date } | null {
    if (view !== WorkQueueView.HISTORY) return null;

    const from = query.historyFrom
      ? new Date(query.historyFrom)
      : new Date(now.getTime() - DEFAULT_HISTORY_DAYS * 24 * 60 * 60 * 1000);
    const to = query.historyTo ? new Date(query.historyTo) : now;

    if (from.getTime() > to.getTime()) {
      throw new BadRequestException(
        'History start date must be before the end date.',
      );
    }

    return { from, to };
  }

  async getEmployeeDashboardSummary(user: AuthenticatedUser) {
    const actor = await this.workScopeService.resolveActorContext(user);

    if (actor.role !== AccountRole.EMPLOYEE) {
      throw new ForbiddenException(
        'The employee work summary is available only to employee accounts.',
      );
    }

    const now = new Date();
    const activeStatuses = [
      WorkItemStatus.ASSIGNED,
      WorkItemStatus.ACKNOWLEDGED,
      WorkItemStatus.IN_PROGRESS,
      WorkItemStatus.HELP_REQUESTED,
      WorkItemStatus.COMPLETED_PENDING_REVIEW,
      WorkItemStatus.REOPENED,
      WorkItemStatus.BLOCKED,
    ];
    const workingStatuses = [
      WorkItemStatus.ACKNOWLEDGED,
      WorkItemStatus.IN_PROGRESS,
      WorkItemStatus.HELP_REQUESTED,
      WorkItemStatus.REOPENED,
      WorkItemStatus.BLOCKED,
    ];
    const scopeWhere = this.workScopeService.buildVisibleWorkWhere(actor);
    const { start: todayStart, end: todayEnd } =
      this.getKathmanduCalendarDay(now);
    const dueSoonBoundary = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const scoped = (where: Prisma.WorkItemWhereInput) => ({
      AND: [scopeWhere, where],
    });

    const [
      active,
      newWork,
      working,
      waitingForManager,
      dueToday,
      dueSoon,
      overdue,
      informationRequested,
      pendingHelpRequests,
      nextWork,
    ] = await Promise.all([
      this.prisma.workItem.count({
        where: scoped({ status: { in: activeStatuses } }),
      }),
      this.prisma.workItem.count({
        where: scoped({ status: WorkItemStatus.ASSIGNED }),
      }),
      this.prisma.workItem.count({
        where: scoped({ status: { in: workingStatuses } }),
      }),
      this.prisma.workItem.count({
        where: scoped({ status: WorkItemStatus.COMPLETED_PENDING_REVIEW }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: { in: activeStatuses },
          dueAt: { gte: todayStart, lt: todayEnd },
        }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: { in: activeStatuses },
          dueAt: { gt: now, lte: dueSoonBoundary },
        }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: { in: activeStatuses },
          dueAt: { lt: now },
        }),
      }),
      this.prisma.workItem.count({
        where: scoped({
          status: WorkItemStatus.COMPLETED_PENDING_REVIEW,
          completionReports: {
            some: {
              reviewStatus: WorkCompletionReviewStatus.INFORMATION_REQUESTED,
            },
          },
        }),
      }),
      this.prisma.workHelpRequest.count({
        where: {
          requestedHelperAccountId: actor.accountId,
          status: WorkHelpRequestStatus.PENDING,
        },
      }),
      this.prisma.workItem.findMany({
        where: scoped({ status: { in: activeStatuses } }),
        take: 5,
        orderBy: [
          { dueAt: 'asc' },
          { createdAt: 'desc' },
        ],
        select: workItemListSelect,
      }),
    ]);

    return {
      timezone: 'Asia/Kathmandu' as const,
      generatedAt: now.toISOString(),
      totals: {
        active,
        newWork,
        working,
        waitingForManager,
          dueToday,
        dueSoon,
        overdue,
        informationRequested,
        pendingHelpRequests,
      },
      nextWork,
    };
  }

  async getById(user: AuthenticatedUser, workItemId: string) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const workItem = await this.findVisibleWorkItem(actor, workItemId);
    const [workItemWithDelegationProgress] =
      await this.attachDelegationProgress([workItem]);
    const delegatedWork = await this.buildDelegatedWorkTracking(actor, workItem.id);

    return {
      workItem: {
        ...workItemWithDelegationProgress,
        delegatedWork,
      },
    };
  }

  async listActivity(user: AuthenticatedUser, workItemId: string) {
    const actor = await this.workScopeService.resolveActorContext(user);
    await this.findVisibleWorkItem(actor, workItemId);

    const activities = await this.prisma.workActivity.findMany({
      where: {
        workItemId,
      },
      orderBy: [
        {
          createdAt: 'asc',
        },
        {
          id: 'asc',
        },
      ],
      select: {
        id: true,
        action: true,
        fromStatus: true,
        toStatus: true,
        details: true,
        createdAt: true,
        actor: {
          select: workAccountSummarySelect,
        },
      },
    });

    return { data: activities };
  }

  async acknowledge(user: AuthenticatedUser, workItemId: string) {
    const actor = await this.workScopeService.resolveActorContext(user);

    const acknowledgement = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await transaction.workItem.findUnique({
          where: {
            id: workItemId,
          },
          select: {
            id: true,
            status: true,
            version: true,
            archiveEligibleAt: true,
            assignments: {
              where: {
                assigneeAccountId: actor.accountId,
                endedAt: null,
              },
              take: 1,
              select: {
                id: true,
                assignmentRole: true,
                acknowledgedAt: true,
              },
            },
          },
        });

        if (!current) {
          throw new NotFoundException('Work item was not found.');
        }

        this.assertWorkIsOperational(current.archiveEligibleAt);

        const assignment = current.assignments[0];

        if (!assignment) {
          throw new ForbiddenException(
            'Only an active assignee can accept this work item.',
          );
        }

        if (assignment.acknowledgedAt) {
          return {
            changed: false,
            workItem: await transaction.workItem.findUniqueOrThrow({
              where: { id: workItemId },
              select: workItemListSelect,
            }),
          };
        }

        const nextStatus = this.statusTransitions.getStatusAfterAcknowledgement(
          current.status,
        );
        const acknowledgedAt = new Date();

        await transaction.workAssignment.updateMany({
          where: {
            id: assignment.id,
            endedAt: null,
            acknowledgedAt: null,
          },
          data: {
            acknowledgedAt,
          },
        });

        if (nextStatus) {
          const updateResult = await transaction.workItem.updateMany({
            where: {
              id: current.id,
              version: current.version,
              status: current.status,
            },
            data: {
              status: nextStatus,
              version: {
                increment: 1,
              },
            },
          });

          // Recheck status and version inside the transaction to reject stale actions.
          if (updateResult.count !== 1) {
            throw new ConflictException(
              'This work item changed while you were acknowledging it. Refresh and try again.',
            );
          }
        }

        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.ACKNOWLEDGED,
            fromStatus: current.status,
            toStatus: nextStatus ?? current.status,
            details: {
              assignmentRole: assignment.assignmentRole,
            },
          },
        });

        return {
          changed: true,
          workItem: await transaction.workItem.findUniqueOrThrow({
            where: { id: workItemId },
            select: workItemListSelect,
          }),
        };
      },
    );

    if (acknowledgement.changed) {
      await this.publishUpdate(
        acknowledgement.workItem,
        actor.accountId,
        'ACKNOWLEDGED',
        {
          title: 'Work acknowledged',
          body: `${acknowledgement.workItem.ticketNumber}: ${acknowledgement.workItem.title}`,
        },
      );
    }

    return {
      message: acknowledgement.changed
        ? 'Work acknowledged successfully.'
        : 'Work was already acknowledged.',
      workItem: acknowledgement.workItem,
    };
  }

  async start(user: AuthenticatedUser, workItemId: string) {
    const actor = await this.workScopeService.resolveActorContext(user);

    const startResult = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await transaction.workItem.findUnique({
          where: {
            id: workItemId,
          },
          select: {
            id: true,
            status: true,
            version: true,
            archiveEligibleAt: true,
            assignedTeamId: true,
            assignedTeam: {
              select: {
                members: {
                  select: {
                    employee: {
                      select: {
                        account: {
                          select: {
                            id: true,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            assignments: {
              where: {
                assignmentRole: WorkAssignmentRole.PRIMARY,
                endedAt: null,
              },
              take: 1,
              select: {
                id: true,
                assigneeAccountId: true,
                assignedByAccountId: true,
                acknowledgedAt: true,
                startedAt: true,
              },
            },
          },
        });

        if (!current) {
          throw new NotFoundException('Work item was not found.');
        }

        this.assertWorkIsOperational(current.archiveEligibleAt);

        const primaryAssignment = current.assignments[0];
        if (!primaryAssignment) {
          throw new ConflictException(
            'This work item does not have an active primary worker.',
          );
        }

        const isTeamWork = Boolean(current.assignedTeamId);
        const isActiveTeamMember =
          current.assignedTeam?.members.some(
            (membership) =>
              membership.employee.account?.id === actor.accountId,
          ) ?? false;

        if (isTeamWork) {
          if (!isActiveTeamMember) {
            throw new ForbiddenException(
              'Only a member of the assigned team can start this work.',
            );
          }
        } else if (primaryAssignment.assigneeAccountId !== actor.accountId) {
          // Individual administrative work keeps the existing single-owner rule.
          throw new ForbiddenException(
            'Only the active primary assignee can start this work item.',
          );
        }

        if (
          current.status === WorkItemStatus.IN_PROGRESS &&
          primaryAssignment.startedAt
        ) {
          return {
            changed: false,
            workItem: await transaction.workItem.findUniqueOrThrow({
              where: { id: workItemId },
              select: workItemListSelect,
            }),
          };
        }

        const takingTeamWork =
          isTeamWork &&
          primaryAssignment.assigneeAccountId !== actor.accountId;
        const automaticallyAcknowledged =
          isTeamWork &&
          (takingTeamWork || !primaryAssignment.acknowledgedAt);

        if (!isTeamWork && !primaryAssignment.acknowledgedAt) {
          throw new BadRequestException(
            'Acknowledge this work item before starting it.',
          );
        }

        // Team work has one shared ticket. The first active team member who starts
        // it becomes the current PRIMARY worker; no copy is created for each member.
        const nextStatus =
          isTeamWork && current.status === WorkItemStatus.ASSIGNED
            ? WorkItemStatus.IN_PROGRESS
            : this.statusTransitions.getStatusAfterStart(current.status);
        const startedAt = new Date();

        // Claim the start using the work version. Two team members can click Start
        // together, but only one transaction can win this compare-and-swap.
        const updateResult = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
          },
          data: {
            status: nextStatus,
            version: {
              increment: 1,
            },
          },
        });

        if (updateResult.count !== 1) {
          throw new ConflictException(
            'Another team member already changed this work. Refresh to see the latest status.',
          );
        }

        if (takingTeamWork) {
          const endedPrimary = await transaction.workAssignment.updateMany({
            where: {
              id: primaryAssignment.id,
              endedAt: null,
            },
            data: {
              endedAt: startedAt,
              endReason: 'Work started by another member of the assigned team.',
            },
          });

          if (endedPrimary.count !== 1) {
            throw new ConflictException(
              'Another team member already took this work. Refresh to see who started it.',
            );
          }

          await transaction.workAssignment.create({
            data: {
              workItemId: current.id,
              assigneeAccountId: actor.accountId,
              assignmentRole: WorkAssignmentRole.PRIMARY,
              assignedByAccountId: primaryAssignment.assignedByAccountId,
              acknowledgedAt: startedAt,
              startedAt,
            },
          });
        } else if (!primaryAssignment.startedAt) {
          const updatedPrimary = await transaction.workAssignment.updateMany({
            where: {
              id: primaryAssignment.id,
              endedAt: null,
              startedAt: null,
            },
            data: {
              ...(automaticallyAcknowledged
                ? { acknowledgedAt: startedAt }
                : {}),
              startedAt,
            },
          });

          if (updatedPrimary.count !== 1) {
            throw new ConflictException(
              'This work changed while you were starting it. Refresh and try again.',
            );
          }
        }

        if (automaticallyAcknowledged) {
          await transaction.workActivity.create({
            data: {
              workItemId: current.id,
              actorAccountId: actor.accountId,
              action: WorkActivityAction.ACKNOWLEDGED,
              fromStatus: current.status,
              toStatus: nextStatus,
              details: {
                automatic: true,
                source: 'TEAM_START',
              },
            },
          });
        }

        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.STARTED,
            fromStatus: current.status,
            toStatus: nextStatus,
            ...(isTeamWork
              ? {
                  details: {
                    source: 'TEAM_START',
                    assignedTeamId: current.assignedTeamId,
                    previousPrimaryAssigneeAccountId: takingTeamWork
                      ? primaryAssignment.assigneeAccountId
                      : null,
                  },
                }
              : {}),
          },
        });

        return {
          changed: true,
          workItem: await transaction.workItem.findUniqueOrThrow({
            where: { id: workItemId },
            select: workItemListSelect,
          }),
        };
      },
    );

    if (startResult.changed) {
      await this.publishUpdate(
        startResult.workItem,
        actor.accountId,
        'STARTED',
        {
          title: 'Work started',
          body: `${startResult.workItem.ticketNumber}: ${startResult.workItem.title}`,
        },
      );
    }

    return {
      message: startResult.changed
        ? 'Work started successfully.'
        : 'Work was already in progress.',
      workItem: startResult.workItem,
    };
  }

  private assertWorkIsOperational(archiveEligibleAt: Date | null): void {
    if (archiveEligibleAt && archiveEligibleAt.getTime() <= Date.now()) {
      throw new ConflictException(
        'Archived work is read-only and cannot be changed.',
      );
    }
  }

  private async publishUpdate(
    workItem: Prisma.WorkItemGetPayload<{ select: typeof workItemListSelect }>,
    actorAccountId: string,
    action: 'CREATED' | 'ACKNOWLEDGED' | 'STARTED',
    content: { title: string; body: string },
  ): Promise<void> {
    const recipients = [
      workItem.createdBy.id,
      workItem.responsibleManager.id,
      ...workItem.assignments.map((assignment) => assignment.assignee.id),
      ...(workItem.salesMember ? [workItem.salesMember.id] : []),
      actorAccountId,
    ];

    const notificationRecipientAccountIds =
      action === 'STARTED'
        ? [
            ...new Set([
              workItem.createdBy.id,
              workItem.responsibleManager.id,
            ]),
          ]
        : undefined;

    await this.workNotifications.publishWorkUpdate({
      workItem,
      action,
      actorAccountId,
      recipientAccountIds: recipients,
      ...(notificationRecipientAccountIds
        ? { notificationRecipientAccountIds }
        : {}),
      title: content.title,
      body: content.body,
    });
  }

  private async findVisibleWorkItem(
    actor: WorkActorContext,
    workItemId: string,
  ) {
    const scopeWhere = this.workScopeService.buildVisibleWorkWhere(actor);
    const workItem = await this.prisma.workItem.findFirst({
      where: {
        AND: [
          {
            id: workItemId,
          },
          scopeWhere,
        ],
      },
      select: workItemDetailSelect,
    });

    if (!workItem) {
      throw new NotFoundException('Work item was not found.');
    }

    return workItem;
  }

  private getKathmanduCalendarDay(value: Date): { start: Date; end: Date } {
    const offsetMilliseconds = 345 * 60 * 1000;
    const kathmanduDate = new Date(value.getTime() + offsetMilliseconds);
    const start = new Date(
      Date.UTC(
        kathmanduDate.getUTCFullYear(),
        kathmanduDate.getUTCMonth(),
        kathmanduDate.getUTCDate(),
      ) - offsetMilliseconds,
    );

    return {
      start,
      end: new Date(start.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  private async createTicketNumber(
    transaction: Prisma.TransactionClient,
    primaryAssignee: WorkAccountRecord,
  ): Promise<string> {
    // The database sequence prevents duplicate human-readable ticket numbers under concurrency.
    const rows = await transaction.$queryRawUnsafe<
      Array<{ nextValue: bigint | number | string }>
    >('SELECT nextval(\'work_ticket_sequence\') AS "nextValue"');
    const sequenceValue = rows[0]?.nextValue;

    if (sequenceValue === undefined) {
      throw new ConflictException('Unable to generate a work ticket number.');
    }

    const rawOrganizationCode =
      primaryAssignee.employee?.departmentUnit?.code ??
      primaryAssignee.employee?.division?.code ??
      'GEN';
    const departmentCode =
      rawOrganizationCode
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8) || 'GEN';
    const year = new Date().getUTCFullYear();
    const sequence = String(sequenceValue).padStart(6, '0');

    return `NT-PAT-${departmentCode}-${year}-${sequence}`;
  }

  private buildGeneratedWorkTitle(
    type: WorkItemType,
    customerName: string,
    referenceNumber: string | null,
  ): string {
    const title = referenceNumber
      ? `${this.getWorkTypeLabel(type)} · ${referenceNumber} · ${customerName}`
      : `${this.getWorkTypeLabel(type)} · ${customerName}`;
    return title.length <= 160 ? title : `${title.slice(0, 157).trimEnd()}...`;
  }

  private buildGeneratedWorkDescription(input: {
    type: WorkItemType;
    customerName: string;
    customerContactType: WorkContactType;
    customerContactNumber: string;
    locationText: string;
    requestNumber: string | null;
    cpcSerial: string | null;
    serviceNumber: string | null;
    olt: string;
    fdcName: string;
    fapName: string;
    serviceTypes: WorkServiceType[];
    otherServiceText: string | null;
  }): string {
    const details = [
      `${this.getWorkTypeLabel(input.type)} for ${input.customerName}.`,
      `${input.customerContactType === WorkContactType.MOBILE ? 'Customer mobile number' : 'Customer telephone number'}: ${input.customerContactNumber}.`,
      `Location: ${input.locationText}.`,
    ];

    if (input.requestNumber) {
      details.push(`Token number: ${input.requestNumber}.`);
    }

    if (input.cpcSerial) {
      details.push(`CPC Serial: ${input.cpcSerial}.`);
    }

    if (input.serviceNumber) {
      details.push(`Service number: ${input.serviceNumber}.`);
    }

    details.push(
      `OLT: ${input.olt}.`,
      `FDC: ${input.fdcName}.`,
      `FAP: ${input.fapName}.`,
    );

    if (input.serviceTypes.length > 0) {
      const selectedServices = input.serviceTypes.map((serviceType) =>
        serviceType === WorkServiceType.OTHER
          ? (input.otherServiceText ?? 'Other')
          : this.getServiceTypeLabel(serviceType),
      );
      details.push(`Services: ${selectedServices.join(', ')}.`);
    }

    return details.join(' ');
  }

  private getWorkTypeLabel(type: WorkItemType): string {
    const labels: Record<WorkItemType, string> = {
      [WorkItemType.ROUTINE_TASK]: 'Routine task',
      [WorkItemType.TROUBLE_TICKET]: 'Trouble ticket',
      [WorkItemType.MAINTENANCE]: 'Network maintenance',
      [WorkItemType.NEW_CONNECTION]: 'New Installation',
      [WorkItemType.UPDATE_SERVICES]: 'Update services',
      [WorkItemType.INSPECTION]: 'Inspection',
      [WorkItemType.EMERGENCY_WORK]: 'Emergency work',
      [WorkItemType.ADMINISTRATIVE_TASK]: 'Administrative task',
    };
    return labels[type];
  }

  private getServiceTypeLabel(type: WorkServiceType): string {
    const labels: Record<WorkServiceType, string> = {
      [WorkServiceType.DATA]: 'Data',
      [WorkServiceType.VOICE]: 'Voice',
      [WorkServiceType.IPTV]: 'IPTV',
      [WorkServiceType.SIP]: 'SIP',
      [WorkServiceType.OTHER]: 'Other',
    };
    return labels[type];
  }

  private normalizeRequiredText(
    value: string | undefined,
    fieldName: string,
  ): string {
    const normalized = value?.trim().replace(/\s+/g, ' ') ?? '';

    if (!normalized) {
      throw new BadRequestException(`${fieldName} is required.`);
    }

    return normalized;
  }

  private normalizeCustomerContactNumber(
    contactType: WorkContactType,
    value: string | undefined,
  ): string {
    const rawValue = this.normalizeRequiredText(
      value,
      'Customer contact number',
    );

    if (contactType === WorkContactType.MOBILE) {
      if (!/^\d{10}$/.test(rawValue)) {
        throw new BadRequestException(
          'Mobile number must contain exactly 10 digits.',
        );
      }

      return rawValue;
    }

    const normalized = rawValue.replace(/\s*-\s*/g, '-').replace(/\s+/g, ' ');
    const digitCount = normalized.replace(/\D/g, '').length;

    if (!/^[0-9][0-9 -]*[0-9]$/.test(normalized)) {
      throw new BadRequestException(
        'Telephone number may contain only digits, spaces and hyphens.',
      );
    }

    if (digitCount < 6 || digitCount > 12) {
      throw new BadRequestException(
        'Telephone number must contain between 6 and 12 digits.',
      );
    }

    return normalized;
  }

  private normalizeOptionalText(value: string | undefined): string | null {
    const normalized = value?.trim().replace(/\s+/g, ' ');
    return normalized || null;
  }

  private parseRequiredDate(value: string, fieldName: string): Date {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${fieldName} is invalid.`);
    }

    return date;
  }

  private parseOptionalDate(
    value: string | undefined,
    fieldName: string,
  ): Date | null {
    if (!value) {
      return null;
    }

    return this.parseRequiredDate(value, fieldName);
  }
}
