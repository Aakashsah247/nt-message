import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  DutyExceptionType,
  WorkAssignmentRole,
  WorkCompletionReviewStatus,
  WorkItemStatus,
  WorkItemType,
  WorkSalesCoordinationStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import {
  ExportWorkReportQueryDto,
  WorkReportDataset,
} from './dto/export-work-report-query.dto';
import {
  WorkReportDrilldownDataset,
  WorkReportDrilldownQueryDto,
} from './dto/work-report-drilldown-query.dto';
import {
  WorkReportQueryDto,
  WorkReportWorkflowStageFilter,
} from './dto/work-report-query.dto';
import { WorkScopeService } from './work-scope.service';
import type { WorkActorContext } from './work-scope.service';

const BRANCH_TIME_ZONE = 'Asia/Kathmandu' as const;
const KATHMANDU_OFFSET_MS = 5.75 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REPORT_DAYS = 366;

const ACTIVE_WORK_STATUSES = [
  WorkItemStatus.ASSIGNED,
  WorkItemStatus.ACKNOWLEDGED,
  WorkItemStatus.IN_PROGRESS,
  WorkItemStatus.HELP_REQUESTED,
  WorkItemStatus.COMPLETED_PENDING_REVIEW,
  WorkItemStatus.REOPENED,
  WorkItemStatus.BLOCKED,
] as const;


export type WorkReportScopeType =
  | 'PERSONAL'
  | 'DEPARTMENT'
  | 'DIVISION'
  | 'ORGANIZATION';

export interface WorkReportSummary {
  timezone: typeof BRANCH_TIME_ZONE;
  generatedAt: string;
  scope: {
    role: AccountRole;
    type: WorkReportScopeType;
    label: string;
    divisionId: string | null;
    departmentId: string | null;
  };
  period: {
    from: string;
    to: string;
    days: number;
  };
  departmentOptions: Array<{
    id: string;
    divisionId: string;
    code: string;
    name: string;
    division: { id: string; code: string; name: string };
  }>;
  teamOptions: Array<{
    id: string;
    name: string;
    isActive: boolean;
    departmentId: string;
    department: {
      id: string;
      code: string;
      name: string;
      division: { id: string; code: string; name: string };
    };
  }>;
  work: {
    totals: {
      activeAtEnd: number;
      completionRate: number | null;
    };
  };
  workflow: {
    newWork: number;
    inProgress: number;
    waitingForSales: number;
    waitingForApproval: number;
    returnedForCorrection: number;
    overdue: number;
    completedDuring: number;
  };
  teams: Array<{
    teamId: string;
    name: string;
    departmentId: string;
    departmentName: string;
    divisionId: string;
    divisionName: string;
    activeWork: number;
    newWork: number;
    inProgress: number;
    waitingForSales: number;
    waitingForApproval: number;
    returnedForCorrection: number;
    overdueWork: number;
    completedDuring: number;
  }>;
  trend: Array<{
    date: string;
    workCreated: number;
    workClosed: number;
  }>;
}

export interface WorkReportExport {
  content: string;
  filename: string;
  rowCount: number;
  truncated: boolean;
}

export interface WorkReportDrilldownPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface WorkReportDrilldownWorkRow {
  kind: 'WORK_ITEM';
  id: string;
  ticketNumber: string;
  title: string;
  type: WorkItemType;
  workflowStage:
    | 'NEW'
    | 'IN_PROGRESS'
    | 'WAITING_FOR_SALES'
    | 'WAITING_FOR_APPROVAL'
    | 'RETURNED_FOR_CORRECTION'
    | 'COMPLETED'
    | 'CANCELLED';
  customerName: string | null;
  location: string | null;
  reference: { type: 'TOKEN_NUMBER' | 'SERVICE_NUMBER'; value: string } | null;
  cpcSerial: string | null;
  olt: string | null;
  fdcName: string | null;
  fapName: string | null;
  createdAt: string;
  dueAt: string;
  closedAt: string | null;
  overdueDays: number;
  division: { id: string; code: string; name: string };
  department: { id: string; code: string; name: string } | null;
  assignedTeam: { id: string; name: string } | null;
  primaryAssignee: string;
  startedBy: string | null;
  supportingStaff: string[];
  responsibleManager: string;
  salesMember: string | null;
  salesCoordinationStatus: WorkSalesCoordinationStatus | null;
  childProgress: {
    total: number;
    completed: number;
    inProgress: number;
    percentage: number | null;
  };
}

export interface WorkReportPerformanceCounts {
  tickets: number;
  completed: number;
  pending: number;
}

export interface WorkReportPerformanceWorkTypes {
  routineWork: WorkReportPerformanceCounts;
  troubleTicket: WorkReportPerformanceCounts;
  networkMaintenance: WorkReportPerformanceCounts;
  newInstallation: WorkReportPerformanceCounts;
  updateServices: WorkReportPerformanceCounts;
  inspection: WorkReportPerformanceCounts;
  emergencyWork: WorkReportPerformanceCounts;
}

export interface WorkReportPerformanceRow {
  kind: 'PERFORMANCE_ROW';
  date: string;
  team: {
    id: string;
    name: string;
    departmentId: string;
    departmentName: string;
    divisionId: string;
    divisionName: string;
  };
  supportStaffCount: number;
  otherStaffCount: number;
  references: string[];
  workTypes: WorkReportPerformanceWorkTypes;
  total: WorkReportPerformanceCounts;
}

export interface WorkReportPerformanceSection {
  rows: WorkReportPerformanceRow[];
  totals: {
    workTypes: WorkReportPerformanceWorkTypes;
    total: WorkReportPerformanceCounts;
  };
}

