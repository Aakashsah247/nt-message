import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountRole,
  DutyExceptionType,
  WorkAssignmentRole,
  WorkItemStatus,
  WorkItemType,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import {
  PerformanceReportGroup,
  PerformanceReportQueryDto,
  PerformanceReportSection,
  PerformanceReportStaffMode,
  PerformanceReportWorkType,
} from './dto/performance-report-query.dto';
import { WorkScopeService } from './work-scope.service';
import type { WorkActorContext } from './work-scope.service';

const BRANCH_TIME_ZONE = 'Asia/Kathmandu' as const;
const KATHMANDU_OFFSET_MS = 5.75 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REPORT_DAYS = 366;
const MAX_SCREEN_DETAIL_ROWS = 2_000;
const MAX_EXPORT_ROWS = 10_000;

const REPORT_WORK_TYPES = [
  WorkItemType.ROUTINE_TASK,
  WorkItemType.TROUBLE_TICKET,
  WorkItemType.MAINTENANCE,
  WorkItemType.NEW_CONNECTION,
  WorkItemType.UPDATE_SERVICES,
  WorkItemType.INSPECTION,
  WorkItemType.EMERGENCY_WORK,
  WorkItemType.ADMINISTRATIVE_TASK,
] as const;

const organizationSelect = {
  id: true,
  code: true,
  name: true,
} satisfies Prisma.DivisionSelect;

const reportPersonSelect = {
  id: true,
  role: true,
  username: true,
  employee: {
    select: {
      empId: true,
      empName: true,
      designation: true,
      divisionId: true,
      departmentId: true,
      division: {
        select: organizationSelect,
      },
      departmentUnit: {
        select: {
          id: true,
          code: true,
          name: true,
          divisionId: true,
        },
      },
    },
  },
} satisfies Prisma.AccountSelect;

type ReportPersonRecord = Prisma.AccountGetPayload<{
  select: typeof reportPersonSelect;
}>;

const workItemReportSelect = {
  id: true,
  ticketNumber: true,
  type: true,
  title: true,
  status: true,
  parentWorkItemId: true,
  plannedStartAt: true,
  dueAt: true,
  completedAt: true,
  closedAt: true,
  cancelledAt: true,
  createdAt: true,
  serviceNumber: true,
  division: {
    select: organizationSelect,
  },
  department: {
    select: {
      id: true,
      code: true,
      name: true,
      divisionId: true,
    },
  },
  createdBy: {
    select: reportPersonSelect,
  },
  assignments: {
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      id: true,
      assignmentRole: true,
      createdAt: true,
      endedAt: true,
      assignee: {
        select: reportPersonSelect,
      },
      assignedBy: {
        select: reportPersonSelect,
      },
    },
  },
} satisfies Prisma.WorkItemSelect;

type WorkItemReportRecord = Prisma.WorkItemGetPayload<{
  select: typeof workItemReportSelect;
}>;

const dutyAssignmentReportSelect = {
  id: true,
  dutyDate: true,
  startsAt: true,
  endsAt: true,
  shiftName: true,
  reportingLocation: true,
  cancelledAt: true,
  division: {
    select: organizationSelect,
  },
  department: {
    select: {
      id: true,
      code: true,
      name: true,
      divisionId: true,
    },
  },
  employee: {
    select: reportPersonSelect,
  },
  supervisor: {
    select: reportPersonSelect,
  },
  createdBy: {
    select: reportPersonSelect,
  },
} satisfies Prisma.DutyAssignmentSelect;

type DutyAssignmentReportRecord = Prisma.DutyAssignmentGetPayload<{
  select: typeof dutyAssignmentReportSelect;
}>;

const dutyExceptionReportSelect = {
  id: true,
  exceptionDate: true,
  type: true,
  employee: {
    select: reportPersonSelect,
  },
} satisfies Prisma.DutyExceptionSelect;

type DutyExceptionReportRecord = Prisma.DutyExceptionGetPayload<{
  select: typeof dutyExceptionReportSelect;
}>;

export interface PerformanceReportCounts {
  assigned: number;
  completed: number;
  pending: number;
}

export interface PerformanceReportPerson {
  id: string;
  name: string;
  employeeId: string | null;
  role: AccountRole;
  jobTitle: string | null;
}

export interface PerformanceSummaryRow {
  id: string;
  date: string | null;
  name: string;
  code: string | null;
  role: AccountRole | null;
  division: OrganizationSummary | null;
  department: OrganizationSummary | null;
  supportingStaff: PerformanceReportPerson[];
  serviceNumbers: string[];
  workTypeCounts: Record<WorkItemType, PerformanceReportCounts>;
  total: PerformanceReportCounts;
}

export interface PerformanceWorkDetailRow {
  id: string;
  ticketNumber: string;
  title: string;
  type: WorkItemType;
  status: WorkItemStatus;
  assignedBy: PerformanceReportPerson | null;
  mainWorker: PerformanceReportPerson | null;
  supportingStaff: PerformanceReportPerson[];
  serviceNumbers: string[];
  workAssignmentPaths: PerformanceReportPerson[][];
  division: OrganizationSummary;
  department: OrganizationSummary | null;
  plannedStartAt: string | null;
  dueAt: string;
  closedAt: string | null;
  pendingReason: string | null;
}

export interface PerformanceDutySummaryRow {
  accountId: string;
  employeeId: string;
  employeeName: string;
  jobTitle: string | null;
  division: OrganizationSummary | null;
  department: OrganizationSummary | null;
  scheduledDays: number;
  assignments: number;
  scheduledHours: number;
  cancelled: number;
  leaveDays: number;
  holidayDays: number;
}

export interface PerformanceDutyDetailRow {
  id: string;
  date: string;
  employee: PerformanceReportPerson;
  shift: string;
  time: string;
  location: string;
  supervisor: PerformanceReportPerson;
  assignedBy: PerformanceReportPerson;
  division: OrganizationSummary;
  department: OrganizationSummary | null;
  leaveOrHoliday: 'LEAVE' | 'HOLIDAY' | null;
  status: 'SCHEDULED' | 'CANCELLED';
}

