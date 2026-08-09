import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  DutyAssignmentAuthority,
  DutyExceptionType,
  WorkActivityAction,
  WorkAssignmentRole,
  WorkCompletionResult,
  WorkCompletionReviewStatus,
  WorkHelpRequestStatus,
  WorkItemStatus,
  WorkItemType,
  WorkPriority,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { DailyWorkReportQueryDto } from './dto/daily-work-report-query.dto';
import {
  ExportWorkReportQueryDto,
  WorkReportDataset,
} from './dto/export-work-report-query.dto';
import {
  WorkReportDrilldownDataset,
  WorkReportDrilldownQueryDto,
} from './dto/work-report-drilldown-query.dto';
import {
  WorkReportDutyStatus,
  WorkReportQueryDto,
} from './dto/work-report-query.dto';
import { WorkScopeService } from './work-scope.service';
import type { WorkActorContext } from './work-scope.service';

const BRANCH_TIME_ZONE = 'Asia/Kathmandu' as const;
const KATHMANDU_OFFSET_MS = 5.75 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REPORT_DAYS = 366;
const MAX_EXPORT_ROWS = 10_000;

const ACTIVE_WORK_STATUSES = [
  WorkItemStatus.ASSIGNED,
  WorkItemStatus.ACKNOWLEDGED,
  WorkItemStatus.IN_PROGRESS,
  WorkItemStatus.HELP_REQUESTED,
  WorkItemStatus.COMPLETED_PENDING_REVIEW,
  WorkItemStatus.REOPENED,
  WorkItemStatus.BLOCKED,
] as const;

const WORK_STATUS_ORDER = Object.values(WorkItemStatus);
const WORK_PRIORITY_ORDER = Object.values(WorkPriority);
const WORK_TYPE_ORDER = Object.values(WorkItemType);
const ACCOUNT_ROLE_ORDER = Object.values(AccountRole) as AccountRole[];

const reportAccountOptionSelect = {
  id: true,
  role: true,
  username: true,
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
  filters: {
    status: WorkItemStatus | null;
    priority: WorkPriority | null;
    type: WorkItemType | null;
    divisionId: string | null;
    departmentId: string | null;
    employeeAccountId: string | null;
    assignedByAccountId: string | null;
    assignedToRole: AccountRole | null;
    shiftTemplateId: string | null;
    dutyStatus: WorkReportDutyStatus | null;
    location: string | null;
  };
  departmentOptions: Array<{
    id: string;
    divisionId: string;
    code: string;
    name: string;
    division: { id: string; code: string; name: string };
  }>;
  filterOptions: {
    assigners: Array<{
      id: string;
      role: AccountRole;
      username: string | null;
      employee: {
        id: string;
        empId: string;
        empName: string;
        designation: string | null;
        divisionId: string | null;
        departmentId: string | null;
      } | null;
    }>;
    assignedToRoles: AccountRole[];
  };
  work: {
    totals: {
      created: number;
      activeAtEnd: number;
      dueDuring: number;
      overdueAtEnd: number;
      closedDuring: number;
      completedDuring: number;
      reopenedTickets: number;
      cancelledTickets: number;
      uniqueAssignees: number;
      completionRate: number | null;
      averageClosureHours: number | null;
    };
    byStatus: Array<{ key: WorkItemStatus; count: number }>;
    byPriority: Array<{ key: WorkPriority; count: number }>;
    byType: Array<{ key: WorkItemType; count: number }>;
  };
  completion: {
    submitted: number;
    accepted: number;
    informationRequested: number;
    rejected: number;
    fullyResolved: number;
    temporarySolution: number;
    unableToResolve: number;
    moreWorkRequired: number;
    acceptanceRate: number | null;
  };
  help: {
    requested: number;
    accepted: number;
    declined: number;
    pending: number;
    cancelled: number;
    crossDepartment: number;
  };
  duty: {
    scheduled: number;
    cancelled: number;
    uniqueEmployees: number;
    leaveDays: number;
    holidayDays: number;
    scheduledHours: number;
    conflictOverrides: number;
    hierarchyOverrides: number;
    superAdminOverrides: number;
    nightAssignments: number;
    weekendAssignments: number;
    byShift: Array<{ shiftTemplateId: string; name: string; count: number }>;
    coverage: {
      configured: boolean;
      requiredCoverage: number | null;
      coveredPositions: number | null;
      coveragePercentage: number | null;
      unfilledShifts: number | null;
      reason: string;
    };
  };
  trend: Array<{
    date: string;
    workCreated: number;
    workClosed: number;
    helpRequested: number;
    dutyScheduled: number;
  }>;
  departments: Array<{
    departmentId: string;
    code: string;
    name: string;
    workCreated: number;
    workClosed: number;
    activeWork: number;
    overdueWork: number;
    completionRate: number | null;
    dutyCoverage: number | null;
    leaveDays: number;
    conflicts: number;
    helpRequested: number;
    dutyScheduled: number;
  }>;
  divisions: Array<{
    divisionId: string;
    code: string;
    name: string;
    workCreated: number;
    workClosed: number;
    activeWork: number;
    overdueWork: number;
    completionRate: number | null;
    dutyCoverage: number | null;
    leaveDays: number;
    conflicts: number;
    helpRequested: number;
    dutyScheduled: number;
  }>;
  exceptions: {
    criticalActive: number;
    seriouslyOverdue: number;
    awaitingReview: number;
    pendingHelp: number;
  };
  assignmentFlow: {
    assignedByRole: Array<{ key: AccountRole; count: number }>;
    assignedToRole: Array<{ key: AccountRole; count: number }>;
  };
  workload: {
    level: 'EMPLOYEE' | 'DEPARTMENT' | 'DIVISION';
    rows: Array<{
      id: string;
      code: string;
      name: string;
      activeWork: number;
      criticalWork: number;
      overdueWork: number;
      scheduledHours: number;
    }>;
  };
  retention: {
    archived: number;
    eligibleForReview: number;
    held: number;
    deletionRequested: number;
  } | null;
  reportNotice: string;
}

export interface DailyWorkPerformanceCounts {
  assigned: number;
  completed: number;
  pending: number;
}

export interface DailyWorkPerformanceTicket {
  id: string;
  ticketNumber: string;
  title: string;
  type: WorkItemType;
  priority: WorkPriority;
  status: WorkItemStatus;
  customerName: string | null;
  serviceNumber: string | null;
  location: string | null;
  plannedStartAt: string | null;
  dueAt: string;
  closedAt: string | null;
  pendingReason: string | null;
}

export interface DailyWorkPerformanceRow {
  accountId: string;
  employeeId: string;
  employeeName: string;
  designation: string | null;
  role: AccountRole;
  division: { id: string; code: string; name: string } | null;
  department: { id: string; code: string; name: string } | null;
  networkMaintenance: DailyWorkPerformanceCounts;
  newInstallation: DailyWorkPerformanceCounts;
  updateServices: DailyWorkPerformanceCounts;
  otherWork: DailyWorkPerformanceCounts;
  total: DailyWorkPerformanceCounts;
  pendingReasons: string[];
  workItems: DailyWorkPerformanceTicket[];
}

export interface DailyWorkPerformanceReport {
  timezone: typeof BRANCH_TIME_ZONE;
  generatedAt: string;
  date: string;
  scope: WorkReportSummary['scope'];
  filters: {
    divisionId: string | null;
    departmentId: string | null;
    employeeAccountId: string | null;
    search: string | null;
  };
  divisionOptions: Array<{ id: string; code: string; name: string }>;
  departmentOptions: WorkReportSummary['departmentOptions'];
  rows: DailyWorkPerformanceRow[];
  totals: {
    employees: number;
    networkMaintenance: DailyWorkPerformanceCounts;
    newInstallation: DailyWorkPerformanceCounts;
    updateServices: DailyWorkPerformanceCounts;
    otherWork: DailyWorkPerformanceCounts;
    total: DailyWorkPerformanceCounts;
  };
  note: string;
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
  priority: WorkPriority;
  status: WorkItemStatus;
  location: string | null;
  createdAt: string;
  dueAt: string;
  completedAt: string | null;
  closedAt: string | null;
  overdueDays: number;
  division: { id: string; code: string; name: string };
  department: { id: string; code: string; name: string } | null;
  primaryAssignee: string;
  assignedBy: string;
  responsibleManager: string;
  childProgress: {
    total: number;
    completed: number;
    inProgress: number;
    percentage: number | null;
  };
}