export interface WorkReportDrilldownDutyRow {
  kind: 'DUTY_ASSIGNMENT';
  id: string;
  dutyDate: string;
  startsAt: string;
  endsAt: string;
  employee: string;
  employeeId: string | null;
  employeeRole: AccountRole;
  shift: string;
  division: { id: string; code: string; name: string };
  department: { id: string; code: string; name: string } | null;
  reportingLocation: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface WorkReportDrilldownResponse {
  dataset: WorkReportDrilldownDataset;
  generatedAt: string;
  timezone: typeof BRANCH_TIME_ZONE;
  scope: WorkReportSummary['scope'];
  period: WorkReportSummary['period'];
  dutySummary: {
    scheduled: number;
    cancelled: number;
    uniqueEmployees: number;
    leaveDays: number;
  } | null;
  sections: {
    work: {
      pagination: WorkReportDrilldownPagination;
      rows: WorkReportDrilldownWorkRow[];
    } | null;
    performance: WorkReportPerformanceSection | null;
    duty: {
      pagination: WorkReportDrilldownPagination;
      rows: WorkReportDrilldownDutyRow[];
    } | null;
  };
  notice: string;
}

interface ReportRange {
  from: string;
  to: string;
  start: Date;
  endExclusive: Date;
  days: number;
}

@Injectable()
export class WorkReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workScopeService: WorkScopeService,
  ) {}

  async getSummary(
    user: AuthenticatedUser,
    query: WorkReportQueryDto,
  ): Promise<WorkReportSummary> {
    const actor = await this.workScopeService.resolveActorContext(user);
    const range = this.resolveRange(query);
    await this.assertReportFiltersInsideScope(actor, query);

    const baseWorkWhere = this.buildWorkWhere(actor, query);
    const now = new Date();
    const overdueCutoff = new Date(
      Math.min(now.getTime(), range.endExclusive.getTime()),
    );

    const [
      createdItems,
      closedItems,
      activeAtEnd,
      overdueAtEnd,
      departmentOptions,
      teamOptions,
      scopeLabel,
      activeAssignments,
    ] = await Promise.all([
      this.prisma.workItem.findMany({
        where: {
          AND: [
            baseWorkWhere,
            { createdAt: { gte: range.start, lt: range.endExclusive } },
          ],
        },
        select: {
          createdAt: true,
          closedAt: true,
        },
      }),
      this.prisma.workItem.findMany({
        where: {
          AND: [
            baseWorkWhere,
            { closedAt: { gte: range.start, lt: range.endExclusive } },
          ],
        },
        select: {
          assignedTeamId: true,
          closedAt: true,
        },
      }),
      this.prisma.workItem.count({
        where: {
          AND: [
            baseWorkWhere,
            {
              createdAt: { lt: range.endExclusive },
              status: { in: [...ACTIVE_WORK_STATUSES] },
            },
          ],
        },
      }),
      this.prisma.workItem.count({
        where: {
          AND: [
            baseWorkWhere,
            {
              createdAt: { lt: range.endExclusive },
              dueAt: { lt: overdueCutoff },
              status: { in: [...ACTIVE_WORK_STATUSES] },
            },
          ],
        },
      }),
      this.listDepartmentOptions(actor),
      this.listTeamOptions(actor),
      this.resolveScopeLabel(actor),
      this.prisma.workAssignment.findMany({
        where: {
          endedAt: null,
          assignmentRole: WorkAssignmentRole.PRIMARY,
          workItem: {
            is: {
              AND: [
                baseWorkWhere,
                { status: { in: [...ACTIVE_WORK_STATUSES] } },
              ],
            },
          },
        },
        select: {
          workItem: {
            select: {
              assignedTeamId: true,
              status: true,
              dueAt: true,
              salesCoordinationStatus: true,
              completionReports: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { reviewStatus: true },
              },
            },
          },
        },
      }),
    ]);

    const workflow = this.buildWorkflowSummary(
      activeAssignments,
      overdueAtEnd,
      closedItems.length,
    );
    const teams = this.buildTeamBreakdown(
      teamOptions,
      activeAssignments,
      closedItems,
      overdueCutoff,
    );
    const createdAndClosedCount = createdItems.filter(
      (item) => item.closedAt && item.closedAt < range.endExclusive,
    ).length;

    return {
      timezone: BRANCH_TIME_ZONE,
      generatedAt: now.toISOString(),
      scope: {
        role: actor.role,
        type: this.getScopeType(actor.role),
        label: scopeLabel,
        divisionId: actor.divisionId,
        departmentId: actor.departmentId,
      },
      period: {
        from: range.from,
        to: range.to,
        days: range.days,
      },
      departmentOptions,
      teamOptions,
      work: {
        totals: {
          activeAtEnd,
          completionRate:
            createdItems.length > 0
              ? this.round((createdAndClosedCount / createdItems.length) * 100, 1)
              : null,
        },
      },
      workflow,
      teams,
      trend: this.buildTrend(range, createdItems, closedItems),
    };
  }

  async getDrilldown(
    user: AuthenticatedUser,
    query: WorkReportDrilldownQueryDto,
  ): Promise<WorkReportDrilldownResponse> {
    const actor = await this.workScopeService.resolveActorContext(user);
    const range = this.resolveRange(query);
    await this.assertReportFiltersInsideScope(actor, query);

    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const scopeLabel = await this.resolveScopeLabel(actor);

    const workSection =
      query.dataset === WorkReportDrilldownDataset.WORK_RECORDS
        ? await this.listDrilldownWorkRows(actor, range, query, page, limit)
        : null;
    const performanceSection =
      query.dataset === WorkReportDrilldownDataset.PERFORMANCE_REPORT
        ? await this.buildPerformanceSection(actor, range, query)
        : null;
    const dutySection =
      query.dataset === WorkReportDrilldownDataset.DUTY_ASSIGNMENTS
        ? await this.listDrilldownDutyRows(actor, range, query, page, limit)
        : null;
    const dutySummary =
      query.dataset === WorkReportDrilldownDataset.DUTY_ASSIGNMENTS
        ? await this.getDutyDrilldownSummary(actor, range, query)
        : null;

    return {
      dataset: query.dataset,
      generatedAt: new Date().toISOString(),
      timezone: BRANCH_TIME_ZONE,
      scope: {
        role: actor.role,
        type: this.getScopeType(actor.role),
        label: scopeLabel,
        divisionId: actor.divisionId,
        departmentId: actor.departmentId,
      },
      period: {
        from: range.from,
        to: range.to,
        days: range.days,
      },
      dutySummary,
      sections: {
        work: workSection,
        performance: performanceSection,
        duty: dutySection,
      },
      notice:
        query.dataset === WorkReportDrilldownDataset.WORK_RECORDS
          ? 'Work records use team ownership and the current WM-V2 lifecycle. Completed means manager-approved work.'
          : query.dataset === WorkReportDrilldownDataset.PERFORMANCE_REPORT
            ? 'Performance rows are grouped by work date and Team. Administrative Work is excluded; Completed means manager-approved CLOSED work by the selected period end.'
            : 'Duty records represent planned schedules, not verified attendance.',
    };
  }

  private async buildWorkRecordStageWhere(
    actor: WorkActorContext,
    range: ReportRange,
    query: WorkReportQueryDto,
  ): Promise<Prisma.WorkItemWhereInput> {
    if (!query.workflowStage) return {};

    const cutoff = new Date(
      Math.min(new Date().getTime(), range.endExclusive.getTime()),
    );

    if (query.workflowStage === WorkReportWorkflowStageFilter.OVERDUE) {
      return {
        dueAt: { lt: cutoff },
        status: { in: [...ACTIVE_WORK_STATUSES] },
      };
    }

    if (
      query.workflowStage === WorkReportWorkflowStageFilter.WAITING_FOR_SALES
    ) {
      return {
        salesCoordinationStatus: WorkSalesCoordinationStatus.READY_FOR_SALES,
        status: {
          in: ACTIVE_WORK_STATUSES.filter(
            (status) => status !== WorkItemStatus.COMPLETED_PENDING_REVIEW,
          ),
        },
      };
    }

    const baseWhere = this.buildWorkWhere(actor, {
      ...query,
      workflowStage: undefined,
    });
    const candidates = await this.prisma.workItem.findMany({
      where: {
        AND: [
          baseWhere,
          {
            createdAt: { lt: range.endExclusive },
            OR: [
              { createdAt: { gte: range.start } },
              { closedAt: { gte: range.start, lt: range.endExclusive } },
              { status: { in: [...ACTIVE_WORK_STATUSES] } },
            ],
          },
          { status: WorkItemStatus.COMPLETED_PENDING_REVIEW },
        ],
      },
      select: {
        id: true,
        completionReports: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { reviewStatus: true },
        },
      },
    });

    const wantReturned =
      query.workflowStage ===
      WorkReportWorkflowStageFilter.RETURNED_FOR_CORRECTION;
    const ids = candidates
      .filter((item) => {
        const returned =
          item.completionReports[0]?.reviewStatus ===
          WorkCompletionReviewStatus.INFORMATION_REQUESTED;
        return wantReturned ? returned : !returned;
      })
      .map((item) => item.id);

    return { id: { in: ids } };
  }

  private async buildPerformanceSection(
    actor: WorkActorContext,
    range: ReportRange,
    query: WorkReportQueryDto,
  ): Promise<WorkReportPerformanceSection> {
    const workItems = await this.prisma.workItem.findMany({
      where: {
        AND: [
          this.buildWorkWhere(actor, {
            ...query,
            workflowStage: undefined,
            search: undefined,
          }),
          {
            parentWorkItemId: null,
            assignedTeamId: { not: null },
            type: { not: WorkItemType.ADMINISTRATIVE_TASK },
            createdAt: { gte: range.start, lt: range.endExclusive },
          },
        ],
      },
      select: {
        id: true,
        type: true,
        createdAt: true,
        closedAt: true,
        cancelledAt: true,
        requestNumber: true,
        serviceNumber: true,
        salesMemberAccountId: true,
        assignments: {
          where: {
            assignmentRole: WorkAssignmentRole.SUPPORTING,
            createdAt: { lt: range.endExclusive },
            OR: [
              { endedAt: null },
              { endedAt: { gte: range.start } },
            ],
          },
          select: { assigneeAccountId: true },
        },
        assignedTeam: {
          select: {
            id: true,
            name: true,
            departmentId: true,
            department: {
              select: {
                id: true,
                name: true,
                division: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    const zeroCounts = (): WorkReportPerformanceCounts => ({
      tickets: 0,
      completed: 0,
      pending: 0,
    });
    const zeroWorkTypes = (): WorkReportPerformanceWorkTypes => ({
      routineWork: zeroCounts(),
      troubleTicket: zeroCounts(),
      networkMaintenance: zeroCounts(),
      newInstallation: zeroCounts(),
      updateServices: zeroCounts(),
      inspection: zeroCounts(),
      emergencyWork: zeroCounts(),
    });
    const workTypeKey = (
      type: WorkItemType,
    ): keyof WorkReportPerformanceWorkTypes | null => {
      switch (type) {
        case WorkItemType.ROUTINE_TASK:
          return 'routineWork';
        case WorkItemType.TROUBLE_TICKET:
          return 'troubleTicket';
        case WorkItemType.MAINTENANCE:
          return 'networkMaintenance';
        case WorkItemType.NEW_CONNECTION:
          return 'newInstallation';
        case WorkItemType.UPDATE_SERVICES:
          return 'updateServices';
        case WorkItemType.INSPECTION:
          return 'inspection';
        case WorkItemType.EMERGENCY_WORK:
          return 'emergencyWork';
        case WorkItemType.ADMINISTRATIVE_TASK:
          return null;
      }
      return null;
    };

    const rowsByDateTeam = new Map<string, WorkReportPerformanceRow>();
    const peopleByDateTeam = new Map<
      string,
      { support: Set<string>; other: Set<string>; references: Set<string> }
    >();

    const getRow = (
      date: string,
      team: NonNullable<(typeof workItems)[number]['assignedTeam']>,
    ): WorkReportPerformanceRow => {
      const key = `${date}:${team.id}`;
      const existing = rowsByDateTeam.get(key);
      if (existing) return existing;
      const row: WorkReportPerformanceRow = {
        kind: 'PERFORMANCE_ROW',
        date,
        team: {
          id: team.id,
          name: team.name,
          departmentId: team.departmentId,
          departmentName: team.department.name,
          divisionId: team.department.division.id,
          divisionName: team.department.division.name,
        },
        supportStaffCount: 0,
        otherStaffCount: 0,
        references: [],
        workTypes: zeroWorkTypes(),
        total: zeroCounts(),
      };
      rowsByDateTeam.set(key, row);
      peopleByDateTeam.set(key, {
        support: new Set(),
        other: new Set(),
        references: new Set(),
      });
      return row;
    };

    for (const item of workItems) {
      const team = item.assignedTeam;
      const typeKey = workTypeKey(item.type);
      if (!team || !typeKey) continue;

      // A cancelled work item is not a performance ticket once the cancellation
      // was already effective by the selected report period end.
      if (item.cancelledAt && item.cancelledAt < range.endExclusive) continue;

      const date = this.formatKathmanduDate(item.createdAt);
      const rowKey = `${date}:${team.id}`;
      const row = getRow(date, team);
      const people = peopleByDateTeam.get(rowKey);
      const completed = Boolean(
        item.closedAt && item.closedAt < range.endExclusive,
      );

      const counts = row.workTypes[typeKey];
      counts.tickets += 1;
      row.total.tickets += 1;
      if (completed) {
        counts.completed += 1;
        row.total.completed += 1;
      } else {
        counts.pending += 1;
        row.total.pending += 1;
      }

      if (people) {
        for (const assignment of item.assignments) {
          people.support.add(assignment.assigneeAccountId);
        }
        if (item.salesMemberAccountId) {
          people.other.add(item.salesMemberAccountId);
        }

        const tokenNumber = item.requestNumber?.trim();
        const serviceNumber = item.serviceNumber?.trim();
        const reference = tokenNumber
          ? tokenNumber
          : item.type !== WorkItemType.NEW_CONNECTION && serviceNumber
            ? serviceNumber
            : null;
        if (reference) people.references.add(reference);

        row.supportStaffCount = people.support.size;
        row.otherStaffCount = people.other.size;
        row.references = [...people.references].sort((left, right) =>
          left.localeCompare(right),
        );
      }
    }

    const rows = [...rowsByDateTeam.values()].sort((left, right) => {
      const date = left.date.localeCompare(right.date);
      if (date !== 0) return date;
      const division = left.team.divisionName.localeCompare(right.team.divisionName);
      if (division !== 0) return division;
      const department = left.team.departmentName.localeCompare(right.team.departmentName);
      return department !== 0
        ? department
        : left.team.name.localeCompare(right.team.name);
    });

    const totals: WorkReportPerformanceSection['totals'] = {
      workTypes: zeroWorkTypes(),
      total: zeroCounts(),
    };

    for (const row of rows) {
      for (const key of Object.keys(row.workTypes) as Array<
        keyof WorkReportPerformanceWorkTypes
      >) {
        totals.workTypes[key].tickets += row.workTypes[key].tickets;
        totals.workTypes[key].completed += row.workTypes[key].completed;
        totals.workTypes[key].pending += row.workTypes[key].pending;
      }
      totals.total.tickets += row.total.tickets;
      totals.total.completed += row.total.completed;
      totals.total.pending += row.total.pending;
    }

    return { rows, totals };
  }

  private async exportPerformanceReport(
    actor: WorkActorContext,
    range: ReportRange,
    query: WorkReportQueryDto,
  ): Promise<WorkReportExport> {
    const performance = await this.buildPerformanceSection(actor, range, query);
    const counts = (value: WorkReportPerformanceCounts) => [
      value.tickets,
      value.completed,
      value.pending,
    ];
    const groups: Array<{
      type: WorkItemType;
      key: keyof WorkReportPerformanceWorkTypes;
      label: string;
    }> = [
      { type: WorkItemType.ROUTINE_TASK, key: 'routineWork', label: 'Routine Work' },
      { type: WorkItemType.TROUBLE_TICKET, key: 'troubleTicket', label: 'Trouble Ticket' },
      { type: WorkItemType.MAINTENANCE, key: 'networkMaintenance', label: 'Network Maintenance' },
      { type: WorkItemType.NEW_CONNECTION, key: 'newInstallation', label: 'New Installation' },
      { type: WorkItemType.UPDATE_SERVICES, key: 'updateServices', label: 'Update Services' },
      { type: WorkItemType.INSPECTION, key: 'inspection', label: 'Inspection' },
      { type: WorkItemType.EMERGENCY_WORK, key: 'emergencyWork', label: 'Emergency Work' },
    ];
    const visibleGroups = query.type
      ? groups.filter((group) => group.type === query.type)
      : groups;
    const showOverallTotal = !query.type;

    return this.createCsvExport(
      `work-performance-${range.from}-to-${range.to}.csv`,
      [
        'S.N.',
        'Date',
        'Division',
        'Department',
        'Team',
        'Support Staff',
        'Other Staff',
        'Service / Token Number',
        ...visibleGroups.flatMap((group) => [
          `${group.label} Tickets`,
          `${group.label} Completed`,
          `${group.label} Pending`,
        ]),
        ...(showOverallTotal
          ? ['Total Tickets', 'Total Completed', 'Total Pending']
          : []),
      ],
      performance.rows.map((row, index) => [
        index + 1,
        row.date,
        row.team.divisionName,
        row.team.departmentName,
        row.team.name,
        row.supportStaffCount,
        row.otherStaffCount,
        row.references.join(' | '),
        ...visibleGroups.flatMap((group) => counts(row.workTypes[group.key])),
        ...(showOverallTotal ? counts(row.total) : []),
      ]),
      performance.rows.length,
    );
  }

  private async getDutyDrilldownSummary(
    actor: WorkActorContext,
    range: ReportRange,
    query: WorkReportQueryDto,
  ): Promise<NonNullable<WorkReportDrilldownResponse['dutySummary']>> {
    const baseDutyWhere = this.buildDutyWhere(actor, query);
    const periodWhere = {
      startsAt: { gte: range.start, lt: range.endExclusive },
    } satisfies Prisma.DutyAssignmentWhereInput;
    const baseExceptionWhere = this.buildDutyExceptionWhere(actor, query);

    const [scheduledRows, cancelled, leaveDays] = await Promise.all([
      this.prisma.dutyAssignment.findMany({
        where: {
          AND: [baseDutyWhere, periodWhere, { cancelledAt: null }],
        },
        select: { employeeAccountId: true },
      }),
      this.prisma.dutyAssignment.count({
        where: {
          AND: [baseDutyWhere, periodWhere, { cancelledAt: { not: null } }],
        },
      }),
      this.prisma.dutyException.count({
        where: {
          AND: [
            baseExceptionWhere,
            {
              type: DutyExceptionType.LEAVE,
              exceptionDate: { gte: range.start, lt: range.endExclusive },
            },
          ],
        },
      }),
    ]);

    return {
      scheduled: scheduledRows.length,
      cancelled,
      uniqueEmployees: new Set(
        scheduledRows.map((row) => row.employeeAccountId),
      ).size,
      leaveDays,
    };
  }

  private async listDrilldownWorkRows(
    actor: WorkActorContext,
    range: ReportRange,
    query: WorkReportDrilldownQueryDto,
    page: number,
    limit: number,
  ): Promise<NonNullable<WorkReportDrilldownResponse['sections']['work']>> {
    const baseWhere = this.buildWorkWhere(actor, query);
    const periodRelevance: Prisma.WorkItemWhereInput = {
      createdAt: { lt: range.endExclusive },
      OR: [
        { createdAt: { gte: range.start } },
        { closedAt: { gte: range.start, lt: range.endExclusive } },
        { status: { in: [...ACTIVE_WORK_STATUSES] } },
      ],
    };
    const cutoff = new Date(
      Math.min(new Date().getTime(), range.endExclusive.getTime()),
    );
    const stageFilter = await this.buildWorkRecordStageWhere(
      actor,
      range,
      query,
    );
    const where: Prisma.WorkItemWhereInput = {
      AND: [baseWhere, periodRelevance, stageFilter],
    };
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      this.prisma.workItem.findMany({
        where,
        orderBy:
          query.workflowStage === WorkReportWorkflowStageFilter.OVERDUE
            ? [
                { dueAt: 'asc' },
                { ticketNumber: 'asc' },
              ]
            : [{ createdAt: 'desc' }, { ticketNumber: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true,
          ticketNumber: true,
          title: true,
          type: true,
          status: true,
          customerName: true,
          locationText: true,
          requestNumber: true,
          cpcSerial: true,
          serviceNumber: true,
          olt: true,
          fdcName: true,
          fapName: true,
          createdAt: true,
          dueAt: true,
          closedAt: true,
          salesCoordinationStatus: true,
          division: { select: { id: true, code: true, name: true } },
          department: { select: { id: true, code: true, name: true } },
          assignedTeam: { select: { id: true, name: true } },
          salesMember: {
            select: {
              username: true,
              employee: { select: { empName: true, empId: true } },
            },
          },
          responsibleManager: {
            select: {
              username: true,
              employee: { select: { empName: true, empId: true } },
            },
          },
          completionReports: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { reviewStatus: true },
          },
          assignments: {
            where: {
              endedAt: null,
              assignmentRole: {
                in: [
                  WorkAssignmentRole.PRIMARY,
                  WorkAssignmentRole.SUPPORTING,
                ],
              },
            },
            orderBy: { createdAt: 'asc' },
            select: {
              assignmentRole: true,
              startedAt: true,
              assignee: {
                select: {
                  username: true,
                  employee: { select: { empName: true, empId: true } },
                },
              },
            },
          },
          childWorkItems: { select: { status: true } },
        },
      }),
      this.prisma.workItem.count({ where }),
    ]);

    return {
      pagination: this.buildDrilldownPagination(page, limit, total),
      rows: records.map((record) => {
        const completedChildren = record.childWorkItems.filter(
          (child) => child.status === WorkItemStatus.CLOSED,
        ).length;
        const childTotal = record.childWorkItems.length;
        const primary = record.assignments.find(
          (assignment) =>
            assignment.assignmentRole === WorkAssignmentRole.PRIMARY,
        );
        const supportingStaff = record.assignments
          .filter(
            (assignment) =>
              assignment.assignmentRole === WorkAssignmentRole.SUPPORTING,
          )
          .map((assignment) => this.accountName(assignment.assignee));
        const workflowStage = this.getRecordWorkflowStage(record);
        const reference = record.requestNumber
          ? { type: 'TOKEN_NUMBER' as const, value: record.requestNumber }
          : record.type !== WorkItemType.NEW_CONNECTION && record.serviceNumber
            ? {
                type: 'SERVICE_NUMBER' as const,
                value: record.serviceNumber,
              }
            : null;
        const isOpen =
          record.status !== WorkItemStatus.CLOSED &&
          record.status !== WorkItemStatus.CANCELLED;

        return {
          kind: 'WORK_ITEM' as const,
          id: record.id,
          ticketNumber: record.ticketNumber,
          title: record.title,
          type: record.type,
          workflowStage,
          customerName: record.customerName,
          location: record.locationText,
          reference,
          cpcSerial:
            record.type === WorkItemType.NEW_CONNECTION
              ? record.cpcSerial
              : null,
          olt: record.olt,
          fdcName: record.fdcName,
          fapName: record.fapName,
          createdAt: record.createdAt.toISOString(),
          dueAt: record.dueAt.toISOString(),
          closedAt: record.closedAt?.toISOString() ?? null,
          overdueDays: isOpen
            ? Math.max(
                0,
                Math.floor((cutoff.getTime() - record.dueAt.getTime()) / DAY_MS),
              )
            : 0,
          division: record.division,
          department: record.department,
          assignedTeam: record.assignedTeam,
          primaryAssignee: this.accountName(primary?.assignee),
          startedBy:
            primary?.startedAt ? this.accountName(primary.assignee) : null,
          supportingStaff,
          responsibleManager: this.accountName(record.responsibleManager),
          salesMember: record.salesMember
            ? this.accountName(record.salesMember)
            : null,
          salesCoordinationStatus: record.salesCoordinationStatus,
          childProgress: {
            total: childTotal,
            completed: completedChildren,
            inProgress: childTotal - completedChildren,
            percentage:
              childTotal === 0
                ? null
                : this.round((completedChildren / childTotal) * 100, 1),
          },
        };
      }),
    };
  }

  private async listDrilldownDutyRows(
    actor: WorkActorContext,
    range: ReportRange,
    query: WorkReportDrilldownQueryDto,
    page: number,
    limit: number,
  ): Promise<NonNullable<WorkReportDrilldownResponse['sections']['duty']>> {
    const baseWhere = this.buildDutyWhere(actor, query);
    const where: Prisma.DutyAssignmentWhereInput = {
      AND: [
        baseWhere,
        { startsAt: { gte: range.start, lt: range.endExclusive } },
      ],
    };
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      this.prisma.dutyAssignment.findMany({
        where,
        orderBy: [{ startsAt: 'asc' }, { employeeAccountId: 'asc' }],
        skip,
        take: limit,
        select: {
          id: true,
          dutyDate: true,
          startsAt: true,
          endsAt: true,
          reportingLocation: true,
          cancelledAt: true,
          cancellationReason: true,
          shiftName: true,
          division: { select: { id: true, code: true, name: true } },
          department: { select: { id: true, code: true, name: true } },
          shift: { select: { name: true } },
          employee: {
            select: {
              role: true,
              username: true,
              employee: { select: { empName: true, empId: true } },
            },
          },
        },
      }),
      this.prisma.dutyAssignment.count({ where }),
    ]);

    return {
      pagination: this.buildDrilldownPagination(page, limit, total),
      rows: records.map((record) => ({
        kind: 'DUTY_ASSIGNMENT',
        id: record.id,
        dutyDate: this.formatKathmanduDate(record.dutyDate),
        startsAt: record.startsAt.toISOString(),
        endsAt: record.endsAt.toISOString(),
        employee: this.accountName(record.employee),
        employeeId: record.employee.employee?.empId ?? null,
        employeeRole: record.employee.role,
        shift: record.shift?.name ?? record.shiftName ?? 'Deleted shift',
        division: record.division,
        department: record.department,
        reportingLocation: record.reportingLocation,
        cancelledAt: record.cancelledAt?.toISOString() ?? null,
        cancellationReason: record.cancellationReason,
      })),
    };
  }

  private buildDrilldownPagination(
    page: number,
    limit: number,
    total: number,
  ): WorkReportDrilldownPagination {
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return {
      page,
      limit,
      total,
      totalPages,
      hasPrevious: page > 1,
      hasNext: page < totalPages,
    };
  }

  async exportCsv(
    user: AuthenticatedUser,
    query: ExportWorkReportQueryDto,
  ): Promise<WorkReportExport> {
    if (query.dataset === WorkReportDataset.SUMMARY) {
      const summary = await this.getSummary(user, query);
      return this.exportSummary(summary);
    }

    const actor = await this.workScopeService.resolveActorContext(user);
    const range = this.resolveRange(query);
    await this.assertReportFiltersInsideScope(actor, query);

    if (query.dataset === WorkReportDataset.PERFORMANCE_REPORT) {
      return this.exportPerformanceReport(actor, range, query);
    }

    if (query.dataset === WorkReportDataset.WORK_RECORDS) {
      return this.exportWorkRecords(actor, range, query);
    }

    return this.exportDutyAssignments(actor, range, query);
  }

  private exportSummary(summary: WorkReportSummary): WorkReportExport {
    const rows: Array<[string, string, string | number | null]> = [
      ['Context', 'Scope', summary.scope.label],
      ['Context', 'Role', summary.scope.role],
      ['Context', 'From', summary.period.from],
      ['Context', 'To', summary.period.to],
      ['KPI', 'Active Work', summary.work.totals.activeAtEnd],
      ['KPI', 'Completed', summary.workflow.completedDuring],
      ['KPI', 'Need Review', summary.workflow.waitingForApproval],
      ['KPI', 'Overdue', summary.workflow.overdue],
      ['KPI', 'Completion Rate (%)', summary.work.totals.completionRate],
      ['Workflow', 'New', summary.workflow.newWork],
      ['Workflow', 'In Progress', summary.workflow.inProgress],
      ['Workflow', 'Waiting for Sales', summary.workflow.waitingForSales],
      ['Workflow', 'Waiting for Approval', summary.workflow.waitingForApproval],
      ['Workflow', 'Returned for Correction', summary.workflow.returnedForCorrection],
      ['Needs Attention', 'Overdue', summary.workflow.overdue],
      ['Needs Attention', 'Waiting for Sales', summary.workflow.waitingForSales],
      ['Needs Attention', 'Waiting for Approval', summary.workflow.waitingForApproval],
      ['Needs Attention', 'Returned for Correction', summary.workflow.returnedForCorrection],
    ];

    summary.trend.forEach((day) => {
      rows.push(
        ['Trend', `${day.date} · Created`, day.workCreated],
        ['Trend', `${day.date} · Completed`, day.workClosed],
      );
    });

    [...summary.teams]
      .sort((left, right) => {
        if (right.overdueWork !== left.overdueWork) return right.overdueWork - left.overdueWork;
        if (right.waitingForApproval !== left.waitingForApproval) {
          return right.waitingForApproval - left.waitingForApproval;
        }
        if (right.waitingForSales !== left.waitingForSales) {
          return right.waitingForSales - left.waitingForSales;
        }
        return right.activeWork - left.activeWork;
      })
      .forEach((team) => {
        const prefix = `${team.name} · ${team.departmentName} · ${team.divisionName}`;
        rows.push(
          ['Team Performance', `${prefix} · Active`, team.activeWork],
          ['Team Performance', `${prefix} · In Progress`, team.inProgress],
          ['Team Performance', `${prefix} · Waiting for Sales`, team.waitingForSales],
          ['Team Performance', `${prefix} · Need Review`, team.waitingForApproval],
          ['Team Performance', `${prefix} · Overdue`, team.overdueWork],
          ['Team Performance', `${prefix} · Completed`, team.completedDuring],
        );
      });

    return this.createCsvExport(
      `report-overview-${summary.period.from}-to-${summary.period.to}.csv`,
      ['Section', 'Metric', 'Value'],
      rows,
      rows.length,
    );
  }

  private async exportWorkRecords(
    actor: WorkActorContext,
    range: ReportRange,
    query: WorkReportQueryDto,
  ): Promise<WorkReportExport> {
    const stageFilter = await this.buildWorkRecordStageWhere(
      actor,
      range,
      query,
    );
    const where: Prisma.WorkItemWhereInput = {
      AND: [
        this.buildWorkWhere(actor, query),
        {
          createdAt: { lt: range.endExclusive },
          OR: [
            { createdAt: { gte: range.start } },
            { closedAt: { gte: range.start, lt: range.endExclusive } },
            { status: { in: [...ACTIVE_WORK_STATUSES] } },
          ],
        },
        stageFilter,
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.workItem.count({ where }),
      this.prisma.workItem.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { ticketNumber: 'desc' }],
        select: {
          ticketNumber: true,
          type: true,
          status: true,
          customerName: true,
          locationText: true,
          requestNumber: true,
          cpcSerial: true,
          serviceNumber: true,
          olt: true,
          fdcName: true,
          fapName: true,
          createdAt: true,
          dueAt: true,
          closedAt: true,
          salesCoordinationStatus: true,
          division: { select: { code: true, name: true } },
          department: { select: { code: true, name: true } },
          assignedTeam: { select: { name: true } },
          salesMember: {
            select: {
              username: true,
              employee: { select: { empName: true, empId: true } },
            },
          },
          responsibleManager: {
            select: {
              username: true,
              employee: { select: { empName: true, empId: true } },
            },
          },
          completionReports: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { reviewStatus: true },
          },
          assignments: {
            where: {
              endedAt: null,
              assignmentRole: WorkAssignmentRole.PRIMARY,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              startedAt: true,
              assignee: {
                select: {
                  username: true,
                  employee: { select: { empName: true, empId: true } },
                },
              },
            },
          },
        },
      }),
    ]);

    return this.createCsvExport(
      `work-records-${range.from}-to-${range.to}.csv`,
      [
        'Ticket',
        'Work Type',
        'Stage',
        'Assigned Team / Owner',
        'Started By',
        'Reference Type',
        'Reference',
        'Sales Status',
        'Sales Member',
        'Customer',
        'Location',
        'CPC Serial',
        'OLT',
        'FDC',
        'FAP',
        'Division',
        'Department',
        'Responsible Manager',
        'Created At',
        'Due At',
        'Manager Approved At',
      ],
      rows.map((row) => {
        const primary = row.assignments[0];
        const reference = row.requestNumber
          ? { type: 'TOKEN_NUMBER', value: row.requestNumber }
          : row.type !== WorkItemType.NEW_CONNECTION && row.serviceNumber
            ? { type: 'SERVICE_NUMBER', value: row.serviceNumber }
            : null;
        const stage = this.getRecordWorkflowStage(row);
        return [
          row.ticketNumber,
          row.type,
          stage,
          row.assignedTeam?.name ?? this.accountName(primary?.assignee),
          primary?.startedAt ? this.accountName(primary.assignee) : '',
          reference?.type ?? '',
          reference?.value ?? '',
          row.salesCoordinationStatus ?? 'NOT_REQUIRED',
          row.salesMember ? this.accountName(row.salesMember) : '',
          row.customerName ?? '',
          row.locationText ?? '',
          row.type === WorkItemType.NEW_CONNECTION ? row.cpcSerial ?? '' : '',
          row.olt ?? '',
          row.fdcName ?? '',
          row.fapName ?? '',
          `${row.division.code} - ${row.division.name}`,
          row.department
            ? `${row.department.code} - ${row.department.name}`
            : 'Division-level responsibility',
          this.accountName(row.responsibleManager),
          row.createdAt.toISOString(),
          row.dueAt.toISOString(),
          row.closedAt?.toISOString() ?? '',
        ];
      }),
      total,
    );
  }

  private async exportDutyAssignments(
    actor: WorkActorContext,
    range: ReportRange,
    query: WorkReportQueryDto,
  ): Promise<WorkReportExport> {
    const where: Prisma.DutyAssignmentWhereInput = {
      AND: [
        this.buildDutyWhere(actor, query),
        { startsAt: { gte: range.start, lt: range.endExclusive } },
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.dutyAssignment.count({ where }),
      this.prisma.dutyAssignment.findMany({
        where,
        orderBy: [{ startsAt: 'desc' }, { employeeAccountId: 'asc' }],
        select: {
          dutyDate: true,
          startsAt: true,
          endsAt: true,
          reportingLocation: true,
          notes: true,
          cancelledAt: true,
          cancellationReason: true,
          shiftName: true,
          shiftStartMinute: true,
          shiftEndMinute: true,
          shift: {
            select: { name: true, startMinute: true, endMinute: true },
          },
          division: { select: { code: true, name: true } },
          department: { select: { code: true, name: true } },
          employee: {
            select: {
              username: true,
              employee: { select: { empName: true, empId: true } },
            },
          },
          supervisor: {
            select: {
              username: true,
              employee: { select: { empName: true, empId: true } },
            },
          },
        },
      }),
    ]);

    return this.createCsvExport(
      `duty-assignments-${range.from}-to-${range.to}.csv`,
      [
        'Duty Date',
        'Employee',
        'Shift',
        'Starts At',
        'Ends At',
        'Division',
        'Department',
        'Reporting Location',
        'Supervisor',
        'Status',
        'Cancellation Reason',
        'Notes',
      ],
      rows.map((row) => [
        this.formatKathmanduDate(row.dutyDate),
        this.accountName(row.employee),
        row.shift?.name ?? row.shiftName ?? 'Deleted shift',
        row.startsAt.toISOString(),
        row.endsAt.toISOString(),
        `${row.division.code} - ${row.division.name}`,
        row.department
          ? `${row.department.code} - ${row.department.name}`
          : 'Division-level duty',
        row.reportingLocation,
        this.accountName(row.supervisor),
        row.cancelledAt ? 'CANCELLED' : 'SCHEDULED',
        row.cancellationReason ?? '',
        row.notes ?? '',
      ]),
      total,
    );
  }


  private buildWorkflowSummary(
    activeAssignments: Array<{
      workItem: {
        status: WorkItemStatus;
        dueAt: Date;
        salesCoordinationStatus: WorkSalesCoordinationStatus | null;
        completionReports: Array<{ reviewStatus: WorkCompletionReviewStatus }>;
      };
    }>,
    overdueAtEnd: number,
    completedDuring: number,
  ): WorkReportSummary['workflow'] {
    const summary: WorkReportSummary['workflow'] = {
      newWork: 0,
      inProgress: 0,
      waitingForSales: 0,
      waitingForApproval: 0,
      returnedForCorrection: 0,
      overdue: overdueAtEnd,
      completedDuring,
    };

    for (const assignment of activeAssignments) {
      const stage = this.getWorkflowStage(assignment.workItem);
      if (stage === 'NEW') summary.newWork += 1;
      if (stage === 'IN_PROGRESS') summary.inProgress += 1;
      if (stage === 'WAITING_FOR_SALES') summary.waitingForSales += 1;
      if (stage === 'WAITING_FOR_APPROVAL') {
        summary.waitingForApproval += 1;
      }
      if (stage === 'RETURNED_FOR_CORRECTION') {
        summary.returnedForCorrection += 1;
      }
    }

    return summary;
  }

  private getWorkflowStage(workItem: {
    status: WorkItemStatus;
    salesCoordinationStatus: WorkSalesCoordinationStatus | null;
    completionReports: Array<{ reviewStatus: WorkCompletionReviewStatus }>;
  }):
    | 'NEW'
    | 'IN_PROGRESS'
    | 'WAITING_FOR_SALES'
    | 'WAITING_FOR_APPROVAL'
    | 'RETURNED_FOR_CORRECTION' {
    if (workItem.status === WorkItemStatus.COMPLETED_PENDING_REVIEW) {
      return workItem.completionReports[0]?.reviewStatus ===
        WorkCompletionReviewStatus.INFORMATION_REQUESTED
        ? 'RETURNED_FOR_CORRECTION'
        : 'WAITING_FOR_APPROVAL';
    }

    // READY_FOR_SALES means the primary team already sent its material and is
    // now blocked on the assigned Sales Member. WAITING_FOR_DOCUMENTS is still
    // primary-team work, so it remains in the normal progress stage.
    if (
      workItem.salesCoordinationStatus ===
      WorkSalesCoordinationStatus.READY_FOR_SALES
    ) {
      return 'WAITING_FOR_SALES';
    }

    if (
      workItem.status === WorkItemStatus.ASSIGNED ||
      workItem.status === WorkItemStatus.ACKNOWLEDGED ||
      workItem.status === WorkItemStatus.REOPENED
    ) {
      return 'NEW';
    }

    return 'IN_PROGRESS';
  }

  private getRecordWorkflowStage(workItem: {
    status: WorkItemStatus;
    salesCoordinationStatus: WorkSalesCoordinationStatus | null;
    completionReports: Array<{ reviewStatus: WorkCompletionReviewStatus }>;
  }): WorkReportDrilldownWorkRow['workflowStage'] {
    if (workItem.status === WorkItemStatus.CLOSED) return 'COMPLETED';
    if (workItem.status === WorkItemStatus.CANCELLED) return 'CANCELLED';
    return this.getWorkflowStage(workItem);
  }

  private buildTeamBreakdown(
    teamOptions: WorkReportSummary['teamOptions'],
    activeAssignments: Array<{
      workItem: {
        assignedTeamId: string | null;
        status: WorkItemStatus;
        dueAt: Date;
        salesCoordinationStatus: WorkSalesCoordinationStatus | null;
        completionReports: Array<{ reviewStatus: WorkCompletionReviewStatus }>;
      };
    }>,
    closedItems: Array<{ assignedTeamId: string | null }>,
    overdueCutoff: Date,
  ): WorkReportSummary['teams'] {
    const activeByTeam = new Map<
      string,
      {
        activeWork: number;
        newWork: number;
        inProgress: number;
        waitingForSales: number;
        waitingForApproval: number;
        returnedForCorrection: number;
        overdueWork: number;
      }
    >();
    const closedByTeam = new Map<string, number>();

    for (const assignment of activeAssignments) {
      const teamId = assignment.workItem.assignedTeamId;
      if (!teamId) continue;
      const counts = activeByTeam.get(teamId) ?? {
        activeWork: 0,
        newWork: 0,
        inProgress: 0,
        waitingForSales: 0,
        waitingForApproval: 0,
        returnedForCorrection: 0,
        overdueWork: 0,
      };
      const stage = this.getWorkflowStage(assignment.workItem);
      counts.activeWork += 1;
      if (stage === 'NEW') counts.newWork += 1;
      if (stage === 'IN_PROGRESS') counts.inProgress += 1;
      if (stage === 'WAITING_FOR_SALES') counts.waitingForSales += 1;
      if (stage === 'WAITING_FOR_APPROVAL') counts.waitingForApproval += 1;
      if (stage === 'RETURNED_FOR_CORRECTION') {
        counts.returnedForCorrection += 1;
      }
      if (assignment.workItem.dueAt < overdueCutoff) counts.overdueWork += 1;
      activeByTeam.set(teamId, counts);
    }

    for (const item of closedItems) {
      if (!item.assignedTeamId) continue;
      closedByTeam.set(
        item.assignedTeamId,
        (closedByTeam.get(item.assignedTeamId) ?? 0) + 1,
      );
    }

    return teamOptions.flatMap((team) => {
      const active = activeByTeam.get(team.id);
      const completedDuring = closedByTeam.get(team.id) ?? 0;
      if (!active && completedDuring === 0) return [];

      return [
        {
          teamId: team.id,
          name: team.name,
          departmentId: team.departmentId,
          departmentName: team.department.name,
          divisionId: team.department.division.id,
          divisionName: team.department.division.name,
          activeWork: active?.activeWork ?? 0,
          newWork: active?.newWork ?? 0,
          inProgress: active?.inProgress ?? 0,
          waitingForSales: active?.waitingForSales ?? 0,
          waitingForApproval: active?.waitingForApproval ?? 0,
          returnedForCorrection: active?.returnedForCorrection ?? 0,
          overdueWork: active?.overdueWork ?? 0,
          completedDuring,
        },
      ];
    });
  }

  private buildWorkWhere(
    actor: WorkActorContext,
    query: WorkReportQueryDto,
  ): Prisma.WorkItemWhereInput {
    const filter: Prisma.WorkItemWhereInput = {};

    if (query.type) filter.type = query.type;
    if (query.divisionId) filter.divisionId = query.divisionId;
    if (query.departmentId) filter.departmentId = query.departmentId;
    if (query.teamId) filter.assignedTeamId = query.teamId;
    if (query.search?.trim()) {
      const search = query.search.trim();
      filter.OR = [
        { ticketNumber: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
        { requestNumber: { contains: search, mode: 'insensitive' } },
        { serviceNumber: { contains: search, mode: 'insensitive' } },
        { locationText: { contains: search, mode: 'insensitive' } },
        {
          assignedTeam: {
            is: { name: { contains: search, mode: 'insensitive' } },
          },
        },
      ];
    }

    return {
      AND: [this.workScopeService.buildVisibleWorkWhere(actor), filter],
    };
  }

  private buildDutyWhere(
    actor: WorkActorContext,
    query: WorkReportQueryDto,
  ): Prisma.DutyAssignmentWhereInput {
    const where: Prisma.DutyAssignmentWhereInput = {};

    if (actor.role === AccountRole.EMPLOYEE) {
      where.employeeAccountId = actor.accountId;
    } else if (actor.role === AccountRole.TEAM_MANAGER) {
      where.departmentId = actor.departmentId ?? '__missing_department__';
    } else if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      where.divisionId = actor.divisionId ?? '__missing_division__';
    }

    if (query.divisionId) where.divisionId = query.divisionId;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { reportingLocation: { contains: search, mode: 'insensitive' } },
        { shiftName: { contains: search, mode: 'insensitive' } },
        { shift: { is: { name: { contains: search, mode: 'insensitive' } } } },
        {
          employee: {
            is: { username: { contains: search, mode: 'insensitive' } },
          },
        },
        {
          employee: {
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
      ];
    }

    return where;
  }

  private buildDutyExceptionWhere(
    actor: WorkActorContext,
    query: WorkReportQueryDto,
  ): Prisma.DutyExceptionWhereInput {
    const where: Prisma.DutyExceptionWhereInput = {};

    if (actor.role === AccountRole.EMPLOYEE) {
      where.employeeAccountId = actor.accountId;
    } else if (actor.role === AccountRole.TEAM_MANAGER) {
      where.departmentId = actor.departmentId ?? '__missing_department__';
    } else if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      where.divisionId = actor.divisionId ?? '__missing_division__';
    }

    if (query.divisionId) where.divisionId = query.divisionId;
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { note: { contains: search, mode: 'insensitive' } },
        {
          employee: {
            is: { username: { contains: search, mode: 'insensitive' } },
          },
        },
        {
          employee: {
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
      ];
    }
    return where;
  }

  private async assertReportFiltersInsideScope(
    actor: WorkActorContext,
    query: WorkReportQueryDto,
  ): Promise<void> {
    await this.assertDivisionInsideScope(actor, query.divisionId);
    await this.assertDepartmentInsideScope(
      actor,
      query.departmentId,
      query.divisionId,
    );
    await this.assertTeamInsideScope(
      actor,
      query.teamId,
      query.departmentId,
      query.divisionId,
    );
  }

  private async assertDivisionInsideScope(
    actor: WorkActorContext,
    divisionId?: string,
  ): Promise<void> {
    if (!divisionId) return;

    if (actor.role === AccountRole.EMPLOYEE) {
      throw new ForbiddenException(
        'Employees cannot expand a personal report with a division filter.',
      );
    }

    if (
      actor.role !== AccountRole.SUPER_ADMIN &&
      divisionId !== actor.divisionId
    ) {
      throw new ForbiddenException(
        'The selected division is outside your authorized report scope.',
      );
    }

    const division = await this.prisma.division.findUnique({
      where: { id: divisionId },
      select: { id: true, isActive: true },
    });
    if (!division?.isActive) {
      throw new ForbiddenException(
        'The selected division is outside your authorized report scope.',
      );
    }
  }

  private async assertDepartmentInsideScope(
    actor: WorkActorContext,
    departmentId?: string,
    divisionId?: string,
  ): Promise<void> {
    if (!departmentId) return;

    if (actor.role === AccountRole.EMPLOYEE) {
      throw new ForbiddenException(
        'Employees cannot expand a personal report with a department filter.',
      );
    }

    if (
      actor.role === AccountRole.TEAM_MANAGER &&
      departmentId !== actor.departmentId
    ) {
      throw new ForbiddenException(
        'The selected department is outside your authorized report scope.',
      );
    }

    const department = await this.prisma.department.findFirst({
      where: {
        id: departmentId,
        isActive: true,
        ...(divisionId ? { divisionId } : {}),
        ...(actor.role === AccountRole.SENIOR_MANAGEMENT
          ? { divisionId: actor.divisionId ?? '__missing_division__' }
          : {}),
      },
      select: { id: true },
    });

    if (!department) {
      throw new ForbiddenException(
        'The selected department is outside your authorized report scope.',
      );
    }
  }

  private async assertTeamInsideScope(
    actor: WorkActorContext,
    teamId?: string,
    departmentId?: string,
    divisionId?: string,
  ): Promise<void> {
    if (!teamId) return;

    if (actor.role === AccountRole.EMPLOYEE) {
      throw new ForbiddenException(
        'Employees cannot expand a personal report with a team filter.',
      );
    }

    const team = await this.prisma.departmentTeam.findFirst({
      where: {
        id: teamId,
        ...(departmentId ? { departmentId } : {}),
        ...(actor.role === AccountRole.TEAM_MANAGER
          ? { departmentId: actor.departmentId ?? '__missing_department__' }
          : {}),
        department: {
          is: {
            isActive: true,
            ...(divisionId ? { divisionId } : {}),
            ...(actor.role === AccountRole.SENIOR_MANAGEMENT
              ? { divisionId: actor.divisionId ?? '__missing_division__' }
              : {}),
          },
        },
      },
      select: { id: true },
    });

    if (!team) {
      throw new ForbiddenException(
        'The selected team is outside your authorized report scope.',
      );
    }
  }


  private async listDepartmentOptions(actor: WorkActorContext) {
    if (actor.role === AccountRole.EMPLOYEE) return [];

    const where: Prisma.DepartmentWhereInput = { isActive: true };
    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      where.divisionId = actor.divisionId ?? '__missing_division__';
    }
    if (actor.role === AccountRole.TEAM_MANAGER) {
      where.id = actor.departmentId ?? '__missing_department__';
    }

    return this.prisma.department.findMany({
      where,
      orderBy: [{ division: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        divisionId: true,
        code: true,
        name: true,
        division: { select: { id: true, code: true, name: true } },
      },
    });
  }

  private async listTeamOptions(
    actor: WorkActorContext,
  ): Promise<WorkReportSummary['teamOptions']> {
    if (actor.role === AccountRole.EMPLOYEE) return [];

    const where: Prisma.DepartmentTeamWhereInput = {};
    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      where.department = {
        is: { divisionId: actor.divisionId ?? '__missing_division__' },
      };
    }
    if (actor.role === AccountRole.TEAM_MANAGER) {
      where.departmentId = actor.departmentId ?? '__missing_department__';
    }

    const teams = await this.prisma.departmentTeam.findMany({
      where,
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        isActive: true,
        departmentId: true,
        department: {
          select: {
            id: true,
            code: true,
            name: true,
            division: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    return teams.sort((left, right) => {
      const divisionOrder = left.department.division.name.localeCompare(
        right.department.division.name,
      );
      if (divisionOrder !== 0) return divisionOrder;
      const departmentOrder = left.department.name.localeCompare(
        right.department.name,
      );
      return departmentOrder !== 0
        ? departmentOrder
        : left.name.localeCompare(right.name);
    });
  }


  private async resolveScopeLabel(actor: WorkActorContext): Promise<string> {
    if (actor.role === AccountRole.SUPER_ADMIN) return 'Patan Branch';

    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      const division = await this.prisma.division.findUnique({
        where: { id: actor.divisionId ?? '__missing_division__' },
        select: { name: true },
      });
      return division?.name ?? 'Assigned division';
    }

    if (actor.role === AccountRole.TEAM_MANAGER) {
      const department = await this.prisma.department.findUnique({
        where: { id: actor.departmentId ?? '__missing_department__' },
        select: { name: true },
      });
      return department?.name ?? 'Assigned department';
    }

    const account = await this.prisma.account.findUnique({
      where: { id: actor.accountId },
      select: {
        username: true,
        employee: { select: { empName: true } },
      },
    });
    return account?.employee?.empName ?? account?.username ?? 'My account';
  }

  private resolveRange(query: WorkReportQueryDto): ReportRange {
    const today = this.formatKathmanduDate(new Date());
    const to = query.to ?? today;
    const from = query.from ?? this.addDateDays(to, -29);
    const start = this.parseKathmanduDate(from);
    const endStart = this.parseKathmanduDate(to);

    if (start.getTime() > endStart.getTime()) {
      throw new BadRequestException(
        'Report start date must not be after the end date.',
      );
    }

    const days = Math.floor((endStart.getTime() - start.getTime()) / DAY_MS) + 1;
    if (days > MAX_REPORT_DAYS) {
      throw new BadRequestException(
        `Report date range must not be greater than ${MAX_REPORT_DAYS} days.`,
      );
    }

    return {
      from,
      to,
      start,
      endExclusive: new Date(endStart.getTime() + DAY_MS),
      days,
    };
  }

  private parseKathmanduDate(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      throw new BadRequestException('Report dates must use YYYY-MM-DD format.');
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const utcCalendar = Date.UTC(year, month - 1, day);
    const validation = new Date(utcCalendar);

    if (
      validation.getUTCFullYear() !== year ||
      validation.getUTCMonth() !== month - 1 ||
      validation.getUTCDate() !== day
    ) {
      throw new BadRequestException('One or more report dates are invalid.');
    }

    return new Date(utcCalendar - KATHMANDU_OFFSET_MS);
  }

  private formatKathmanduDate(value: Date): string {
    const kathmandu = new Date(value.getTime() + KATHMANDU_OFFSET_MS);
    return [
      kathmandu.getUTCFullYear(),
      String(kathmandu.getUTCMonth() + 1).padStart(2, '0'),
      String(kathmandu.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  private addDateDays(value: string, days: number): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) return value;
    const date = new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  private buildTrend(
    range: ReportRange,
    createdItems: Array<{ createdAt: Date }>,
    closedItems: Array<{ closedAt: Date | null }>,
  ): WorkReportSummary['trend'] {
    const rows = new Map<
      string,
      { date: string; workCreated: number; workClosed: number }
    >();

    for (let index = 0; index < range.days; index += 1) {
      const date = this.addDateDays(range.from, index);
      rows.set(date, { date, workCreated: 0, workClosed: 0 });
    }

    for (const item of createdItems) {
      const row = rows.get(this.formatKathmanduDate(item.createdAt));
      if (row) row.workCreated += 1;
    }
    for (const item of closedItems) {
      if (!item.closedAt) continue;
      const row = rows.get(this.formatKathmanduDate(item.closedAt));
      if (row) row.workClosed += 1;
    }

    return [...rows.values()];
  }


  private getScopeType(role: AccountRole): WorkReportScopeType {
    if (role === AccountRole.SUPER_ADMIN) return 'ORGANIZATION';
    if (role === AccountRole.SENIOR_MANAGEMENT) return 'DIVISION';
    if (role === AccountRole.TEAM_MANAGER) return 'DEPARTMENT';
    return 'PERSONAL';
  }


  private accountName(
    account:
      | {
          username: string | null;
          employee: { empName: string; empId: string } | null;
        }
      | null
      | undefined,
  ): string {
    if (!account) return '';
    const safeUsername =
      account.username && !account.username.includes('@')
        ? account.username
        : null;
    const name = account.employee?.empName ?? safeUsername ?? 'NT Message user';
    return account.employee?.empId ? `${name} (${account.employee.empId})` : name;
  }

  private createCsvExport(
    filename: string,
    headers: string[],
    rows: Array<Array<string | number | boolean | null | undefined>>,
    total: number,
  ): WorkReportExport {
    const content = [headers, ...rows]
      .map((row) => row.map((cell) => this.csvCell(cell)).join(','))
      .join('\r\n');

    const truncated = total > rows.length;
    const protectedFilename = truncated
      ? filename.replace(/\.csv$/i, "-partial.csv")
      : filename;

    return {
      // UTF-8 BOM keeps official names readable when opened directly in spreadsheet software.
      content: `\uFEFF${content}\r\n`,
      filename: protectedFilename,
      rowCount: rows.length,
      truncated,
    };
  }

  private csvCell(value: string | number | boolean | null | undefined): string {
    let text = value === null || value === undefined ? '' : String(value);
    // Prevent spreadsheet formula execution when user-entered ticket text begins with a formula marker.
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  private round(value: number, places: number): number {
    const factor = 10 ** places;
    return Math.round(value * factor) / factor;
  }
}