export interface PerformanceReportResponse {
  timezone: typeof BRANCH_TIME_ZONE;
  generatedAt: string;
  scope: {
    role: AccountRole;
    label: string;
    divisionId: string | null;
    departmentId: string | null;
  };
  period: { from: string; to: string; days: number };
  filters: {
    divisionId: string | null;
    departmentId: string | null;
    groupBy: PerformanceReportGroup;
    staffMode: PerformanceReportStaffMode;
    workType: PerformanceReportWorkType;
    search: string | null;
  };
  divisionOptions: OrganizationSummary[];
  departmentOptions: DepartmentOption[];
  summaryRows: PerformanceSummaryRow[];
  summaryTotals: SummaryCounts;
  workDetails: PerformanceWorkDetailRow[];
  dutySummary: PerformanceDutySummaryRow[];
  dutyDetails: PerformanceDutyDetailRow[];
  truncated: { workDetails: boolean; dutyDetails: boolean };
  notes: { work: string; duty: string };
}

interface OrganizationSummary {
  id: string;
  code: string;
  name: string;
}

interface DepartmentOption extends OrganizationSummary {
  divisionId: string;
  division: OrganizationSummary;
}

interface ReportRange {
  from: string;
  to: string;
  start: Date;
  endExclusive: Date;
  days: number;
}

interface ResolvedScope {
  divisionId: string | null;
  departmentId: string | null;
  label: string;
  divisionOptions: OrganizationSummary[];
  departmentOptions: DepartmentOption[];
}

interface SummaryCounts {
  workTypeCounts: Record<WorkItemType, PerformanceReportCounts>;
  total: PerformanceReportCounts;
}

interface MutableSummaryRow extends PerformanceSummaryRow {
  supportingStaffMap: Map<string, PerformanceReportPerson>;
  serviceNumberSet: Set<string>;
  seenWorkItems: Set<string>;
}

interface WorkMetrics {
  assigned: boolean;
  completed: boolean;
  pending: boolean;
}

interface ExportResult {
  filename: string;
  content: string;
  rowCount: number;
  truncated: boolean;
}