export interface WorkReportDrilldownDutyRow {
  kind: 'DUTY_ASSIGNMENT';
  id: string;
  dutyDate: string;
  startsAt: string;
  endsAt: string;
  employee: string;
  employeeRole: AccountRole;
  shift: string;
  supervisor: string;
  assignedBy: string;
  division: { id: string; code: string; name: string };
  department: { id: string; code: string; name: string } | null;
  reportingLocation: string;
  authority: DutyAssignmentAuthority;
  hierarchyOverride: boolean;
  conflictOverride: boolean;
  overrideReason: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface WorkReportDrilldownResponse {
  dataset: WorkReportDrilldownDataset;
  generatedAt: string;
  timezone: typeof BRANCH_TIME_ZONE;
  scope: WorkReportSummary['scope'];
  period: WorkReportSummary['period'];
  target: {
    type: 'EMPLOYEE' | 'DEPARTMENT' | 'DIVISION';
    id: string;
    code: string;
    name: string;
  } | null;
  summary: {
    work: WorkReportSummary['work']['totals'];
    duty: Pick<
      WorkReportSummary['duty'],
      | 'scheduled'
      | 'cancelled'
      | 'uniqueEmployees'
      | 'scheduledHours'
      | 'conflictOverrides'
      | 'hierarchyOverrides'
      | 'superAdminOverrides'
    >;
  };
  sections: {
    work: {
      pagination: WorkReportDrilldownPagination;
      rows: WorkReportDrilldownWorkRow[];
    } | null;
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

  async getDailyPerformance(
    user: AuthenticatedUser,
    query: DailyWorkReportQueryDto,
  ): Promise<DailyWorkPerformanceReport> {
    const actor = await this.workScopeService.resolveActorContext(user);
    const date = query.date ?? this.formatKathmanduDate(new Date());
    const reportQuery: WorkReportQueryDto = {
      from: date,
      to: date,
      divisionId: query.divisionId,
      departmentId: query.departmentId,
      employeeAccountId: query.employeeAccountId,
    };

    await this.assertReportFiltersInsideScope(actor, reportQuery);
    const range = this.resolveRange(reportQuery);
    const baseWorkWhere = this.buildWorkWhere(actor, reportQuery);

    const [workItems, departmentOptions, divisionOptions, scopeLabel] =
      await Promise.all([
        this.prisma.workItem.findMany({
          where: {
            AND: [
              baseWorkWhere,
              {
                OR: [
                  {
                    plannedStartAt: {
                      gte: range.start,
                      lt: range.endExclusive,
                    },
                  },
                  {
                    AND: [
                      { plannedStartAt: null },
                      {
                        createdAt: {
                          gte: range.start,
                          lt: range.endExclusive,
                        },
                      },
                    ],
                  },
                  {
                    closedAt: {
                      gte: range.start,
                      lt: range.endExclusive,
                    },
                  },
                ],
              },
            ],
          },
          orderBy: [{ plannedStartAt: 'asc' }, { ticketNumber: 'asc' }],
          select: {
            id: true,
            ticketNumber: true,
            title: true,
            type: true,
            priority: true,
            status: true,
            customerName: true,
            serviceNumber: true,
            locationText: true,
            plannedStartAt: true,
            createdAt: true,
            dueAt: true,
            closedAt: true,
            cancelledAt: true,
            assignments: {
              where: {
                assignmentRole: WorkAssignmentRole.PRIMARY,
                createdAt: { lt: range.endExclusive },
                OR: [
                  { endedAt: null },
                  { endedAt: { gte: range.start } },
                ],
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                assigneeAccountId: true,
                assignee: {
                  select: {
                    role: true,
                    username: true,
                    employee: {
                      select: {
                        empId: true,
                        empName: true,
                        designation: true,
                        division: {
                          select: { id: true, code: true, name: true },
                        },
                        departmentUnit: {
                          select: { id: true, code: true, name: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        }),
        this.listDepartmentOptions(actor),
        this.listDivisionOptions(actor),
        this.resolveScopeLabel(actor),
      ]);

    const search = query.search?.trim().toLocaleLowerCase('en-US') ?? '';
    const rowsByAccount = new Map<string, DailyWorkPerformanceRow>();

    for (const item of workItems) {
      const primaryAssignment = item.assignments[0];
      if (!primaryAssignment) continue;

      const employee = primaryAssignment.assignee.employee;
      const employeeName =
        employee?.empName ??
        primaryAssignment.assignee.username ??
        this.formatAccountRole(primaryAssignment.assignee.role);
      const employeeId =
        employee?.empId ?? this.formatAccountRole(primaryAssignment.assignee.role);
      const searchable = [
        employeeName,
        employeeId,
        employee?.designation ?? '',
        employee?.departmentUnit?.name ?? '',
        employee?.division?.name ?? '',
      ]
        .join(' ')
        .toLocaleLowerCase('en-US');

      if (search && !searchable.includes(search)) continue;

      const operationalStart = item.plannedStartAt ?? item.createdAt;
      const cancelledByDayEnd = Boolean(
        item.cancelledAt && item.cancelledAt < range.endExclusive,
      );
      const assignedToday =
        operationalStart >= range.start &&
        operationalStart < range.endExclusive &&
        !cancelledByDayEnd;
      const completedToday = Boolean(
        item.closedAt &&
          item.closedAt >= range.start &&
          item.closedAt < range.endExclusive,
      );
      const closedByDayEnd = Boolean(
        item.closedAt && item.closedAt < range.endExclusive,
      );
      const pendingAtDayEnd =
        assignedToday && !closedByDayEnd && !cancelledByDayEnd;

      if (!assignedToday && !completedToday) continue;

      let row = rowsByAccount.get(primaryAssignment.assigneeAccountId);
      if (!row) {
        row = {
          accountId: primaryAssignment.assigneeAccountId,
          employeeId,
          employeeName,
          designation: employee?.designation ?? null,
          role: primaryAssignment.assignee.role,
          division: employee?.division ?? null,
          department: employee?.departmentUnit ?? null,
          networkMaintenance: this.createDailyCounts(),
          newInstallation: this.createDailyCounts(),
          updateServices: this.createDailyCounts(),
          otherWork: this.createDailyCounts(),
          total: this.createDailyCounts(),
          pendingReasons: [],
          workItems: [],
        };
        rowsByAccount.set(primaryAssignment.assigneeAccountId, row);
      }

      const category = this.getDailyCategoryCounts(row, item.type);
      if (assignedToday) {
        category.assigned += 1;
        row.total.assigned += 1;
      }
      if (completedToday) {
        category.completed += 1;
        row.total.completed += 1;
      }
      if (pendingAtDayEnd) {
        category.pending += 1;
        row.total.pending += 1;
      }

      row.workItems.push({
        id: item.id,
        ticketNumber: item.ticketNumber,
        title: item.title,
        type: item.type,
        priority: item.priority,
        status: item.status,
        customerName: item.customerName,
        serviceNumber: item.serviceNumber,
        location: item.locationText,
        plannedStartAt: item.plannedStartAt?.toISOString() ?? null,
        dueAt: item.dueAt.toISOString(),
        closedAt: item.closedAt?.toISOString() ?? null,
        pendingReason: pendingAtDayEnd
          ? this.describeDailyPendingStatus(item.status)
          : null,
      });
    }

    const rows = [...rowsByAccount.values()]
      .map((row) => {
        const pendingCounts = new Map<string, number>();
        for (const item of row.workItems) {
          if (!item.pendingReason) continue;
          pendingCounts.set(
            item.pendingReason,
            (pendingCounts.get(item.pendingReason) ?? 0) + 1,
          );
        }
        row.pendingReasons = [...pendingCounts.entries()].map(
          ([reason, count]) => `${count} ${reason}`,
        );
        row.workItems.sort((left, right) =>
          left.ticketNumber.localeCompare(right.ticketNumber),
        );
        return row;
      })
      .sort(
        (left, right) =>
          (left.division?.name ?? '').localeCompare(
            right.division?.name ?? '',
          ) ||
          (left.department?.name ?? '').localeCompare(
            right.department?.name ?? '',
          ) ||
          left.employeeName.localeCompare(right.employeeName),
      );

    const totals = {
      employees: rows.length,
      networkMaintenance: this.createDailyCounts(),
      newInstallation: this.createDailyCounts(),
      updateServices: this.createDailyCounts(),
      otherWork: this.createDailyCounts(),
      total: this.createDailyCounts(),
    };

    for (const row of rows) {
      this.addDailyCounts(totals.networkMaintenance, row.networkMaintenance);
      this.addDailyCounts(totals.newInstallation, row.newInstallation);
      this.addDailyCounts(totals.updateServices, row.updateServices);
      this.addDailyCounts(totals.otherWork, row.otherWork);
      this.addDailyCounts(totals.total, row.total);
    }

    return {
      timezone: BRANCH_TIME_ZONE,
      generatedAt: new Date().toISOString(),
      date,
      scope: {
        role: actor.role,
        type: this.getScopeType(actor.role),
        label:
          departmentOptions.find(
            (department) => department.id === query.departmentId,
          )?.name ??
          divisionOptions.find((division) => division.id === query.divisionId)
            ?.name ??
          scopeLabel,
        divisionId: query.divisionId ?? actor.divisionId,
        departmentId: query.departmentId ?? actor.departmentId,
      },
      filters: {
        divisionId: query.divisionId ?? null,
        departmentId: query.departmentId ?? null,
        employeeAccountId: query.employeeAccountId ?? null,
        search: query.search?.trim() || null,
      },
      divisionOptions,
      departmentOptions,
      rows,
      totals,
      note:
        'Assigned counts use the planned start date, completed counts use the verified close date, and pending counts show work not closed or cancelled by the end of the selected day.',
    };
  }

  async exportDailyPerformanceCsv(
    user: AuthenticatedUser,
    query: DailyWorkReportQueryDto,
  ): Promise<WorkReportExport> {
    const report = await this.getDailyPerformance(user, query);

    return this.createCsvExport(
      `daily-performance-${report.date}.csv`,
      [
        'S.N.',
        'Division',
        'Department',
        'Employee / Team',
        'Employee ID',
        'Designation',
        'Network Maintenance Assigned',
        'Network Maintenance Completed',
        'Network Maintenance Pending',
        'New Installation Assigned',
        'New Installation Completed',
        'Update Services Assigned',
        'Update Services Completed',
        'Other Work Assigned',
        'Other Work Completed',
        'Total Assigned',
        'Total Completed',
        'Total Pending',
        'Pending Reasons',
      ],
      report.rows.map((row, index) => [
        index + 1,
        row.division?.name ?? '',
        row.department?.name ?? '',
        row.employeeName,
        row.employeeId,
        row.designation ?? '',
        row.networkMaintenance.assigned,
        row.networkMaintenance.completed,
        row.networkMaintenance.pending,
        row.newInstallation.assigned,
        row.newInstallation.completed,
        row.updateServices.assigned,
        row.updateServices.completed,
        row.otherWork.assigned,
        row.otherWork.completed,
        row.total.assigned,
        row.total.completed,
        row.total.pending,
        row.pendingReasons.join('; '),
      ]),
      report.rows.length,
    );
  }

  async getSummary(
    user: AuthenticatedUser,
    query: WorkReportQueryDto,
  ): Promise<WorkReportSummary> {
    const actor = await this.workScopeService.resolveActorContext(user);
    // One resolved actor scope is reused across work, duty, help and retention aggregates.
    const range = this.resolveRange(query);
    await this.assertReportFiltersInsideScope(actor, query);

    const baseWorkWhere = this.buildWorkWhere(actor, query);
    const baseDutyWhere = this.buildDutyWhere(actor, query);
    const cancelledDutyWhere = this.buildDutyWhere(actor, {
      ...query,
      dutyStatus: WorkReportDutyStatus.CANCELLED,
    });
    const baseExceptionWhere = this.buildDutyExceptionWhere(actor, query);
    const now = new Date();
    const overdueCutoff = new Date(
      Math.min(now.getTime(), range.endExclusive.getTime()),
    );

    const [
      createdItems,
      closedItems,
      completedItems,
      activeAtEnd,
      overdueAtEnd,
      dueDuring,
      lifecycleActivities,
      completionReports,
      helpRequests,
      dutyAssignments,
      coverageRequirements,
      cancelledDutyCount,
      dutyExceptions,
      departmentOptions,
      divisionOptions,
      scopeLabel,
      reportAssignerOptions,
    ] = await Promise.all([
      this.prisma.workItem.findMany({
        where: {
          AND: [
            baseWorkWhere,
            { createdAt: { gte: range.start, lt: range.endExclusive } },
          ],
        },
        select: {
          id: true,
          status: true,
          priority: true,
          type: true,
          divisionId: true,
          departmentId: true,
          createdAt: true,
          dueAt: true,
          closedAt: true,
          createdBy: { select: { role: true } },
          assignments: {
            where: { assignmentRole: WorkAssignmentRole.PRIMARY },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              assigneeAccountId: true,
              assignee: { select: { role: true } },
            },
          },
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
          id: true,
          divisionId: true,
          departmentId: true,
          createdAt: true,
          closedAt: true,
        },
      }),
      this.prisma.workItem.findMany({
        where: {
          AND: [
            baseWorkWhere,
            { completedAt: { gte: range.start, lt: range.endExclusive } },
          ],
        },
        select: { id: true },
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
      this.prisma.workItem.count({
        where: {
          AND: [
            baseWorkWhere,
            { dueAt: { gte: range.start, lt: range.endExclusive } },
          ],
        },
      }),
      this.prisma.workActivity.findMany({
        where: {
          createdAt: { gte: range.start, lt: range.endExclusive },
          action: {
            in: [WorkActivityAction.REOPENED, WorkActivityAction.CANCELLED],
          },
          workItem: { is: baseWorkWhere },
        },
        select: { workItemId: true, action: true },
      }),
      this.prisma.workCompletionReport.findMany({
        where: {
          createdAt: { gte: range.start, lt: range.endExclusive },
          workItem: { is: baseWorkWhere },
        },
        select: {
          result: true,
          reviewStatus: true,
          moreWorkRequired: true,
        },
      }),
      this.prisma.workHelpRequest.findMany({
        where: {
          createdAt: { gte: range.start, lt: range.endExclusive },
          workItem: { is: baseWorkWhere },
        },
        select: {
          status: true,
          requestedDepartmentId: true,
          createdAt: true,
          workItem: { select: { divisionId: true, departmentId: true } },
        },
      }),
      this.prisma.dutyAssignment.findMany({
        where: {
          AND: [
            baseDutyWhere,
            { startsAt: { gte: range.start, lt: range.endExclusive } },
          ],
        },
        select: {
          employeeAccountId: true,
          shiftTemplateId: true,
          shiftName: true,
          shiftStartMinute: true,
          shiftEndMinute: true,
          shiftSpansNextDay: true,
          divisionId: true,
          departmentId: true,
          dutyDate: true,
          startsAt: true,
          endsAt: true,
          reportingLocation: true,
          cancelledAt: true,
          authority: true,
          hierarchyOverride: true,
          conflictOverride: true,
          shift: {
            select: {
              id: true,
              name: true,
              startMinute: true,
              endMinute: true,
              spansNextDay: true,
            },
          },
          employee: {
            select: {
              role: true,
              username: true,
              employee: {
                select: {
                  empName: true,
                  empId: true,
                  divisionId: true,
                  departmentId: true,
                  division: { select: { id: true, code: true, name: true } },
                  departmentUnit: { select: { id: true, code: true, name: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.dutyCoverageRequirement.findMany({
        where: {
          AND: [
            this.buildCoverageRequirementWhere(actor, query),
            { effectiveFrom: { lt: range.endExclusive } },
            {
              OR: [
                { effectiveUntil: null },
                { effectiveUntil: { gte: range.start } },
              ],
            },
          ],
        },
        select: {
          departmentId: true,
          shiftTemplateId: true,
          dayOfWeek: true,
          requiredStaff: true,
          reportingLocation: true,
          reportingLocationKey: true,
          effectiveFrom: true,
          effectiveUntil: true,
        },
      }),
      this.prisma.dutyAssignment.count({
        where: {
          AND: [
            cancelledDutyWhere,
            { startsAt: { gte: range.start, lt: range.endExclusive } },
          ],
        },
      }),
      this.prisma.dutyException.findMany({
        where: {
          AND: [
            baseExceptionWhere,
            {
              exceptionDate: { gte: range.start, lt: range.endExclusive },
            },
          ],
        },
        select: { type: true, divisionId: true, departmentId: true },
      }),
      this.listDepartmentOptions(actor),
      this.listDivisionOptions(actor),
      this.resolveScopeLabel(actor),
      this.listReportAssignerOptions(actor),
    ]);

    // Exception cards describe work requiring action now, independent of the historical trend window.
    const [
      activeAssignments,
      criticalActive,
      seriouslyOverdue,
      awaitingReview,
      pendingHelp,
      archivedCount,
      deletionEligibleCount,
      retentionHoldCount,
      deletionRequestedCount,
    ] = await Promise.all([
      this.prisma.workAssignment.findMany({
        where: {
          endedAt: null,
          assignmentRole: WorkAssignmentRole.PRIMARY,
          workItem: { is: { AND: [baseWorkWhere, { status: { in: [...ACTIVE_WORK_STATUSES] } }] } },
        },
        select: {
          assigneeAccountId: true,
          assignee: {
            select: {
              role: true,
              username: true,
              employee: {
                select: {
                  empName: true,
                  empId: true,
                  divisionId: true,
                  departmentId: true,
                  division: { select: { id: true, code: true, name: true } },
                  departmentUnit: { select: { id: true, code: true, name: true } },
                },
              },
            },
          },
          workItem: {
            select: {
              id: true,
              divisionId: true,
              departmentId: true,
              priority: true,
              dueAt: true,
            },
          },
        },
      }),
      this.prisma.workItem.count({
        where: { AND: [baseWorkWhere, { status: { in: [...ACTIVE_WORK_STATUSES] }, priority: WorkPriority.CRITICAL }] },
      }),
      this.prisma.workItem.count({
        where: {
          AND: [
            baseWorkWhere,
            {
              status: { in: [...ACTIVE_WORK_STATUSES] },
              dueAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
            },
          ],
        },
      }),
      this.prisma.workItem.count({
        where: { AND: [baseWorkWhere, { status: WorkItemStatus.COMPLETED_PENDING_REVIEW }] },
      }),
      this.prisma.workHelpRequest.count({
        where: { status: WorkHelpRequestStatus.PENDING, workItem: { is: baseWorkWhere } },
      }),
      actor.role === AccountRole.SUPER_ADMIN
        ? this.prisma.workItem.count({
            where: { AND: [baseWorkWhere, { archiveEligibleAt: { lte: now } }] },
          })
        : Promise.resolve(0),
      actor.role === AccountRole.SUPER_ADMIN
        ? this.prisma.workItem.count({
            where: {
              AND: [
                baseWorkWhere,
                { deletionEligibleAt: { lte: now }, retentionHoldAt: null },
              ],
            },
          })
        : Promise.resolve(0),
      actor.role === AccountRole.SUPER_ADMIN
        ? this.prisma.workItem.count({
            where: { AND: [baseWorkWhere, { retentionHoldAt: { not: null } }] },
          })
        : Promise.resolve(0),
      actor.role === AccountRole.SUPER_ADMIN
        ? this.prisma.workItem.count({
            where: { AND: [baseWorkWhere, { deletionRequestedAt: { not: null } }] },
          })
        : Promise.resolve(0),
    ]);

    const reopenedTickets = new Set(
      lifecycleActivities
        .filter((activity) => activity.action === WorkActivityAction.REOPENED)
        .map((activity) => activity.workItemId),
    ).size;
    const cancelledTickets = new Set(
      lifecycleActivities
        .filter((activity) => activity.action === WorkActivityAction.CANCELLED)
        .map((activity) => activity.workItemId),
    ).size;
    const primaryAssignees = new Set(
      createdItems.flatMap((item) =>
        item.assignments.map((assignment) => assignment.assigneeAccountId),
      ),
    );
    const closureDurations = closedItems.flatMap((item) =>
      item.closedAt
        ? [
            Math.max(
              0,
              (item.closedAt.getTime() - item.createdAt.getTime()) /
                (60 * 60 * 1000),
            ),
          ]
        : [],
    );
    const acceptedCompletionCount = completionReports.filter(
      (report) => report.reviewStatus === WorkCompletionReviewStatus.ACCEPTED,
    ).length;
    const createdAndClosedCount = createdItems.filter(
      (item) => item.closedAt && item.closedAt < range.endExclusive,
    ).length;
    const normalizedDutyAssignments = dutyAssignments.map((assignment) => {
      const shiftName = assignment.shiftName ?? assignment.shift?.name ?? 'Deleted shift';
      const startMinute =
        assignment.shiftStartMinute ?? assignment.shift?.startMinute ?? 0;
      const endMinute =
        assignment.shiftEndMinute ?? assignment.shift?.endMinute ?? 0;

      return {
        ...assignment,
        shift: {
          id:
            assignment.shift?.id ??
            assignment.shiftTemplateId ??
            `deleted:${shiftName}:${startMinute}:${endMinute}`,
          name: shiftName,
          startMinute,
          endMinute,
          spansNextDay:
            assignment.shiftSpansNextDay ??
            assignment.shift?.spansNextDay ??
            false,
        },
      };
    });
    const activeDutyAssignments = normalizedDutyAssignments.filter(
      (assignment) => !assignment.cancelledAt,
    );

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
      filters: {
        status: query.status ?? null,
        priority: query.priority ?? null,
        type: query.type ?? null,
        divisionId: query.divisionId ?? null,
        departmentId: query.departmentId ?? null,
        employeeAccountId: query.employeeAccountId ?? null,
        assignedByAccountId: query.assignedByAccountId ?? null,
        assignedToRole: query.assignedToRole ?? null,
        shiftTemplateId: query.shiftTemplateId ?? null,
        dutyStatus: query.dutyStatus ?? null,
        location: query.location?.trim() || null,
      },
      departmentOptions,
      filterOptions: {
        assigners: reportAssignerOptions,
        assignedToRoles: this.getReportAssignedToRoles(actor.role),
      },
      work: {
        totals: {
          created: createdItems.length,
          activeAtEnd,
          dueDuring,
          overdueAtEnd,
          closedDuring: closedItems.length,
          completedDuring: completedItems.length,
          reopenedTickets,
          cancelledTickets,
          uniqueAssignees: primaryAssignees.size,
          completionRate:
            createdItems.length > 0
              ? this.round((createdAndClosedCount / createdItems.length) * 100, 1)
              : null,
          averageClosureHours:
            closureDurations.length > 0
              ? this.round(
                  closureDurations.reduce((sum, value) => sum + value, 0) /
                    closureDurations.length,
                  1,
                )
              : null,
        },
        byStatus: this.countByEnum(
          WORK_STATUS_ORDER,
          createdItems.map((item) => item.status),
        ),
        byPriority: this.countByEnum(
          WORK_PRIORITY_ORDER,
          createdItems.map((item) => item.priority),
        ),
        byType: this.countByEnum(
          WORK_TYPE_ORDER,
          createdItems.map((item) => item.type),
        ),
      },
      completion: {
        submitted: completionReports.length,
        accepted: acceptedCompletionCount,
        informationRequested: completionReports.filter(
          (report) =>
            report.reviewStatus ===
            WorkCompletionReviewStatus.INFORMATION_REQUESTED,
        ).length,
        rejected: completionReports.filter(
          (report) => report.reviewStatus === WorkCompletionReviewStatus.REJECTED,
        ).length,
        fullyResolved: completionReports.filter(
          (report) => report.result === WorkCompletionResult.FULLY_RESOLVED,
        ).length,
        temporarySolution: completionReports.filter(
          (report) => report.result === WorkCompletionResult.TEMPORARY_SOLUTION,
        ).length,
        unableToResolve: completionReports.filter(
          (report) => report.result === WorkCompletionResult.UNABLE_TO_RESOLVE,
        ).length,
        moreWorkRequired: completionReports.filter(
          (report) => report.moreWorkRequired,
        ).length,
        acceptanceRate:
          completionReports.length > 0
            ? this.round(
                (acceptedCompletionCount / completionReports.length) * 100,
                1,
              )
            : null,
      },
      help: {
        requested: helpRequests.length,
        accepted: helpRequests.filter(
          (request) => request.status === WorkHelpRequestStatus.ACCEPTED,
        ).length,
        declined: helpRequests.filter(
          (request) => request.status === WorkHelpRequestStatus.DECLINED,
        ).length,
        pending: helpRequests.filter(
          (request) => request.status === WorkHelpRequestStatus.PENDING,
        ).length,
        cancelled: helpRequests.filter(
          (request) => request.status === WorkHelpRequestStatus.CANCELLED,
        ).length,
        crossDepartment: helpRequests.filter(
          (request) => request.requestedDepartmentId !== null,
        ).length,
      },
      duty: this.buildDutyMetrics(
        activeDutyAssignments,
        cancelledDutyCount,
        dutyExceptions,
        coverageRequirements,
        range,
        query,
        actor,
      ),
      trend: this.buildTrend(
        range,
        createdItems,
        closedItems,
        helpRequests,
        activeDutyAssignments,
      ),
      departments: this.buildDepartmentBreakdown(
        actor,
        departmentOptions,
        createdItems,
        closedItems,
        helpRequests,
        activeDutyAssignments,
        activeAssignments,
        dutyExceptions,
        coverageRequirements,
        range,
        query,
        overdueCutoff,
      ),
      divisions: this.buildDivisionBreakdown(
        actor,
        divisionOptions,
        departmentOptions,
        createdItems,
        closedItems,
        helpRequests,
        activeDutyAssignments,
        activeAssignments,
        dutyExceptions,
        coverageRequirements,
        range,
        query,
        overdueCutoff,
      ),
      exceptions: {
        criticalActive,
        seriouslyOverdue,
        awaitingReview,
        pendingHelp,
      },
      // Role-level delegation counts avoid exposing private contact details in management reports.
      assignmentFlow: {
        assignedByRole: this.countByEnum(
          ACCOUNT_ROLE_ORDER,
          createdItems.map((item) => item.createdBy.role),
        ),
        assignedToRole: this.countByEnum(
          ACCOUNT_ROLE_ORDER,
          createdItems.flatMap((item) =>
            item.assignments.map((assignment) => assignment.assignee.role),
          ),
        ),
      },
      // Workload combines active responsibility with planned duty hours, never attendance.
      workload: this.buildRoleWorkload(
        actor,
        activeAssignments,
        activeDutyAssignments,
        now,
      ),
      retention:
        actor.role === AccountRole.SUPER_ADMIN
          ? {
              archived: archivedCount,
              eligibleForReview: deletionEligibleCount,
              held: retentionHoldCount,
              deletionRequested: deletionRequestedCount,
            }
          : null,
      reportNotice:
        actor.role === AccountRole.EMPLOYEE
          ? 'This report contains only your own assigned work, help activity and planned duty schedule.'
          : 'This report contains operational aggregates inside your current authorized organization scope. Duty data represents planned schedules, not verified attendance.',
    };
  }

  async getDrilldown(
    user: AuthenticatedUser,
    query: WorkReportDrilldownQueryDto,
  ): Promise<WorkReportDrilldownResponse> {
    const actor = await this.workScopeService.resolveActorContext(user);
    const range = this.resolveRange(query);
    await this.assertReportFiltersInsideScope(actor, query);
    this.assertDrilldownTarget(actor, query);

    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const target = await this.resolveDrilldownTarget(query);
    const summary = await this.getSummary(user, query);

    const includesWork = new Set<WorkReportDrilldownDataset>([
      WorkReportDrilldownDataset.OVERDUE_WORK,
      WorkReportDrilldownDataset.EMPLOYEE_PERFORMANCE,
      WorkReportDrilldownDataset.DEPARTMENT_SUMMARY,
      WorkReportDrilldownDataset.DIVISION_SUMMARY,
    ]).has(query.dataset);
    const includesDuty = new Set<WorkReportDrilldownDataset>([
      WorkReportDrilldownDataset.EMPLOYEE_PERFORMANCE,
      WorkReportDrilldownDataset.DEPARTMENT_SUMMARY,
      WorkReportDrilldownDataset.DIVISION_SUMMARY,
      WorkReportDrilldownDataset.DUTY_CONFLICT_OVERRIDES,
      WorkReportDrilldownDataset.DUTY_CANCELLATIONS,
    ]).has(query.dataset);

    const [workSection, dutySection] = await Promise.all([
      includesWork
        ? this.listDrilldownWorkRows(actor, range, query, page, limit)
        : Promise.resolve(null),
      includesDuty
        ? this.listDrilldownDutyRows(actor, range, query, page, limit)
        : Promise.resolve(null),
    ]);

    return {
      dataset: query.dataset,
      generatedAt: new Date().toISOString(),
      timezone: BRANCH_TIME_ZONE,
      scope: summary.scope,
      period: summary.period,
      target,
      summary: {
        work: summary.work.totals,
        duty: {
          scheduled: summary.duty.scheduled,
          cancelled: summary.duty.cancelled,
          uniqueEmployees: summary.duty.uniqueEmployees,
          scheduledHours: summary.duty.scheduledHours,
          conflictOverrides: summary.duty.conflictOverrides,
          hierarchyOverrides: summary.duty.hierarchyOverrides,
          superAdminOverrides: summary.duty.superAdminOverrides,
        },
      },
      sections: {
        work: workSection,
        duty: dutySection,
      },
      notice:
        query.dataset === WorkReportDrilldownDataset.DUTY_CONFLICT_OVERRIDES
          ? 'This view contains assignments where an authorized conflict override was recorded. It is not a list of every potential scheduling conflict.'
          : 'Drill-down records are paginated inside the current authorized organization scope. Duty records represent planned schedules, not verified attendance.',
    };
  }

  private assertDrilldownTarget(
    actor: WorkActorContext,
    query: WorkReportDrilldownQueryDto,
  ): void {
    if (
      query.dataset === WorkReportDrilldownDataset.EMPLOYEE_PERFORMANCE &&
      !query.employeeAccountId
    ) {
      throw new BadRequestException(
        'Employee performance drill-down requires an employee account.',
      );
    }

    if (
      query.dataset === WorkReportDrilldownDataset.DEPARTMENT_SUMMARY &&
      !query.departmentId
    ) {
      throw new BadRequestException(
        'Department summary drill-down requires a department.',
      );
    }

    if (
      query.dataset === WorkReportDrilldownDataset.DIVISION_SUMMARY &&
      !query.divisionId
    ) {
      throw new BadRequestException(
        'Division summary drill-down requires a division.',
      );
    }

    if (
      query.dataset === WorkReportDrilldownDataset.DIVISION_SUMMARY &&
      actor.role !== AccountRole.SUPER_ADMIN &&
      actor.role !== AccountRole.SENIOR_MANAGEMENT
    ) {
      throw new ForbiddenException(
        'Division summary drill-down is available only to authorized division or branch management.',
      );
    }
  }

  private async resolveDrilldownTarget(
    query: WorkReportDrilldownQueryDto,
  ): Promise<WorkReportDrilldownResponse['target']> {
    if (query.dataset === WorkReportDrilldownDataset.EMPLOYEE_PERFORMANCE) {
      const account = await this.prisma.account.findFirst({
        where: { id: query.employeeAccountId, isEnabled: true },
        select: {
          id: true,
          role: true,
          username: true,
          employee: { select: { empId: true, empName: true } },
        },
      });
      if (!account) {
        throw new ForbiddenException(
          'The selected employee is outside your authorized report scope.',
        );
      }
      return {
        type: 'EMPLOYEE',
        id: account.id,
        code: account.employee?.empId ?? account.role,
        name:
          account.employee?.empName ??
          (account.username && !account.username.includes('@')
            ? account.username
            : account.role),
      };
    }

    if (query.dataset === WorkReportDrilldownDataset.DEPARTMENT_SUMMARY) {
      const department = await this.prisma.department.findUnique({
        where: { id: query.departmentId },
        select: { id: true, code: true, name: true },
      });
      if (!department) {
        throw new ForbiddenException(
          'The selected department is outside your authorized report scope.',
        );
      }
      return { type: 'DEPARTMENT', ...department };
    }

    if (query.dataset === WorkReportDrilldownDataset.DIVISION_SUMMARY) {
      const division = await this.prisma.division.findUnique({
        where: { id: query.divisionId },
        select: { id: true, code: true, name: true },
      });
      if (!division) {
        throw new ForbiddenException(
          'The selected division is outside your authorized report scope.',
        );
      }
      return { type: 'DIVISION', ...division };
    }

    return null;
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
    const datasetFilter: Prisma.WorkItemWhereInput =
      query.dataset === WorkReportDrilldownDataset.OVERDUE_WORK
        ? {
            dueAt: { lt: cutoff },
            status: { in: [...ACTIVE_WORK_STATUSES] },
          }
        : {};
    const where: Prisma.WorkItemWhereInput = {
      AND: [baseWhere, periodRelevance, datasetFilter],
    };
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      this.prisma.workItem.findMany({
        where,
        orderBy:
          query.dataset === WorkReportDrilldownDataset.OVERDUE_WORK
            ? [
                { priority: 'desc' },
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
          priority: true,
          status: true,
          locationText: true,
          createdAt: true,
          dueAt: true,
          completedAt: true,
          closedAt: true,
          division: { select: { id: true, code: true, name: true } },
          department: { select: { id: true, code: true, name: true } },
          responsibleManager: {
            select: {
              username: true,
              employee: { select: { empName: true, empId: true } },
            },
          },
          assignments: {
            where: {
              assignmentRole: WorkAssignmentRole.PRIMARY,
              endedAt: null,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              assignee: {
                select: {
                  username: true,
                  employee: { select: { empName: true, empId: true } },
                },
              },
              assignedBy: {
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
        const primary = record.assignments[0];
        return {
          kind: 'WORK_ITEM',
          id: record.id,
          ticketNumber: record.ticketNumber,
          title: record.title,
          type: record.type,
          priority: record.priority,
          status: record.status,
          location: record.locationText,
          createdAt: record.createdAt.toISOString(),
          dueAt: record.dueAt.toISOString(),
          completedAt: record.completedAt?.toISOString() ?? null,
          closedAt: record.closedAt?.toISOString() ?? null,
          overdueDays: Math.max(
            0,
            Math.floor((cutoff.getTime() - record.dueAt.getTime()) / DAY_MS),
          ),
          division: record.division,
          department: record.department,
          primaryAssignee: this.accountName(primary?.assignee),
          assignedBy: this.accountName(primary?.assignedBy),
          responsibleManager: this.accountName(record.responsibleManager),
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
    const datasetFilter: Prisma.DutyAssignmentWhereInput =
      query.dataset === WorkReportDrilldownDataset.DUTY_CONFLICT_OVERRIDES
        ? {
            startsAt: { gte: range.start, lt: range.endExclusive },
            conflictOverride: true,
          }
        : query.dataset === WorkReportDrilldownDataset.DUTY_CANCELLATIONS
          ? {
              cancelledAt: { gte: range.start, lt: range.endExclusive },
            }
          : {
              startsAt: { gte: range.start, lt: range.endExclusive },
            };
    const where: Prisma.DutyAssignmentWhereInput = {
      AND: [baseWhere, datasetFilter],
    };
    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      this.prisma.dutyAssignment.findMany({
        where,
        orderBy:
          query.dataset === WorkReportDrilldownDataset.DUTY_CANCELLATIONS
            ? [{ cancelledAt: 'desc' }, { startsAt: 'desc' }]
            : [{ startsAt: 'asc' }, { employeeAccountId: 'asc' }],
        skip,
        take: limit,
        select: {
          id: true,
          dutyDate: true,
          startsAt: true,
          endsAt: true,
          reportingLocation: true,
          authority: true,
          overrideReason: true,
          hierarchyOverride: true,
          conflictOverride: true,
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
          supervisor: {
            select: {
              username: true,
              employee: { select: { empName: true, empId: true } },
            },
          },
          createdBy: {
            select: {
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
        employeeRole: record.employee.role,
        shift: record.shift?.name ?? record.shiftName ?? 'Deleted shift',
        supervisor: this.accountName(record.supervisor),
        assignedBy: this.accountName(record.createdBy),
        division: record.division,
        department: record.department,
        reportingLocation: record.reportingLocation,
        authority: record.authority,
        hierarchyOverride: record.hierarchyOverride,
        conflictOverride: record.conflictOverride,
        overrideReason: record.overrideReason,
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

    if (query.dataset === WorkReportDataset.WORK_ITEMS) {
      return this.exportWorkItems(actor, range, query);
    }

    if (query.dataset === WorkReportDataset.DUTY_ASSIGNMENTS) {
      return this.exportDutyAssignments(actor, range, query);
    }

    if (query.dataset === WorkReportDataset.HELP_REQUESTS) {
      return this.exportHelpRequests(actor, range, query);
    }

    // Retention exports are branch-governance records and remain Super Admin-only.
    if (actor.role !== AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        'Only Super Admin can export the retention-review register.',
      );
    }

    return this.exportRetentionReview(actor, query);
  }

  private exportSummary(summary: WorkReportSummary): WorkReportExport {
    const rows: Array<[string, string, string | number | null]> = [
      ['Scope', 'Role', summary.scope.role],
      ['Scope', 'Label', summary.scope.label],
      ['Period', 'From', summary.period.from],
      ['Period', 'To', summary.period.to],
      ['Work', 'Created', summary.work.totals.created],
      ['Work', 'Active at period end', summary.work.totals.activeAtEnd],
      ['Work', 'Overdue at period end', summary.work.totals.overdueAtEnd],
      ['Work', 'Closed during period', summary.work.totals.closedDuring],
      ['Work', 'Completion rate (%)', summary.work.totals.completionRate],
      ['Work', 'Average closure hours', summary.work.totals.averageClosureHours],
      ['Completion', 'Reports submitted', summary.completion.submitted],
      ['Completion', 'Accepted', summary.completion.accepted],
      ['Completion', 'Acceptance rate (%)', summary.completion.acceptanceRate],
      ['Help', 'Requested', summary.help.requested],
      ['Help', 'Pending', summary.help.pending],
      ['Help', 'Cross-department', summary.help.crossDepartment],
      ['Duty', 'Scheduled assignments', summary.duty.scheduled],
      ['Duty', 'Cancelled assignments', summary.duty.cancelled],
      ['Duty', 'Unique scheduled employees', summary.duty.uniqueEmployees],
      ['Duty', 'Scheduled hours', summary.duty.scheduledHours],
      ['Duty', 'Night assignments', summary.duty.nightAssignments],
      ['Duty', 'Weekend assignments', summary.duty.weekendAssignments],
      ['Duty', 'Conflict overrides', summary.duty.conflictOverrides],
      ['Duty', 'Hierarchy overrides', summary.duty.hierarchyOverrides],
      ['Duty', 'Super Admin overrides', summary.duty.superAdminOverrides],
      ['Duty', 'Required coverage', summary.duty.coverage.requiredCoverage],
      ['Duty', 'Covered positions', summary.duty.coverage.coveredPositions],
      ['Duty', 'Coverage percentage', summary.duty.coverage.coveragePercentage],
      ['Duty', 'Unfilled shifts', summary.duty.coverage.unfilledShifts],
      ['Duty', 'Coverage note', summary.duty.coverage.reason],
      ['Exceptions', 'Critical active', summary.exceptions.criticalActive],
      ['Exceptions', 'Seriously overdue', summary.exceptions.seriouslyOverdue],
      ['Exceptions', 'Awaiting review', summary.exceptions.awaitingReview],
      ['Exceptions', 'Pending help', summary.exceptions.pendingHelp],
    ];

    if (summary.retention) {
      rows.push(
        ['Retention', 'Archived', summary.retention.archived],
        ['Retention', 'Eligible for review', summary.retention.eligibleForReview],
        ['Retention', 'Held', summary.retention.held],
        ['Retention', 'Deletion requested', summary.retention.deletionRequested],
      );
    }

    // Summary exports contain management aggregates only; private contact details and message content never enter the dataset.
    return this.createCsvExport(
      `work-summary-${summary.period.from}-to-${summary.period.to}.csv`,
      ['Section', 'Metric', 'Value'],
      rows,
      rows.length,
    );
  }

  private async exportWorkItems(
    actor: WorkActorContext,
    range: ReportRange,
    query: WorkReportQueryDto,
  ): Promise<WorkReportExport> {
    const where: Prisma.WorkItemWhereInput = {
      AND: [
        this.buildWorkWhere(actor, query),
        { createdAt: { gte: range.start, lt: range.endExclusive } },
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.workItem.count({ where }),
      this.prisma.workItem.findMany({
        where,
        take: MAX_EXPORT_ROWS,
        orderBy: [{ createdAt: 'desc' }, { ticketNumber: 'desc' }],
        select: {
          ticketNumber: true,
          title: true,
          category: true,
          type: true,
          priority: true,
          status: true,
          locationText: true,
          createdAt: true,
          dueAt: true,
          completedAt: true,
          closedAt: true,
          division: { select: { code: true, name: true } },
          department: { select: { code: true, name: true } },
          responsibleManager: {
            select: {
              username: true,
              employee: { select: { empName: true, empId: true } },
            },
          },
          assignments: {
            where: { assignmentRole: WorkAssignmentRole.PRIMARY },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
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
      `work-items-${range.from}-to-${range.to}.csv`,
      [
        'Ticket Number',
        'Title',
        'Type',
        'Priority',
        'Status',
        'Category',
        'Division',
        'Department',
        'Primary Employee',
        'Responsible Manager',
        'Location',
        'Created At',
        'Due At',
        'Completed At',
        'Closed At',
      ],
      rows.map((row) => [
        row.ticketNumber,
        row.title,
        row.type,
        row.priority,
        row.status,
        row.category ?? '',
        `${row.division.code} - ${row.division.name}`,
        row.department
          ? `${row.department.code} - ${row.department.name}`
          : 'Division-level responsibility',
        this.accountName(row.assignments[0]?.assignee),
        this.accountName(row.responsibleManager),
        row.locationText ?? '',
        row.createdAt.toISOString(),
        row.dueAt.toISOString(),
        row.completedAt?.toISOString() ?? '',
        row.closedAt?.toISOString() ?? '',
      ]),
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
        take: MAX_EXPORT_ROWS,
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

  private async exportHelpRequests(
    actor: WorkActorContext,
    range: ReportRange,
    query: WorkReportQueryDto,
  ): Promise<WorkReportExport> {
    const where: Prisma.WorkHelpRequestWhereInput = {
      createdAt: { gte: range.start, lt: range.endExclusive },
      workItem: { is: this.buildWorkWhere(actor, query) },
    };
    const [total, rows] = await Promise.all([
      this.prisma.workHelpRequest.count({ where }),
      this.prisma.workHelpRequest.findMany({
        where,
        take: MAX_EXPORT_ROWS,
        orderBy: { createdAt: 'desc' },
        select: {
          reason: true,
          note: true,
          status: true,
          responseNote: true,
          createdAt: true,
          respondedAt: true,
          workItem: {
            select: {
              ticketNumber: true,
              title: true,
              department: { select: { code: true, name: true } },
            },
          },
          requestedBy: {
            select: {
              username: true,
              employee: { select: { empName: true, empId: true } },
            },
          },
          requestedHelper: {
            select: {
              username: true,
              employee: { select: { empName: true, empId: true } },
            },
          },
          requestedDepartment: { select: { code: true, name: true } },
        },
      }),
    ]);

    return this.createCsvExport(
      `help-requests-${range.from}-to-${range.to}.csv`,
      [
        'Ticket Number',
        'Work Title',
        'Work Department',
        'Requested By',
        'Requested Helper',
        'Requested Department',
        'Reason',
        'Status',
        'Request Note',
        'Response Note',
        'Requested At',
        'Responded At',
      ],
      rows.map((row) => [
        row.workItem.ticketNumber,
        row.workItem.title,
        // Division-level management work has no department label by design.
        row.workItem.department
          ? `${row.workItem.department.code} - ${row.workItem.department.name}`
          : 'Division-level responsibility',
        this.accountName(row.requestedBy),
        this.accountName(row.requestedHelper),
        row.requestedDepartment
          ? `${row.requestedDepartment.code} - ${row.requestedDepartment.name}`
          : '',
        row.reason,
        row.status,
        row.note ?? '',
        row.responseNote ?? '',
        row.createdAt.toISOString(),
        row.respondedAt?.toISOString() ?? '',
      ]),
      total,
    );
  }

  private async exportRetentionReview(
    actor: WorkActorContext,
    query: WorkReportQueryDto,
  ): Promise<WorkReportExport> {
    const now = new Date();
    // The register is current-state evidence only; exporting it cannot alter retention state.
    const where: Prisma.WorkItemWhereInput = {
      AND: [
        this.buildWorkWhere(actor, query),
        { archiveEligibleAt: { lte: now } },
      ],
    };
    const [total, rows] = await Promise.all([
      this.prisma.workItem.count({ where }),
      this.prisma.workItem.findMany({
        where,
        take: MAX_EXPORT_ROWS,
        orderBy: [
          { deletionRequestedAt: 'desc' },
          { retentionHoldAt: 'desc' },
          { deletionEligibleAt: 'asc' },
          { ticketNumber: 'asc' },
        ],
        select: {
          ticketNumber: true,
          title: true,
          status: true,
          closedAt: true,
          cancelledAt: true,
          archiveEligibleAt: true,
          deletionEligibleAt: true,
          retentionHoldAt: true,
          retentionHoldReason: true,
          deletionRequestedAt: true,
          deletionRequestReason: true,
          division: { select: { code: true, name: true } },
          department: { select: { code: true, name: true } },
        },
      }),
    ]);

    return this.createCsvExport(
      `retention-review-${this.formatKathmanduDate(now)}.csv`,
      [
        'Ticket Number',
        'Title',
        'Status',
        'Division',
        'Department',
        'Terminal Date',
        'Archive Eligible At',
        'Deletion Review Eligible At',
        'Retention State',
        'Retention Hold Reason',
        'Deletion Review Requested At',
        'Deletion Review Reason',
      ],
      rows.map((row) => [
        row.ticketNumber,
        row.title,
        row.status,
        `${row.division.code} - ${row.division.name}`,
        row.department
          ? `${row.department.code} - ${row.department.name}`
          : 'Division-level responsibility',
        (row.closedAt ?? row.cancelledAt)?.toISOString() ?? '',
        row.archiveEligibleAt?.toISOString() ?? '',
        row.deletionEligibleAt?.toISOString() ?? '',
        row.retentionHoldAt
          ? 'RETENTION_HOLD'
          : row.deletionRequestedAt
            ? 'DELETION_REVIEW_REQUESTED'
            : row.deletionEligibleAt && row.deletionEligibleAt <= now
              ? 'ELIGIBLE_FOR_REVIEW'
              : 'ARCHIVED',
        row.retentionHoldReason ?? '',
        row.deletionRequestedAt?.toISOString() ?? '',
        row.deletionRequestReason ?? '',
      ]),
      total,
    );
  }

  private buildWorkWhere(
    actor: WorkActorContext,
    query: WorkReportQueryDto,
  ): Prisma.WorkItemWhereInput {
    const filter: Prisma.WorkItemWhereInput = {};

    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.type) filter.type = query.type;
    if (query.divisionId) filter.divisionId = query.divisionId;
    if (query.departmentId) filter.departmentId = query.departmentId;
    if (query.location?.trim()) {
      filter.locationText = {
        contains: query.location.trim(),
        mode: 'insensitive',
      };
    }

    const assignmentFilter: Prisma.WorkAssignmentWhereInput = {
      assignmentRole: WorkAssignmentRole.PRIMARY,
    };
    let hasAssignmentFilter = false;

    if (query.employeeAccountId) {
      assignmentFilter.assigneeAccountId = query.employeeAccountId;
      hasAssignmentFilter = true;
    }
    if (query.assignedByAccountId) {
      assignmentFilter.assignedByAccountId = query.assignedByAccountId;
      hasAssignmentFilter = true;
    }
    if (query.assignedToRole) {
      assignmentFilter.assignee = { is: { role: query.assignedToRole } };
      hasAssignmentFilter = true;
    }
    if (hasAssignmentFilter) {
      // Assignment filters are combined into one relation predicate so different historical assignees cannot satisfy different parts of the same filter.
      filter.assignments = { some: assignmentFilter };
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
    if (query.employeeAccountId) {
      where.employeeAccountId = query.employeeAccountId;
    }
    if (query.assignedByAccountId) {
      where.createdByAccountId = query.assignedByAccountId;
    }
    if (query.assignedToRole) {
      where.employee = { is: { role: query.assignedToRole } };
    }
    if (query.shiftTemplateId) {
      where.shiftTemplateId = query.shiftTemplateId;
    }
    if (query.dutyStatus === WorkReportDutyStatus.SCHEDULED) {
      where.cancelledAt = null;
    }
    if (query.dutyStatus === WorkReportDutyStatus.CANCELLED) {
      where.cancelledAt = { not: null };
    }
    if (query.location?.trim()) {
      where.reportingLocation = {
        contains: query.location.trim(),
        mode: 'insensitive',
      };
    }

    return where;
  }

  private buildCoverageRequirementWhere(
    actor: WorkActorContext,
    query: WorkReportQueryDto,
  ): Prisma.DutyCoverageRequirementWhereInput {
    const conditions: Prisma.DutyCoverageRequirementWhereInput[] = [];

    if (actor.role === AccountRole.EMPLOYEE) {
      conditions.push({
        departmentId: actor.departmentId ?? '__missing_department__',
      });
    } else if (actor.role === AccountRole.TEAM_MANAGER) {
      conditions.push({
        departmentId: actor.departmentId ?? '__missing_department__',
      });
    } else if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      conditions.push({
        department: {
          is: { divisionId: actor.divisionId ?? '__missing_division__' },
        },
      });
    }

    if (query.divisionId) {
      conditions.push({ department: { is: { divisionId: query.divisionId } } });
    }
    if (query.departmentId) {
      conditions.push({ departmentId: query.departmentId });
    }
    if (query.shiftTemplateId) {
      conditions.push({ shiftTemplateId: query.shiftTemplateId });
    }
    if (query.location?.trim()) {
      // Location-filtered coverage uses only explicitly configured locations; generic targets cannot be safely allocated to one site.
      conditions.push({
        reportingLocation: {
          contains: query.location.trim(),
          mode: 'insensitive',
        },
      });
    }

    return conditions.length > 0 ? { AND: conditions } : {};
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
    if (query.employeeAccountId) {
      where.employeeAccountId = query.employeeAccountId;
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
    await this.assertEmployeeInsideScope(actor, query.employeeAccountId);
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

  private async assertEmployeeInsideScope(
    actor: WorkActorContext,
    employeeAccountId?: string,
  ): Promise<void> {
    if (!employeeAccountId) return;

    if (
      actor.role === AccountRole.EMPLOYEE &&
      employeeAccountId !== actor.accountId
    ) {
      throw new ForbiddenException(
        'Employees cannot expand a personal report to another account.',
      );
    }

    const account = await this.prisma.account.findFirst({
      where: {
        id: employeeAccountId,
        isEnabled: true,
        ...(actor.role === AccountRole.TEAM_MANAGER
          ? {
              employee: {
                is: {
                  departmentId:
                    actor.departmentId ?? '__missing_department__',
                },
              },
            }
          : {}),
        ...(actor.role === AccountRole.SENIOR_MANAGEMENT
          ? {
              employee: {
                is: {
                  divisionId: actor.divisionId ?? '__missing_division__',
                },
              },
            }
          : {}),
      },
      select: { id: true },
    });

    if (!account) {
      throw new ForbiddenException(
        'The selected employee is outside your authorized report scope.',
      );
    }
  }

  private getReportAssignedToRoles(role: AccountRole): AccountRole[] {
    if (role === AccountRole.SUPER_ADMIN) {
      return [
        AccountRole.SENIOR_MANAGEMENT,
        AccountRole.TEAM_MANAGER,
        AccountRole.EMPLOYEE,
      ];
    }
    if (role === AccountRole.SENIOR_MANAGEMENT) {
      return [AccountRole.TEAM_MANAGER, AccountRole.EMPLOYEE];
    }
    if (role === AccountRole.TEAM_MANAGER) {
      return [AccountRole.EMPLOYEE];
    }
    return [];
  }

  private async listReportAssignerOptions(actor: WorkActorContext) {
    const managerScope: Prisma.AccountWhereInput[] = [
      { role: AccountRole.SUPER_ADMIN },
    ];

    if (actor.role === AccountRole.SUPER_ADMIN) {
      managerScope.push({
        role: {
          in: [AccountRole.SENIOR_MANAGEMENT, AccountRole.TEAM_MANAGER],
        },
      });
    } else if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      managerScope.push(
        {
          role: AccountRole.SENIOR_MANAGEMENT,
          employee: {
            is: { divisionId: actor.divisionId ?? '__missing_division__' },
          },
        },
        {
          role: AccountRole.TEAM_MANAGER,
          employee: {
            is: { divisionId: actor.divisionId ?? '__missing_division__' },
          },
        },
      );
    } else if (actor.role === AccountRole.TEAM_MANAGER) {
      managerScope.push(
        {
          role: AccountRole.SENIOR_MANAGEMENT,
          employee: {
            is: { divisionId: actor.divisionId ?? '__missing_division__' },
          },
        },
        {
          role: AccountRole.TEAM_MANAGER,
          employee: {
            is: {
              departmentId: actor.departmentId ?? '__missing_department__',
            },
          },
        },
      );
    }

    // Report filters list only organizational accounts that can legitimately assign work or duty in the actor's scope.
    return this.prisma.account.findMany({
      where: {
        isEnabled: true,
        OR: managerScope,
      },
      orderBy: [{ role: 'asc' }, { employee: { empName: 'asc' } }],
      take: 250,
      select: reportAccountOptionSelect,
    });
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

  private async listDivisionOptions(actor: WorkActorContext) {
    // Division comparison is branch-wide and therefore only available to Super Admin.
    if (actor.role !== AccountRole.SUPER_ADMIN) return [];

    return this.prisma.division.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true },
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

  private buildDutyMetrics(
    assignments: Array<{
      employeeAccountId: string;
      departmentId: string | null;
      dutyDate: Date;
      startsAt: Date;
      endsAt: Date;
      reportingLocation: string;
      authority: DutyAssignmentAuthority;
      hierarchyOverride: boolean;
      conflictOverride: boolean;
      shift: {
        id: string;
        name: string;
        startMinute: number;
        endMinute: number;
        spansNextDay: boolean;
      };
    }>,
    cancelled: number,
    exceptions: Array<{ type: DutyExceptionType }>,
    requirements: Array<{
      departmentId: string;
      shiftTemplateId: string;
      dayOfWeek: number;
      requiredStaff: number;
      reportingLocation: string | null;
      reportingLocationKey: string | null;
      effectiveFrom: Date;
      effectiveUntil: Date | null;
    }>,
    range: ReportRange,
    query: WorkReportQueryDto,
    actor: WorkActorContext,
  ): WorkReportSummary['duty'] {
    const shiftCounts = new Map<
      string,
      { shiftTemplateId: string; name: string; count: number }
    >();

    for (const assignment of assignments) {
      const existing = shiftCounts.get(assignment.shift.id);
      if (existing) {
        existing.count += 1;
      } else {
        shiftCounts.set(assignment.shift.id, {
          shiftTemplateId: assignment.shift.id,
          name: assignment.shift.name,
          count: 1,
        });
      }
    }

    const isNightAssignment = (assignment: (typeof assignments)[number]) =>
      assignment.shift.spansNextDay ||
      assignment.shift.startMinute >= 18 * 60 ||
      assignment.shift.startMinute < 6 * 60;
    const isSaturday = (assignment: (typeof assignments)[number]) => {
      const kathmanduDate = this.formatKathmanduDate(assignment.startsAt);
      return new Date(`${kathmanduDate}T00:00:00.000Z`).getUTCDay() === 6;
    };

    return {
      scheduled: assignments.length,
      cancelled,
      uniqueEmployees: new Set(
        assignments.map((assignment) => assignment.employeeAccountId),
      ).size,
      leaveDays: exceptions.filter(
        (exception) => exception.type === DutyExceptionType.LEAVE,
      ).length,
      holidayDays: exceptions.filter(
        (exception) => exception.type === DutyExceptionType.HOLIDAY,
      ).length,
      scheduledHours: this.round(
        assignments.reduce(
          (sum, assignment) =>
            sum +
            Math.max(
              0,
              (assignment.endsAt.getTime() - assignment.startsAt.getTime()) /
                (60 * 60 * 1000),
            ),
          0,
        ),
        1,
      ),
      conflictOverrides: assignments.filter(
        (assignment) => assignment.conflictOverride,
      ).length,
      hierarchyOverrides: assignments.filter(
        (assignment) => assignment.hierarchyOverride,
      ).length,
      superAdminOverrides: assignments.filter(
        (assignment) =>
          assignment.authority ===
          DutyAssignmentAuthority.SUPER_ADMIN_OVERRIDE,
      ).length,
      nightAssignments: assignments.filter(isNightAssignment).length,
      weekendAssignments: assignments.filter(isSaturday).length,
      byShift: [...shiftCounts.values()].sort(
        (left, right) =>
          right.count - left.count || left.name.localeCompare(right.name),
      ),
      coverage: this.buildCoverageMetrics(
        assignments,
        requirements,
        range,
        query,
        actor,
      ),
    };
  }

  private buildCoverageMetrics(
    assignments: Array<{
      employeeAccountId: string;
      departmentId: string | null;
      dutyDate: Date;
      startsAt: Date;
      reportingLocation: string;
      shift: { id: string };
    }>,
    requirements: Array<{
      departmentId: string;
      shiftTemplateId: string;
      dayOfWeek: number;
      requiredStaff: number;
      reportingLocation: string | null;
      reportingLocationKey: string | null;
      effectiveFrom: Date;
      effectiveUntil: Date | null;
    }>,
    range: ReportRange,
    query: WorkReportQueryDto,
    actor: WorkActorContext,
  ): WorkReportSummary['duty']['coverage'] {
    if (actor.role === AccountRole.EMPLOYEE || query.employeeAccountId) {
      return {
        configured: false,
        requiredCoverage: null,
        coveredPositions: null,
        coveragePercentage: null,
        unfilledShifts: null,
        reason:
          'Department staffing coverage is not calculated for an employee-filtered report.',
      };
    }
    if (query.assignedByAccountId || query.assignedToRole) {
      return {
        configured: false,
        requiredCoverage: null,
        coveredPositions: null,
        coveragePercentage: null,
        unfilledShifts: null,
        reason:
          'Department staffing coverage is not calculated when duty assignments are narrowed by assigner or assignee role.',
      };
    }
    if (query.dutyStatus === WorkReportDutyStatus.CANCELLED) {
      return {
        configured: false,
        requiredCoverage: null,
        coveredPositions: null,
        coveragePercentage: null,
        unfilledShifts: null,
        reason:
          'Coverage is based on active planned duty and is not calculated for a cancelled-duty-only report.',
      };
    }
    if (requirements.length === 0) {
      return {
        configured: false,
        requiredCoverage: null,
        coveredPositions: null,
        coveragePercentage: null,
        unfilledShifts: null,
        reason:
          'No approved staffing targets are configured for the selected scope and period.',
      };
    }

    const assignmentsBySlot = new Map<string, Map<string, string>>();
    for (const assignment of assignments) {
      if (!assignment.departmentId) continue;
      const date = this.formatKathmanduDate(assignment.dutyDate);
      const baseKey = [date, assignment.departmentId, assignment.shift.id].join('|');
      const employeeLocations = assignmentsBySlot.get(baseKey) ?? new Map();
      employeeLocations.set(
        assignment.employeeAccountId,
        this.normalizeCoverageLocation(assignment.reportingLocation),
      );
      assignmentsBySlot.set(baseKey, employeeLocations);
    }

    let requiredCoverage = 0;
    let coveredPositions = 0;
    let unfilledShifts = 0;

    for (let index = 0; index < range.days; index += 1) {
      const date = this.addDateDays(range.from, index);
      const dateValue = new Date(`${date}T00:00:00.000Z`);
      const dayOfWeek = dateValue.getUTCDay();

      for (const requirement of requirements) {
        if (requirement.dayOfWeek !== dayOfWeek) continue;
        if (requirement.effectiveFrom > dateValue) continue;
        if (
          requirement.effectiveUntil &&
          requirement.effectiveUntil < dateValue
        ) {
          continue;
        }

        const baseKey = [
          date,
          requirement.departmentId,
          requirement.shiftTemplateId,
        ].join('|');
        const employeeLocations = assignmentsBySlot.get(baseKey) ?? new Map();
        const scheduledEmployees = [...employeeLocations.entries()].filter(
          ([, locationKey]) =>
            requirement.reportingLocationKey === null ||
            locationKey === requirement.reportingLocationKey,
        ).length;
        const covered = Math.min(scheduledEmployees, requirement.requiredStaff);

        requiredCoverage += requirement.requiredStaff;
        coveredPositions += covered;
        unfilledShifts += Math.max(0, requirement.requiredStaff - scheduledEmployees);
      }
    }

    if (requiredCoverage === 0) {
      return {
        configured: false,
        requiredCoverage: null,
        coveredPositions: null,
        coveragePercentage: null,
        unfilledShifts: null,
        reason:
          'Staffing targets exist, but none are effective on the selected weekdays and dates.',
      };
    }

    return {
      configured: true,
      requiredCoverage,
      coveredPositions,
      coveragePercentage: this.round(
        (coveredPositions / requiredCoverage) * 100,
        1,
      ),
      unfilledShifts,
      // Coverage compares approved planned staffing positions with active planned duty; it is not attendance verification.
      reason:
        'Coverage compares approved planned staffing positions with active planned duty assignments, not verified attendance.',
    };
  }

  private normalizeCoverageLocation(value: string): string {
    return value
      .trim()
      .replace(/\s+/g, ' ')
      .normalize('NFKC')
      .toLocaleLowerCase('en-US');
  }

  private buildTrend(
    range: ReportRange,
    createdItems: Array<{ createdAt: Date }>,
    closedItems: Array<{ closedAt: Date | null }>,
    helpRequests: Array<{ createdAt: Date }>,
    dutyAssignments: Array<{ startsAt: Date }>,
  ) {
    const rows = new Map<
      string,
      {
        date: string;
        workCreated: number;
        workClosed: number;
        helpRequested: number;
        dutyScheduled: number;
      }
    >();

    for (let index = 0; index < range.days; index += 1) {
      const date = this.addDateDays(range.from, index);
      rows.set(date, {
        date,
        workCreated: 0,
        workClosed: 0,
        helpRequested: 0,
        dutyScheduled: 0,
      });
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
    for (const request of helpRequests) {
      const row = rows.get(this.formatKathmanduDate(request.createdAt));
      if (row) row.helpRequested += 1;
    }
    for (const assignment of dutyAssignments) {
      const row = rows.get(this.formatKathmanduDate(assignment.startsAt));
      if (row) row.dutyScheduled += 1;
    }

    return [...rows.values()];
  }

  private buildRoleWorkload(
    actor: WorkActorContext,
    activeAssignments: Array<{
      assigneeAccountId: string;
      assignee: {
        role: AccountRole;
        username: string | null;
        employee: {
          empName: string;
          empId: string;
          divisionId: string | null;
          departmentId: string | null;
          division: { id: string; code: string; name: string } | null;
          departmentUnit: { id: string; code: string; name: string } | null;
        } | null;
      };
      workItem: { priority: WorkPriority; dueAt: Date };
    }>,
    dutyAssignments: Array<{
      employeeAccountId: string;
      startsAt: Date;
      endsAt: Date;
      employee: {
        role: AccountRole;
        username: string | null;
        employee: {
          empName: string;
          empId: string;
          divisionId: string | null;
          departmentId: string | null;
          division: { id: string; code: string; name: string } | null;
          departmentUnit: { id: string; code: string; name: string } | null;
        } | null;
      };
    }>,
    now: Date,
  ): WorkReportSummary['workload'] {
    const level =
      actor.role === AccountRole.TEAM_MANAGER ||
      actor.role === AccountRole.EMPLOYEE
        ? 'EMPLOYEE'
        : actor.role === AccountRole.SENIOR_MANAGEMENT
          ? 'DEPARTMENT'
          : 'DIVISION';
    const rows = new Map<string, WorkReportSummary['workload']['rows'][number]>();

    const identity = (account: {
      role: AccountRole;
      username: string | null;
      employee: {
        empName: string;
        empId: string;
        division: { id: string; code: string; name: string } | null;
        departmentUnit: { id: string; code: string; name: string } | null;
      } | null;
    }) => {
      if (level === 'EMPLOYEE') {
        return {
          // Accounts without an employee profile or username still receive a stable role-based report identity.
          id: account.employee?.empId ?? account.username ?? account.role,
          code: account.employee?.empId ?? account.role,
          name:
            account.employee?.empName ??
            (account.username && !account.username.includes('@')
              ? account.username
              : account.role),
        };
      }
      if (level === 'DEPARTMENT') {
        const department = account.employee?.departmentUnit;
        if (department) {
          return { id: department.id, code: department.code, name: department.name };
        }

        const division = account.employee?.division;
        // Division-level Senior Management work stays visible instead of disappearing from workload.
        return division
          ? {
              id: `${division.id}:management`,
              code: `${division.code}-MGMT`,
              name: `${division.name} Management`,
            }
          : null;
      }
      const division = account.employee?.division;
      return division
        ? { id: division.id, code: division.code, name: division.name }
        : null;
    };

    const getRow = (account: Parameters<typeof identity>[0]) => {
      const item = identity(account);
      if (!item) return null;
      const existing = rows.get(item.id);
      if (existing) return existing;
      const created = {
        ...item,
        activeWork: 0,
        criticalWork: 0,
        overdueWork: 0,
        scheduledHours: 0,
      };
      rows.set(item.id, created);
      return created;
    };

    for (const assignment of activeAssignments) {
      const row = getRow(assignment.assignee);
      if (!row) continue;
      row.activeWork += 1;
      if (assignment.workItem.priority === WorkPriority.CRITICAL) {
        row.criticalWork += 1;
      }
      if (assignment.workItem.dueAt < now) row.overdueWork += 1;
    }
    // Scheduled hours are planning load and must not be interpreted as attendance.
    for (const assignment of dutyAssignments) {
      const row = getRow(assignment.employee);
      if (!row) continue;
      row.scheduledHours += Math.max(
        0,
        (assignment.endsAt.getTime() - assignment.startsAt.getTime()) /
          (60 * 60 * 1000),
      );
    }

    return {
      level,
      // Limit the summary table so reports stay decision-focused rather than becoming raw data dumps.
      rows: [...rows.values()]
        .map((row) => ({ ...row, scheduledHours: this.round(row.scheduledHours, 1) }))
        .sort(
          (left, right) =>
            right.criticalWork - left.criticalWork ||
            right.overdueWork - left.overdueWork ||
            right.activeWork - left.activeWork ||
            left.name.localeCompare(right.name),
        )
        .slice(0, 50),
    };
  }

  private buildDepartmentBreakdown(
    actor: WorkActorContext,
    departmentOptions: Array<{
      id: string;
      divisionId: string;
      code: string;
      name: string;
    }>,
    createdItems: Array<{ departmentId: string | null }>,
    closedItems: Array<{ departmentId: string | null }>,
    helpRequests: Array<{ workItem: { departmentId: string | null } }>,
    dutyAssignments: Array<{
      employeeAccountId: string;
      divisionId: string;
      departmentId: string | null;
      dutyDate: Date;
      startsAt: Date;
      reportingLocation: string;
      conflictOverride: boolean;
      shift: { id: string };
    }>,
    activeAssignments: Array<{
      workItem: {
        id: string;
        divisionId: string;
        departmentId: string | null;
        dueAt: Date;
      };
    }>,
    dutyExceptions: Array<{
      type: DutyExceptionType;
      divisionId: string;
      departmentId: string | null;
    }>,
    requirements: Array<{
      departmentId: string;
      shiftTemplateId: string;
      dayOfWeek: number;
      requiredStaff: number;
      reportingLocation: string | null;
      reportingLocationKey: string | null;
      effectiveFrom: Date;
      effectiveUntil: Date | null;
    }>,
    range: ReportRange,
    query: WorkReportQueryDto,
    overdueCutoff: Date,
  ): WorkReportSummary['departments'] {
    if (actor.role === AccountRole.EMPLOYEE) return [];

    const visibleDepartments = departmentOptions.filter(
      (department) =>
        (!query.divisionId || department.divisionId === query.divisionId) &&
        (!query.departmentId || department.id === query.departmentId),
    );
    const rows = new Map(
      visibleDepartments.map((department) => [
        department.id,
        {
          departmentId: department.id,
          code: department.code,
          name: department.name,
          workCreated: 0,
          workClosed: 0,
          activeWork: 0,
          overdueWork: 0,
          completionRate: null as number | null,
          dutyCoverage: null as number | null,
          leaveDays: 0,
          conflicts: 0,
          helpRequested: 0,
          dutyScheduled: 0,
        },
      ]),
    );

    // Department comparisons intentionally exclude division-level management responsibilities.
    for (const item of createdItems) {
      if (!item.departmentId) continue;
      const row = rows.get(item.departmentId);
      if (row) row.workCreated += 1;
    }
    for (const item of closedItems) {
      if (!item.departmentId) continue;
      const row = rows.get(item.departmentId);
      if (row) row.workClosed += 1;
    }
    for (const assignment of activeAssignments) {
      const departmentId = assignment.workItem.departmentId;
      if (!departmentId) continue;
      const row = rows.get(departmentId);
      if (!row) continue;
      row.activeWork += 1;
      if (assignment.workItem.dueAt < overdueCutoff) row.overdueWork += 1;
    }
    for (const request of helpRequests) {
      if (!request.workItem.departmentId) continue;
      const row = rows.get(request.workItem.departmentId);
      if (row) row.helpRequested += 1;
    }
    for (const assignment of dutyAssignments) {
      if (!assignment.departmentId) continue;
      const row = rows.get(assignment.departmentId);
      if (!row) continue;
      row.dutyScheduled += 1;
      if (assignment.conflictOverride) row.conflicts += 1;
    }
    for (const exception of dutyExceptions) {
      if (
        exception.type !== DutyExceptionType.LEAVE ||
        !exception.departmentId
      ) {
        continue;
      }
      const row = rows.get(exception.departmentId);
      if (row) row.leaveDays += 1;
    }

    for (const department of visibleDepartments) {
      const row = rows.get(department.id);
      if (!row) continue;
      row.completionRate =
        row.workCreated > 0
          ? this.round(
              Math.min(100, (row.workClosed / row.workCreated) * 100),
              1,
            )
          : row.workClosed > 0
            ? 100
            : null;
      row.dutyCoverage = this.buildCoverageMetrics(
        dutyAssignments.filter(
          (assignment) => assignment.departmentId === department.id,
        ),
        requirements.filter(
          (requirement) => requirement.departmentId === department.id,
        ),
        range,
        { ...query, departmentId: department.id },
        actor,
      ).coveragePercentage;
    }

    return [...rows.values()].sort(
      (left, right) =>
        right.overdueWork - left.overdueWork ||
        right.conflicts - left.conflicts ||
        right.activeWork - left.activeWork ||
        left.name.localeCompare(right.name),
    );
  }

  private buildDivisionBreakdown(
    actor: WorkActorContext,
    divisionOptions: Array<{ id: string; code: string; name: string }>,
    departmentOptions: Array<{ id: string; divisionId: string }>,
    createdItems: Array<{ divisionId: string }>,
    closedItems: Array<{ divisionId: string }>,
    helpRequests: Array<{ workItem: { divisionId: string } }>,
    dutyAssignments: Array<{
      employeeAccountId: string;
      divisionId: string;
      departmentId: string | null;
      dutyDate: Date;
      startsAt: Date;
      reportingLocation: string;
      conflictOverride: boolean;
      shift: { id: string };
    }>,
    activeAssignments: Array<{
      workItem: {
        id: string;
        divisionId: string;
        departmentId: string | null;
        dueAt: Date;
      };
    }>,
    dutyExceptions: Array<{
      type: DutyExceptionType;
      divisionId: string;
      departmentId: string | null;
    }>,
    requirements: Array<{
      departmentId: string;
      shiftTemplateId: string;
      dayOfWeek: number;
      requiredStaff: number;
      reportingLocation: string | null;
      reportingLocationKey: string | null;
      effectiveFrom: Date;
      effectiveUntil: Date | null;
    }>,
    range: ReportRange,
    query: WorkReportQueryDto,
    overdueCutoff: Date,
  ): WorkReportSummary['divisions'] {
    if (actor.role !== AccountRole.SUPER_ADMIN) return [];

    const departmentDivision = new Map(
      departmentOptions.map((department) => [
        department.id,
        department.divisionId,
      ]),
    );
    const filteredDivisionId = query.departmentId
      ? departmentDivision.get(query.departmentId) ?? null
      : query.divisionId ?? null;
    const visibleDivisions = divisionOptions.filter(
      (division) => !filteredDivisionId || division.id === filteredDivisionId,
    );
    const rows = new Map(
      visibleDivisions.map((division) => [
        division.id,
        {
          divisionId: division.id,
          code: division.code,
          name: division.name,
          workCreated: 0,
          workClosed: 0,
          activeWork: 0,
          overdueWork: 0,
          completionRate: null as number | null,
          dutyCoverage: null as number | null,
          leaveDays: 0,
          conflicts: 0,
          helpRequested: 0,
          dutyScheduled: 0,
        },
      ]),
    );

    for (const item of createdItems) {
      const row = rows.get(item.divisionId);
      if (row) row.workCreated += 1;
    }
    for (const item of closedItems) {
      const row = rows.get(item.divisionId);
      if (row) row.workClosed += 1;
    }
    for (const assignment of activeAssignments) {
      const row = rows.get(assignment.workItem.divisionId);
      if (!row) continue;
      row.activeWork += 1;
      if (assignment.workItem.dueAt < overdueCutoff) row.overdueWork += 1;
    }
    for (const request of helpRequests) {
      const row = rows.get(request.workItem.divisionId);
      if (row) row.helpRequested += 1;
    }
    for (const assignment of dutyAssignments) {
      const row = rows.get(assignment.divisionId);
      if (!row) continue;
      row.dutyScheduled += 1;
      if (assignment.conflictOverride) row.conflicts += 1;
    }
    for (const exception of dutyExceptions) {
      if (exception.type !== DutyExceptionType.LEAVE) continue;
      const row = rows.get(exception.divisionId);
      if (row) row.leaveDays += 1;
    }

    for (const division of visibleDivisions) {
      const row = rows.get(division.id);
      if (!row) continue;
      const divisionDepartmentIds = new Set(
        departmentOptions
          .filter((department) => department.divisionId === division.id)
          .map((department) => department.id),
      );
      row.completionRate =
        row.workCreated > 0
          ? this.round(
              Math.min(100, (row.workClosed / row.workCreated) * 100),
              1,
            )
          : row.workClosed > 0
            ? 100
            : null;
      row.dutyCoverage = this.buildCoverageMetrics(
        dutyAssignments.filter(
          (assignment) => assignment.divisionId === division.id,
        ),
        requirements.filter((requirement) =>
          divisionDepartmentIds.has(requirement.departmentId),
        ),
        range,
        { ...query, divisionId: division.id },
        actor,
      ).coveragePercentage;
    }

    return [...rows.values()].sort(
      (left, right) =>
        right.overdueWork - left.overdueWork ||
        right.conflicts - left.conflicts ||
        right.activeWork - left.activeWork ||
        left.name.localeCompare(right.name),
    );
  }

  private createDailyCounts(): DailyWorkPerformanceCounts {
    return { assigned: 0, completed: 0, pending: 0 };
  }

  private addDailyCounts(
    target: DailyWorkPerformanceCounts,
    source: DailyWorkPerformanceCounts,
  ): void {
    target.assigned += source.assigned;
    target.completed += source.completed;
    target.pending += source.pending;
  }

  private getDailyCategoryCounts(
    row: DailyWorkPerformanceRow,
    type: WorkItemType,
  ): DailyWorkPerformanceCounts {
    if (type === WorkItemType.MAINTENANCE) return row.networkMaintenance;
    if (type === WorkItemType.NEW_CONNECTION) return row.newInstallation;
    if (type === WorkItemType.UPDATE_SERVICES) return row.updateServices;
    return row.otherWork;
  }

  private describeDailyPendingStatus(status: WorkItemStatus): string {
    if (status === WorkItemStatus.ASSIGNED) return 'awaiting acknowledgement';
    if (status === WorkItemStatus.ACKNOWLEDGED) return 'acknowledged';
    if (status === WorkItemStatus.IN_PROGRESS) return 'in progress';
    if (status === WorkItemStatus.HELP_REQUESTED) return 'help requested';
    if (status === WorkItemStatus.COMPLETED_PENDING_REVIEW) {
      return 'awaiting manager review';
    }
    if (status === WorkItemStatus.REOPENED) return 'reopened';
    if (status === WorkItemStatus.BLOCKED) return 'blocked';
    return 'not completed by end of day';
  }

  private formatAccountRole(role: AccountRole): string {
    return role
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private countByEnum<T extends string>(order: readonly T[], values: T[]) {
    const counts = new Map<T, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
    return order.map((key) => ({ key, count: counts.get(key) ?? 0 }));
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