@Injectable()
export class PerformanceReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workScopeService: WorkScopeService,
  ) {}

  async getReport(
    user: AuthenticatedUser,
    query: PerformanceReportQueryDto,
  ): Promise<PerformanceReportResponse> {
    return this.buildReport(user, query, MAX_SCREEN_DETAIL_ROWS);
  }

  async exportReport(
    user: AuthenticatedUser,
    query: PerformanceReportQueryDto,
    section: PerformanceReportSection,
  ): Promise<ExportResult> {
    const report = await this.buildReport(user, query, MAX_EXPORT_ROWS);
    const rows = this.exportRows(report, section);
    const sectionName = section.toLowerCase().replaceAll('_', '-');

    return {
      filename: `${sectionName}-${report.period.from}-to-${report.period.to}.csv`,
      content: this.toCsv(rows),
      rowCount: Math.max(rows.length - 1, 0),
      truncated:
        section === PerformanceReportSection.WORK_DETAILS
          ? report.truncated.workDetails
          : section === PerformanceReportSection.DUTY_DETAILS
            ? report.truncated.dutyDetails
            : false,
    };
  }

  private async buildReport(
    user: AuthenticatedUser,
    query: PerformanceReportQueryDto,
    detailLimit: number,
  ): Promise<PerformanceReportResponse> {
    const actor = await this.workScopeService.resolveActorContext(user);
    const range = this.resolveRange(query);
    const groupBy = query.groupBy ?? PerformanceReportGroup.EMPLOYEE;
    const staffMode = query.staffMode ?? PerformanceReportStaffMode.WITH_WORK;
    const workType = query.workType ?? PerformanceReportWorkType.ALL;
    const search = query.search?.trim() || null;
    const scope = await this.resolveScope(actor, query, groupBy);
    const workWhere = this.buildWorkWhere(
      scope,
      range,
      query.employeeAccountId,
      workType,
    );
    const dutyWhere = this.buildDutyWhere(scope, range, query.employeeAccountId);

    const [staffAccounts, workItems, dutyAssignments, dutyExceptions] =
      await Promise.all([
        this.listStaff(scope, query.employeeAccountId),
        this.prisma.workItem.findMany({
          where: workWhere,
          orderBy: [
            { plannedStartAt: 'asc' },
            { dueAt: 'asc' },
            { createdAt: 'asc' },
          ],
          select: workItemReportSelect,
        }),
        this.prisma.dutyAssignment.findMany({
          where: dutyWhere,
          orderBy: [{ dutyDate: 'asc' }, { startsAt: 'asc' }],
          select: dutyAssignmentReportSelect,
        }),
        this.prisma.dutyException.findMany({
          where: {
            ...this.buildOrganizationWhere(scope),
            exceptionDate: {
              gte: range.start,
              lt: range.endExclusive,
            },
            ...(query.employeeAccountId
              ? { employeeAccountId: query.employeeAccountId }
              : {}),
          },
          orderBy: [{ exceptionDate: 'asc' }],
          select: dutyExceptionReportSelect,
        }),
      ]);

    const workMap = await this.loadWorkChain(workItems);
    const summaryRows = this.buildSummaryRows(
      staffAccounts,
      workItems,
      groupBy,
      staffMode,
      search,
      range,
    );
    const workDetailsAll = this.buildWorkDetails(workItems, workMap, range)
      .filter((row) => this.matchesWorkSearch(row, search));
    const dutyDetailsAll = this.buildDutyDetails(
      dutyAssignments,
      dutyExceptions,
    ).filter((row) => this.matchesDutySearch(row, search));

    return {
      timezone: BRANCH_TIME_ZONE,
      generatedAt: new Date().toISOString(),
      scope: {
        role: actor.role,
        label: scope.label,
        divisionId: scope.divisionId,
        departmentId: scope.departmentId,
      },
      period: {
        from: range.from,
        to: range.to,
        days: range.days,
      },
      filters: {
        divisionId: scope.divisionId,
        departmentId: scope.departmentId,
        groupBy,
        staffMode,
        workType,
        search,
      },
      divisionOptions: scope.divisionOptions,
      departmentOptions: scope.departmentOptions,
      summaryRows,
      summaryTotals: this.sumSummaryRows(summaryRows),
      workDetails: workDetailsAll.slice(0, detailLimit),
      dutySummary: this.buildDutySummary(
        staffAccounts,
        dutyAssignments,
        dutyExceptions,
        staffMode,
        search,
      ),
      dutyDetails: dutyDetailsAll.slice(0, detailLimit),
      truncated: {
        workDetails: workDetailsAll.length > detailLimit,
        dutyDetails: dutyDetailsAll.length > detailLimit,
      },
      notes: {
        work:
          'Tickets are grouped by the date they were created. Supporting Staff includes only people added as support. Work passed to a lower team is shown in Work Details under the work path.',
        duty:
          'This report shows planned duty schedules, leave and holidays. It does not confirm attendance or completed hours.',
      },
    };
  }

  private async resolveScope(
    actor: WorkActorContext,
    query: PerformanceReportQueryDto,
    groupBy: PerformanceReportGroup,
  ): Promise<ResolvedScope> {
    if (
      actor.role === AccountRole.TEAM_MANAGER &&
      groupBy === PerformanceReportGroup.DIVISION
    ) {
      throw new ForbiddenException(
        'Team Managers can view employee or department reports only.',
      );
    }

    let divisionId = query.divisionId ?? null;
    let departmentId = query.departmentId ?? null;

    if (actor.role === AccountRole.SENIOR_MANAGEMENT) {
      if (divisionId && divisionId !== actor.divisionId) {
        throw new ForbiddenException(
          'You can generate reports only for your assigned division.',
        );
      }
      divisionId = actor.divisionId;
    }

    if (actor.role === AccountRole.TEAM_MANAGER) {
      if (departmentId && departmentId !== actor.departmentId) {
        throw new ForbiddenException(
          'You can generate reports only for your assigned department.',
        );
      }
      divisionId = actor.divisionId;
      departmentId = actor.departmentId;
    }

    if (departmentId) {
      const department = await this.prisma.department.findUnique({
        where: { id: departmentId },
        select: {
          id: true,
          divisionId: true,
          name: true,
          isActive: true,
        },
      });

      if (!department || !department.isActive) {
        throw new NotFoundException('The selected department was not found.');
      }

      if (divisionId && department.divisionId !== divisionId) {
        throw new BadRequestException(
          'The selected department does not belong to the selected division.',
        );
      }

      if (
        actor.role === AccountRole.SENIOR_MANAGEMENT &&
        department.divisionId !== actor.divisionId
      ) {
        throw new ForbiddenException(
          'The selected department is outside your assigned division.',
        );
      }

      divisionId = department.divisionId;
    }

    if (divisionId) {
      const division = await this.prisma.division.findUnique({
        where: { id: divisionId },
        select: { id: true, isActive: true },
      });
      if (!division || !division.isActive) {
        throw new NotFoundException('The selected division was not found.');
      }
    }

    const divisionOptions = await this.prisma.division.findMany({
      where: {
        isActive: true,
        ...(actor.role === AccountRole.SUPER_ADMIN
          ? {}
          : { id: actor.divisionId ?? '__missing_division__' }),
      },
      orderBy: { name: 'asc' },
      select: organizationSelect,
    });
    const departmentOptions = await this.prisma.department.findMany({
      where: {
        isActive: true,
        ...(actor.role === AccountRole.SUPER_ADMIN
          ? divisionId
            ? { divisionId }
            : {}
          : actor.role === AccountRole.SENIOR_MANAGEMENT
            ? { divisionId: actor.divisionId ?? '__missing_division__' }
            : { id: actor.departmentId ?? '__missing_department__' }),
      },
      orderBy: [{ division: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        divisionId: true,
        code: true,
        name: true,
        division: {
          select: organizationSelect,
        },
      },
    });

    const selectedDepartment = departmentId
      ? departmentOptions.find((item) => item.id === departmentId)
      : null;
    const selectedDivision = divisionId
      ? divisionOptions.find((item) => item.id === divisionId)
      : null;

    return {
      divisionId,
      departmentId,
      label:
        selectedDepartment?.name ??
        selectedDivision?.name ??
        (actor.role === AccountRole.SUPER_ADMIN
          ? 'Patan Branch'
          : actor.role === AccountRole.SENIOR_MANAGEMENT
            ? 'Assigned division'
            : 'Assigned department'),
      divisionOptions,
      departmentOptions,
    };
  }

  private buildOrganizationWhere(
    scope: ResolvedScope,
  ): { divisionId?: string; departmentId?: string } {
    if (scope.departmentId) return { departmentId: scope.departmentId };
    if (scope.divisionId) return { divisionId: scope.divisionId };
    return {};
  }

  private buildWorkWhere(
    scope: ResolvedScope,
    range: ReportRange,
    employeeAccountId: string | undefined,
    workType: PerformanceReportWorkType,
  ): Prisma.WorkItemWhereInput {
    const selectedType = this.toWorkItemType(workType);
    return {
      AND: [
        this.buildOrganizationWhere(scope),
        ...(selectedType ? [{ type: selectedType }] : []),
        { createdAt: { lt: range.endExclusive } },
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
                { createdAt: { gte: range.start, lt: range.endExclusive } },
              ],
            },
            { closedAt: { gte: range.start, lt: range.endExclusive } },
            { cancelledAt: { gte: range.start, lt: range.endExclusive } },
            { closedAt: null, cancelledAt: null },
            { closedAt: { gte: range.endExclusive } },
            { cancelledAt: { gte: range.endExclusive } },
          ],
        },
        ...(employeeAccountId
          ? [
              {
                assignments: {
                  some: { assigneeAccountId: employeeAccountId },
                },
              } satisfies Prisma.WorkItemWhereInput,
            ]
          : []),
      ],
    };
  }

  private buildDutyWhere(
    scope: ResolvedScope,
    range: ReportRange,
    employeeAccountId?: string,
  ): Prisma.DutyAssignmentWhereInput {
    return {
      ...this.buildOrganizationWhere(scope),
      dutyDate: {
        gte: range.start,
        lt: range.endExclusive,
      },
      ...(employeeAccountId ? { employeeAccountId } : {}),
    };
  }

  private async listStaff(
    scope: ResolvedScope,
    employeeAccountId?: string,
  ): Promise<ReportPersonRecord[]> {
    return this.prisma.account.findMany({
      where: {
        isEnabled: true,
        role: {
          in: [
            AccountRole.SENIOR_MANAGEMENT,
            AccountRole.TEAM_MANAGER,
            AccountRole.EMPLOYEE,
          ],
        },
        ...(employeeAccountId ? { id: employeeAccountId } : {}),
        employee: {
          is: {
            ...(scope.departmentId
              ? { departmentId: scope.departmentId }
              : scope.divisionId
                ? { divisionId: scope.divisionId }
                : {}),
          },
        },
      },
      orderBy: [{ employee: { empName: 'asc' } }],
      select: reportPersonSelect,
    });
  }

  private buildSummaryRows(
    staffAccounts: ReportPersonRecord[],
    workItems: WorkItemReportRecord[],
    groupBy: PerformanceReportGroup,
    staffMode: PerformanceReportStaffMode,
    search: string | null,
    range: ReportRange,
  ): PerformanceSummaryRow[] {
    const rows = new Map<string, MutableSummaryRow>();
    const identitiesWithWork = new Set<string>();

    const ensureRow = (
      person: ReportPersonRecord,
      workItem: WorkItemReportRecord | null,
      date: string | null,
    ): MutableSummaryRow | null => {
      const identity = this.summaryIdentity(person, workItem, groupBy);
      if (!identity) return null;
      const key = `${date ?? 'no-date'}:${identity.id}`;
      const existing = rows.get(key);
      if (existing) return existing;
      const row: MutableSummaryRow = {
        id: key,
        date,
        name: identity.name,
        code: identity.code,
        role: identity.role,
        division: identity.division,
        department: identity.department,
        supportingStaff: [],
        serviceNumbers: [],
        workTypeCounts: this.emptyWorkTypeCounts(),
        total: this.emptyCounts(),
        supportingStaffMap: new Map<string, PerformanceReportPerson>(),
        serviceNumberSet: new Set<string>(),
        seenWorkItems: new Set<string>(),
      };
      rows.set(key, row);
      return row;
    };

    for (const workItem of workItems) {
      if (!this.isInRange(workItem.createdAt, range)) continue;
      const primary = this.latestAssignment(workItem, WorkAssignmentRole.PRIMARY);
      if (!primary) continue;
      const date = this.formatKathmanduDate(workItem.createdAt);
      const row = ensureRow(primary.assignee, workItem, date);
      if (!row || row.seenWorkItems.has(workItem.id)) continue;
      identitiesWithWork.add(
        this.summaryIdentity(primary.assignee, workItem, groupBy)!.id,
      );

      const metrics = this.ticketMetrics(workItem, range);
      this.addMetrics(row.workTypeCounts[workItem.type], metrics);
      this.addMetrics(row.total, metrics);
      row.seenWorkItems.add(workItem.id);

      workItem.assignments
        .filter(
          (assignment) =>
            assignment.assignmentRole === WorkAssignmentRole.SUPPORTING &&
            this.assignmentTouchesRange(assignment, range),
        )
        .forEach((assignment) => {
          const person = this.toPerson(assignment.assignee);
          row.supportingStaffMap.set(person.id, person);
        });

      const serviceNumber = workItem.serviceNumber?.trim();
      if (serviceNumber) row.serviceNumberSet.add(serviceNumber);
    }

    if (staffMode === PerformanceReportStaffMode.ALL) {
      staffAccounts.forEach((person) => {
        const identity = this.summaryIdentity(person, null, groupBy);
        if (identity && !identitiesWithWork.has(identity.id)) {
          ensureRow(person, null, null);
        }
      });
    }

    return [...rows.values()]
      .map((row) => ({
        id: row.id,
        date: row.date,
        name: row.name,
        code: row.code,
        role: row.role,
        division: row.division,
        department: row.department,
        supportingStaff: [...row.supportingStaffMap.values()].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
        serviceNumbers: [...row.serviceNumberSet].sort(),
        workTypeCounts: row.workTypeCounts,
        total: row.total,
      }))
      .filter((row) =>
        staffMode === PerformanceReportStaffMode.ALL
          ? true
          : this.hasCounts(row.total),
      )
      .filter((row) => this.matchesSummarySearch(row, search))
      .sort((left, right) => {
        if (left.date === right.date) return left.name.localeCompare(right.name);
        if (left.date === null) return 1;
        if (right.date === null) return -1;
        return left.date.localeCompare(right.date);
      });
  }

  private summaryIdentity(
    person: ReportPersonRecord,
    workItem: WorkItemReportRecord | null,
    groupBy: PerformanceReportGroup,
  ): Pick<
    PerformanceSummaryRow,
    'id' | 'name' | 'code' | 'role' | 'division' | 'department'
  > | null {
    if (groupBy === PerformanceReportGroup.EMPLOYEE) {
      return {
        id: person.id,
        name: this.personName(person),
        code: person.employee?.empId ?? null,
        role: person.role,
        division: person.employee?.division ?? workItem?.division ?? null,
        department: person.employee?.departmentUnit
          ? {
              id: person.employee.departmentUnit.id,
              code: person.employee.departmentUnit.code,
              name: person.employee.departmentUnit.name,
            }
          : workItem?.department
            ? {
                id: workItem.department.id,
                code: workItem.department.code,
                name: workItem.department.name,
              }
            : null,
      };
    }

    if (groupBy === PerformanceReportGroup.DEPARTMENT) {
      const department = workItem?.department ?? person.employee?.departmentUnit;
      if (!department) return null;
      return {
        id: department.id,
        name: department.name,
        code: department.code,
        role: null,
        division: workItem?.division ?? person.employee?.division ?? null,
        department: {
          id: department.id,
          code: department.code,
          name: department.name,
        },
      };
    }

    const division = workItem?.division ?? person.employee?.division;
    if (!division) return null;
    return {
      id: division.id,
      name: division.name,
      code: division.code,
      role: null,
      division,
      department: null,
    };
  }

  private matchesSummarySearch(
    row: PerformanceSummaryRow,
    search: string | null,
  ): boolean {
    if (!search) return true;
    const term = search.toLocaleLowerCase();
    return [
      row.name,
      row.code,
      row.department?.name,
      row.division?.name,
      ...row.supportingStaff.map((person) => person.name),
      ...row.serviceNumbers,
    ]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(term));
  }

  private sumSummaryRows(rows: PerformanceSummaryRow[]): SummaryCounts {
    const total: SummaryCounts = {
      workTypeCounts: this.emptyWorkTypeCounts(),
      total: this.emptyCounts(),
    };
    rows.forEach((row) => {
      REPORT_WORK_TYPES.forEach((type) =>
        this.addCounts(total.workTypeCounts[type], row.workTypeCounts[type]),
      );
      this.addCounts(total.total, row.total);
    });
    return total;
  }

  private async loadWorkChain(
    workItems: WorkItemReportRecord[],
  ): Promise<Map<string, WorkItemReportRecord>> {
    const result = new Map(workItems.map((item) => [item.id, item]));
    let missingIds = [
      ...new Set(
        workItems
          .map((item) => item.parentWorkItemId)
          .filter((id): id is string => id !== null && !result.has(id)),
      ),
    ];

    // Delegation is expected to be shallow, but this limit also protects reports from broken circular data.
    for (let depth = 0; missingIds.length && depth < 8; depth += 1) {
      const parents = await this.prisma.workItem.findMany({
        where: { id: { in: missingIds } },
        select: workItemReportSelect,
      });
      parents.forEach((parent) => result.set(parent.id, parent));
      missingIds = [
        ...new Set(
          parents
            .map((parent) => parent.parentWorkItemId)
            .filter((id): id is string => id !== null && !result.has(id)),
        ),
      ];
    }

    const rootIds = [
      ...new Set(
        [...result.values()].map((item) => this.findRootWorkItem(item, result).id),
      ),
    ];
    let parentIds = rootIds;

    // Load every lower assignment so one main row can show the full work path.
    for (let depth = 0; parentIds.length && depth < 8; depth += 1) {
      const children = await this.prisma.workItem.findMany({
        where: { parentWorkItemId: { in: parentIds } },
        select: workItemReportSelect,
      });
      const newChildren = children.filter((child) => !result.has(child.id));
      newChildren.forEach((child) => result.set(child.id, child));
      parentIds = newChildren.map((child) => child.id);
    }

    return result;
  }

  private buildWorkDetails(
    workItems: WorkItemReportRecord[],
    workMap: Map<string, WorkItemReportRecord>,
    range: ReportRange,
  ): PerformanceWorkDetailRow[] {
    const rootIds = new Set(
      workItems.map((item) => this.findRootWorkItem(item, workMap).id),
    );

    return [...rootIds]
      .map((rootId) => {
        const root = workMap.get(rootId);
        if (!root) return null;
        const family = [...workMap.values()]
          .filter((item) => this.findRootWorkItem(item, workMap).id === rootId)
          .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
        const primary = this.latestAssignment(root, WorkAssignmentRole.PRIMARY);
        const supporting = this.uniquePeople(
          family.flatMap((item) =>
            item.assignments
              .filter(
                (assignment) =>
                  assignment.assignmentRole === WorkAssignmentRole.SUPPORTING &&
                  this.assignmentTouchesRange(assignment, range),
              )
              .map((assignment) => assignment.assignee),
          ),
        );
        const serviceNumbers = [
          ...new Set(
            family
              .map((item) => item.serviceNumber?.trim())
              .filter((value): value is string => Boolean(value)),
          ),
        ].sort();

        return {
          id: root.id,
          ticketNumber: root.ticketNumber,
          title: root.title,
          type: root.type,
          status: root.status,
          assignedBy: primary ? this.toPerson(primary.assignedBy) : null,
          mainWorker: primary ? this.toPerson(primary.assignee) : null,
          supportingStaff: supporting.map((person) => this.toPerson(person)),
          serviceNumbers,
          workAssignmentPaths: this.buildAssignmentPaths(root, family),
          division: root.division,
          department: root.department
            ? {
                id: root.department.id,
                code: root.department.code,
                name: root.department.name,
              }
            : null,
          plannedStartAt: root.plannedStartAt?.toISOString() ?? null,
          dueAt: root.dueAt.toISOString(),
          closedAt: root.closedAt?.toISOString() ?? null,
          pendingReason: this.workMetrics(root, range).pending
            ? this.pendingReason(root, range)
            : null,
        } satisfies PerformanceWorkDetailRow;
      })
      .filter((row): row is PerformanceWorkDetailRow => row !== null)
      .sort((left, right) => left.ticketNumber.localeCompare(right.ticketNumber));
  }

  private findRootWorkItem(
    workItem: WorkItemReportRecord,
    workMap: Map<string, WorkItemReportRecord>,
  ): WorkItemReportRecord {
    const visited = new Set<string>();
    let current = workItem;
    while (
      current.parentWorkItemId &&
      !visited.has(current.id) &&
      workMap.has(current.parentWorkItemId)
    ) {
      visited.add(current.id);
      current = workMap.get(current.parentWorkItemId)!;
    }
    return current;
  }

  private buildAssignmentPaths(
    root: WorkItemReportRecord,
    family: WorkItemReportRecord[],
  ): PerformanceReportPerson[][] {
    const children = new Map<string, WorkItemReportRecord[]>();
    family.forEach((item) => {
      if (!item.parentWorkItemId) return;
      const list = children.get(item.parentWorkItemId) ?? [];
      list.push(item);
      children.set(item.parentWorkItemId, list);
    });
    children.forEach((items) =>
      items.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime()),
    );

    const rootPrimary = this.latestAssignment(root, WorkAssignmentRole.PRIMARY);
    const start: ReportPersonRecord[] = [];
    this.appendPathPerson(start, rootPrimary?.assignedBy ?? root.createdBy);
    if (rootPrimary) this.appendPathPerson(start, rootPrimary.assignee);
    const paths: ReportPersonRecord[][] = [];

    const walk = (
      item: WorkItemReportRecord,
      people: ReportPersonRecord[],
      visited: Set<string>,
    ) => {
      if (visited.has(item.id) || visited.size >= 8) {
        paths.push(people);
        return;
      }
      const nextVisited = new Set(visited).add(item.id);
      const nextItems = children.get(item.id) ?? [];
      if (nextItems.length === 0) {
        paths.push(people);
        return;
      }
      nextItems.forEach((child) => {
        const primary = this.latestAssignment(child, WorkAssignmentRole.PRIMARY);
        const nextPeople = [...people];
        if (primary) {
          // Keep the actual giver and receiver for every lower assignment.
          this.appendPathPerson(nextPeople, primary.assignedBy);
          this.appendPathPerson(nextPeople, primary.assignee);
        }
        walk(child, nextPeople, nextVisited);
      });
    };

    walk(root, start, new Set<string>());
    return paths.map((path) => path.map((person) => this.toPerson(person)));
  }

  private appendPathPerson(
    path: ReportPersonRecord[],
    person: ReportPersonRecord,
  ): void {
    if (path.at(-1)?.id !== person.id) path.push(person);
  }

  private buildDutySummary(
    staffAccounts: ReportPersonRecord[],
    assignments: DutyAssignmentReportRecord[],
    exceptions: DutyExceptionReportRecord[],
    staffMode: PerformanceReportStaffMode,
    search: string | null,
  ): PerformanceDutySummaryRow[] {
    const rows = new Map<
      string,
      PerformanceDutySummaryRow & { scheduledDateSet: Set<string> }
    >();

    const ensureRow = (person: ReportPersonRecord) => {
      const existing = rows.get(person.id);
      if (existing) return existing;
      const row = {
        accountId: person.id,
        employeeId: person.employee?.empId ?? '—',
        employeeName: this.personName(person),
        jobTitle: person.employee?.designation ?? null,
        division: person.employee?.division ?? null,
        department: person.employee?.departmentUnit
          ? {
              id: person.employee.departmentUnit.id,
              code: person.employee.departmentUnit.code,
              name: person.employee.departmentUnit.name,
            }
          : null,
        scheduledDays: 0,
        assignments: 0,
        scheduledHours: 0,
        cancelled: 0,
        leaveDays: 0,
        holidayDays: 0,
        scheduledDateSet: new Set<string>(),
      };
      rows.set(person.id, row);
      return row;
    };

    staffAccounts.forEach(ensureRow);
    assignments.forEach((assignment) => {
      const row = ensureRow(assignment.employee);
      if (assignment.cancelledAt) {
        row.cancelled += 1;
        return;
      }
      row.assignments += 1;
      row.scheduledDateSet.add(this.formatKathmanduDate(assignment.dutyDate));
      row.scheduledHours += Math.max(
        0,
        (assignment.endsAt.getTime() - assignment.startsAt.getTime()) /
          (60 * 60 * 1000),
      );
    });
    exceptions.forEach((exception) => {
      const row = ensureRow(exception.employee);
      if (exception.type === DutyExceptionType.LEAVE) row.leaveDays += 1;
      if (exception.type === DutyExceptionType.HOLIDAY) row.holidayDays += 1;
    });

    let result = [...rows.values()].map((row) => ({
      ...row,
      scheduledDays: row.scheduledDateSet.size,
      scheduledHours: Math.round(row.scheduledHours * 100) / 100,
    }));

    if (staffMode === PerformanceReportStaffMode.WITH_WORK) {
      result = result.filter(
        (row) =>
          row.assignments > 0 ||
          row.cancelled > 0 ||
          row.leaveDays > 0 ||
          row.holidayDays > 0,
      );
    }
    if (search) {
      const term = search.toLocaleLowerCase();
      result = result.filter((row) =>
        [
          row.employeeName,
          row.employeeId,
          row.jobTitle,
          row.department?.name,
          row.division?.name,
        ]
          .filter(Boolean)
          .some((value) => value!.toLocaleLowerCase().includes(term)),
      );
    }

    return result
      .map((row) => ({
        accountId: row.accountId,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        jobTitle: row.jobTitle,
        division: row.division,
        department: row.department,
        scheduledDays: row.scheduledDays,
        assignments: row.assignments,
        scheduledHours: row.scheduledHours,
        cancelled: row.cancelled,
        leaveDays: row.leaveDays,
        holidayDays: row.holidayDays,
      }))
      .sort((left, right) =>
        left.employeeName.localeCompare(right.employeeName),
      );
  }

  private buildDutyDetails(
    assignments: DutyAssignmentReportRecord[],
    exceptions: DutyExceptionReportRecord[],
  ): PerformanceDutyDetailRow[] {
    const exceptionMap = new Map(
      exceptions.map((exception) => [
        `${exception.employee.id}:${this.formatKathmanduDate(exception.exceptionDate)}`,
        exception.type,
      ]),
    );

    return assignments.map((assignment) => {
      const date = this.formatKathmanduDate(assignment.dutyDate);
      const exception = exceptionMap.get(`${assignment.employee.id}:${date}`);
      return {
        id: assignment.id,
        date,
        employee: this.toPerson(assignment.employee),
        shift: assignment.shiftName,
        time: `${this.formatTime(assignment.startsAt)}–${this.formatTime(assignment.endsAt)}`,
        location: assignment.reportingLocation,
        supervisor: this.toPerson(assignment.supervisor),
        assignedBy: this.toPerson(assignment.createdBy),
        division: assignment.division,
        department: assignment.department
          ? {
              id: assignment.department.id,
              code: assignment.department.code,
              name: assignment.department.name,
            }
          : null,
        leaveOrHoliday:
          exception === DutyExceptionType.LEAVE
            ? 'LEAVE'
            : exception === DutyExceptionType.HOLIDAY
              ? 'HOLIDAY'
              : null,
        status: assignment.cancelledAt ? 'CANCELLED' : 'SCHEDULED',
      };
    });
  }

  private latestAssignment(
    workItem: WorkItemReportRecord,
    role: WorkAssignmentRole,
  ): WorkItemReportRecord['assignments'][number] | null {
    const matches = workItem.assignments.filter(
      (assignment) => assignment.assignmentRole === role,
    );
    return matches.at(-1) ?? null;
  }

  private workMetrics(
    workItem: WorkItemReportRecord,
    range: ReportRange,
  ): WorkMetrics {
    const assignedAt = workItem.plannedStartAt ?? workItem.createdAt;
    const assigned = this.isInRange(assignedAt, range);
    const completed = Boolean(
      workItem.closedAt && this.isInRange(workItem.closedAt, range),
    );
    const closedBeforeEnd = Boolean(
      workItem.closedAt && workItem.closedAt < range.endExclusive,
    );
    const cancelledBeforeEnd = Boolean(
      workItem.cancelledAt && workItem.cancelledAt < range.endExclusive,
    );
    const pending =
      assignedAt < range.endExclusive &&
      !closedBeforeEnd &&
      !cancelledBeforeEnd;
    return { assigned, completed, pending };
  }

  private assignmentTouchesRange(
    assignment: WorkItemReportRecord['assignments'][number],
    range: ReportRange,
  ): boolean {
    return (
      assignment.createdAt < range.endExclusive &&
      (!assignment.endedAt || assignment.endedAt >= range.start)
    );
  }

  private pendingReason(
    workItem: WorkItemReportRecord,
    range: ReportRange,
  ): string {
    if (workItem.dueAt < range.endExclusive) return 'Overdue';
    const labels: Record<WorkItemStatus, string> = {
      [WorkItemStatus.ASSIGNED]: 'Awaiting acknowledgement',
      [WorkItemStatus.ACKNOWLEDGED]: 'Ready to start',
      [WorkItemStatus.IN_PROGRESS]: 'In progress',
      [WorkItemStatus.HELP_REQUESTED]: 'Help requested',
      [WorkItemStatus.COMPLETED_PENDING_REVIEW]: 'Waiting for review',
      [WorkItemStatus.CLOSED]: 'Closed',
      [WorkItemStatus.REOPENED]: 'Reopened',
      [WorkItemStatus.BLOCKED]: 'Blocked',
      [WorkItemStatus.CANCELLED]: 'Cancelled',
    };
    return labels[workItem.status];
  }

  private ticketMetrics(
    workItem: WorkItemReportRecord,
    range: ReportRange,
  ): WorkMetrics {
    // Each date row answers how many tickets were created that day and their result by the report end date.
    const completedBeforeEnd = Boolean(
      workItem.closedAt && workItem.closedAt < range.endExclusive,
    );
    const cancelledBeforeEnd = Boolean(
      workItem.cancelledAt && workItem.cancelledAt < range.endExclusive,
    );
    return {
      assigned: this.isInRange(workItem.createdAt, range),
      completed: completedBeforeEnd,
      pending: !completedBeforeEnd && !cancelledBeforeEnd,
    };
  }

  private emptyWorkTypeCounts(): Record<WorkItemType, PerformanceReportCounts> {
    return {
      [WorkItemType.ROUTINE_TASK]: this.emptyCounts(),
      [WorkItemType.TROUBLE_TICKET]: this.emptyCounts(),
      [WorkItemType.MAINTENANCE]: this.emptyCounts(),
      [WorkItemType.NEW_CONNECTION]: this.emptyCounts(),
      [WorkItemType.UPDATE_SERVICES]: this.emptyCounts(),
      [WorkItemType.INSPECTION]: this.emptyCounts(),
      [WorkItemType.EMERGENCY_WORK]: this.emptyCounts(),
      [WorkItemType.ADMINISTRATIVE_TASK]: this.emptyCounts(),
    };
  }

  private emptyCounts(): PerformanceReportCounts {
    return { assigned: 0, completed: 0, pending: 0 };
  }

  private addMetrics(
    target: PerformanceReportCounts,
    metrics: WorkMetrics,
  ): void {
    if (metrics.assigned) target.assigned += 1;
    if (metrics.completed) target.completed += 1;
    if (metrics.pending) target.pending += 1;
  }

  private addCounts(
    target: PerformanceReportCounts,
    source: PerformanceReportCounts,
  ): void {
    target.assigned += source.assigned;
    target.completed += source.completed;
    target.pending += source.pending;
  }

  private hasCounts(counts: PerformanceReportCounts): boolean {
    return counts.assigned > 0 || counts.completed > 0 || counts.pending > 0;
  }

  private toPerson(person: ReportPersonRecord): PerformanceReportPerson {
    return {
      id: person.id,
      name: this.personName(person),
      employeeId: person.employee?.empId ?? null,
      role: person.role,
      jobTitle: person.employee?.designation ?? null,
    };
  }

  private personName(person: ReportPersonRecord): string {
    return person.employee?.empName ?? person.username ?? 'Unknown account';
  }

  private uniquePeople(people: ReportPersonRecord[]): ReportPersonRecord[] {
    const result = new Map<string, ReportPersonRecord>();
    people.forEach((person) => result.set(person.id, person));
    return [...result.values()];
  }

  private matchesWorkSearch(
    row: PerformanceWorkDetailRow,
    search: string | null,
  ): boolean {
    if (!search) return true;
    const term = search.toLocaleLowerCase();
    return [
      row.ticketNumber,
      row.title,
      row.assignedBy?.name,
      row.mainWorker?.name,
      ...row.supportingStaff.map((person) => person.name),
      ...row.serviceNumbers,
      ...row.workAssignmentPaths.flatMap((path) =>
        path.map((person) => person.name),
      ),
      row.division.name,
      row.department?.name,
    ]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(term));
  }

  private matchesDutySearch(
    row: PerformanceDutyDetailRow,
    search: string | null,
  ): boolean {
    if (!search) return true;
    const term = search.toLocaleLowerCase();
    return [
      row.employee.name,
      row.employee.employeeId,
      row.shift,
      row.location,
      row.supervisor.name,
      row.assignedBy.name,
      row.division.name,
      row.department?.name,
    ]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase().includes(term));
  }

  private exportRows(
    report: PerformanceReportResponse,
    section: PerformanceReportSection,
  ): Array<Array<string | number>> {
    if (section === PerformanceReportSection.WORK_SUMMARY) {
      const selectedType = this.toWorkItemType(report.filters.workType);
      const selectedTypes = selectedType ? [selectedType] : [...REPORT_WORK_TYPES];
      const headers = [
        'S.N.',
        'Date',
        'Employee / Group',
        'Supporting Staff',
        'Service Numbers',
        ...selectedTypes.flatMap((type) => [
          `${this.workTypeLabel(type)} Tickets`,
          `${this.workTypeLabel(type)} Completed`,
          `${this.workTypeLabel(type)} Pending`,
        ]),
        ...(report.filters.workType === PerformanceReportWorkType.ALL
          ? ['Total Tickets', 'Total Completed', 'Total Pending']
          : []),
      ];
      return [
        headers,
        ...report.summaryRows.map((row, index) => [
          index + 1,
          row.date ?? '—',
          row.code ? `${row.name} (${row.code})` : row.name,
          row.supportingStaff.map((person) => person.name).join('; ') || '—',
          row.serviceNumbers.join('; ') || '—',
          ...selectedTypes.flatMap((type) => [
            this.exportCount(row.workTypeCounts[type].assigned),
            this.exportCount(row.workTypeCounts[type].completed),
            this.exportCount(row.workTypeCounts[type].pending),
          ]),
          ...(report.filters.workType === PerformanceReportWorkType.ALL
            ? [
                this.exportCount(row.total.assigned),
                this.exportCount(row.total.completed),
                this.exportCount(row.total.pending),
              ]
            : []),
        ]),
      ];
    }

    if (section === PerformanceReportSection.WORK_DETAILS) {
      return [
        [
          'S.N.',
          'Ticket reference',
          'Work title',
          'Work type',
          'Assigned by',
          'Main responsible person',
          'Work path',
          'Supporting staff',
          'Service numbers',
          'Department',
          'Division',
          'Planned start',
          'Due date',
          'Status',
          'Completed date',
          'Pending reason',
        ],
        ...report.workDetails.map((row, index) => [
          index + 1,
          row.ticketNumber,
          row.title,
          this.workTypeLabel(row.type),
          row.assignedBy?.name ?? '—',
          row.mainWorker?.name ?? '—',
          row.workAssignmentPaths
            .map((path) => path.map((person) => person.name).join(' -> '))
            .join(' | ') || '—',
          row.supportingStaff.map((person) => person.name).join('; ') || '—',
          row.serviceNumbers.join('; ') || '—',
          row.department?.name ?? '—',
          row.division.name,
          row.plannedStartAt ?? '—',
          row.dueAt,
          row.status,
          row.closedAt ?? '—',
          row.pendingReason ?? '—',
        ]),
      ];
    }

    if (section === PerformanceReportSection.DUTY_SUMMARY) {
      return [
        [
          'S.N.',
          'Employee',
          'Employee ID',
          'Job title',
          'Division',
          'Department',
          'Scheduled days',
          'Duty assignments',
          'Scheduled hours',
          'Cancelled',
          'Leave days',
          'Holiday days',
        ],
        ...report.dutySummary.map((row, index) => [
          index + 1,
          row.employeeName,
          row.employeeId,
          row.jobTitle ?? '—',
          row.division?.name ?? '—',
          row.department?.name ?? '—',
          this.exportCount(row.scheduledDays),
          this.exportCount(row.assignments),
          this.exportCount(row.scheduledHours),
          this.exportCount(row.cancelled),
          this.exportCount(row.leaveDays),
          this.exportCount(row.holidayDays),
        ]),
      ];
    }

    return [
      [
        'S.N.',
        'Date',
        'Employee',
        'Employee ID',
        'Shift',
        'Time',
        'Location',
        'Supervisor',
        'Assigned by',
        'Division',
        'Department',
        'Leave / Holiday',
        'Status',
      ],
      ...report.dutyDetails.map((row, index) => [
        index + 1,
        row.date,
        row.employee.name,
        row.employee.employeeId ?? '—',
        row.shift,
        row.time,
        row.location,
        row.supervisor.name,
        row.assignedBy.name,
        row.division.name,
        row.department?.name ?? '—',
        row.leaveOrHoliday ?? '—',
        row.status,
      ]),
    ];
  }

  private exportCount(value: number): string | number {
    return value === 0 ? '—' : value;
  }

  private toWorkItemType(
    workType: PerformanceReportWorkType,
  ): WorkItemType | null {
    if (workType === PerformanceReportWorkType.ALL) return null;
    const mapping: Record<
      Exclude<PerformanceReportWorkType, PerformanceReportWorkType.ALL>,
      WorkItemType
    > = {
      [PerformanceReportWorkType.ROUTINE_TASK]: WorkItemType.ROUTINE_TASK,
      [PerformanceReportWorkType.TROUBLE_TICKET]: WorkItemType.TROUBLE_TICKET,
      [PerformanceReportWorkType.MAINTENANCE]: WorkItemType.MAINTENANCE,
      [PerformanceReportWorkType.NEW_CONNECTION]: WorkItemType.NEW_CONNECTION,
      [PerformanceReportWorkType.UPDATE_SERVICES]: WorkItemType.UPDATE_SERVICES,
      [PerformanceReportWorkType.INSPECTION]: WorkItemType.INSPECTION,
      [PerformanceReportWorkType.EMERGENCY_WORK]: WorkItemType.EMERGENCY_WORK,
      [PerformanceReportWorkType.ADMINISTRATIVE_TASK]:
        WorkItemType.ADMINISTRATIVE_TASK,
    };
    return mapping[workType];
  }

  private workTypeLabel(type: WorkItemType): string {
    const labels: Record<WorkItemType, string> = {
      [WorkItemType.ROUTINE_TASK]: 'Routine task',
      [WorkItemType.TROUBLE_TICKET]: 'Trouble ticket',
      [WorkItemType.MAINTENANCE]: 'Network maintenance',
      [WorkItemType.NEW_CONNECTION]: 'New installation',
      [WorkItemType.UPDATE_SERVICES]: 'Update services',
      [WorkItemType.INSPECTION]: 'Inspection',
      [WorkItemType.EMERGENCY_WORK]: 'Emergency work',
      [WorkItemType.ADMINISTRATIVE_TASK]: 'Administrative work',
    };
    return labels[type];
  }

  private toCsv(rows: Array<Array<string | number>>): string {
    return rows
      .map((row) => row.map((value) => this.csvCell(value)).join(','))
      .join('\r\n');
  }

  private csvCell(value: string | number): string {
    let text = String(value ?? '');
    // Prevent spreadsheet programs from treating report text as a formula.
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }

  private resolveRange(query: PerformanceReportQueryDto): ReportRange {
    const today = this.formatKathmanduDate(new Date());
    const from = query.from ?? today;
    const to = query.to ?? from;
    const start = this.parseKathmanduDate(from);
    const endStart = this.parseKathmanduDate(to);

    if (start > endStart) {
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

  private formatTime(value: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: BRANCH_TIME_ZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(value);
  }

  private isInRange(value: Date, range: ReportRange): boolean {
    return value >= range.start && value < range.endExclusive;
  }
}
