import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  AccountRole,
  DutyExceptionType,
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
import { WorkReportQueryDto } from './dto/work-report-query.dto';
import { WorkScopeService } from './work-scope.service';
import type { WorkActorContext } from './work-scope.service';

const BRANCH_TIME_ZONE = 'Asia/Kathmandu' as const;
const KATHMANDU_OFFSET_MS = 5.75 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REPORT_DAYS = 366;

export type WorkReportScopeType = 'PERSONAL' | 'ORG_UNIT' | 'OFFICE' | 'ORGANIZATION';

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
  orgUnit: { id: string; code: string; name: string } | null;
  reportingLocation: string;
  cancelledAt: string | null;
  cancellationReason: string | null;
}

export interface WorkReportDrilldownResponse {
  dataset: WorkReportDrilldownDataset;
  generatedAt: string;
  timezone: typeof BRANCH_TIME_ZONE;
  scope: {
    role: AccountRole;
    type: WorkReportScopeType;
    label: string;
    officeId: string | null;
    orgUnitId: string | null;
  };
  period: {
    from: string;
    to: string;
    days: number;
  };
  dutySummary: {
    scheduled: number;
    cancelled: number;
    uniqueEmployees: number;
    leaveDays: number;
  };
  sections: {
    work: null;
    performance: null;
    duty: {
      pagination: WorkReportDrilldownPagination;
      rows: WorkReportDrilldownDutyRow[];
    };
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

  async getDrilldown(
    user: AuthenticatedUser,
    query: WorkReportDrilldownQueryDto,
  ): Promise<WorkReportDrilldownResponse> {
    if (query.dataset !== WorkReportDrilldownDataset.DUTY_ASSIGNMENTS) {
      throw new BadRequestException(
        'Legacy Work report drill-downs are retired. Use the Reports V3 Office endpoints.',
      );
    }

    const actor = await this.workScopeService.resolveActorContext(user);
    const range = this.resolveRange(query);
    await this.assertReportFiltersInsideScope(actor, query);

    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const [scopeLabel, duty, dutySummary] = await Promise.all([
      this.resolveScopeLabel(actor),
      this.listDrilldownDutyRows(actor, range, query, page, limit),
      this.getDutyDrilldownSummary(actor, range, query),
    ]);

    return {
      dataset: WorkReportDrilldownDataset.DUTY_ASSIGNMENTS,
      generatedAt: new Date().toISOString(),
      timezone: BRANCH_TIME_ZONE,
      scope: {
        role: actor.role,
        type: this.getScopeType(actor),
        label: scopeLabel,
        officeId: actor.officeId ?? null,
        orgUnitId: actor.primaryOrgUnitId ?? null,
      },
      period: {
        from: range.from,
        to: range.to,
        days: range.days,
      },
      dutySummary,
      sections: {
        work: null,
        performance: null,
        duty,
      },
      notice: 'Duty records represent planned schedules, not verified attendance.',
    };
  }

  async exportCsv(
    user: AuthenticatedUser,
    query: ExportWorkReportQueryDto,
  ): Promise<WorkReportExport> {
    if (query.dataset !== WorkReportDataset.DUTY_ASSIGNMENTS) {
      throw new BadRequestException(
        'Legacy Work report exports are retired. Use the Reports V3 Office export endpoint.',
      );
    }

    const actor = await this.workScopeService.resolveActorContext(user);
    const range = this.resolveRange(query);
    await this.assertReportFiltersInsideScope(actor, query);
    return this.exportDutyAssignments(actor, range, query);
  }

  private async getDutyDrilldownSummary(
    actor: WorkActorContext,
    range: ReportRange,
    query: WorkReportQueryDto,
  ): Promise<WorkReportDrilldownResponse['dutySummary']> {
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

  private async listDrilldownDutyRows(
    actor: WorkActorContext,
    range: ReportRange,
    query: WorkReportDrilldownQueryDto,
    page: number,
    limit: number,
  ): Promise<WorkReportDrilldownResponse['sections']['duty']> {
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
          orgUnit: { select: { id: true, code: true, name: true } },
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
        orgUnit: record.orgUnit,
        reportingLocation: record.reportingLocation,
        cancelledAt: record.cancelledAt?.toISOString() ?? null,
        cancellationReason: record.cancellationReason,
      })),
    };
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
          shift: { select: { name: true } },
          orgUnit: { select: { code: true, name: true } },
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
        'Org Unit',
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
        row.orgUnit ? `${row.orgUnit.code} - ${row.orgUnit.name}` : '',
        row.reportingLocation,
        this.accountName(row.supervisor),
        row.cancelledAt ? 'Cancelled' : 'Scheduled',
        row.cancellationReason ?? '',
        row.notes ?? '',
      ]),
      total,
    );
  }

  private buildDutyWhere(
    actor: WorkActorContext,
    query: WorkReportQueryDto,
  ): Prisma.DutyAssignmentWhereInput {
    const where: Prisma.DutyAssignmentWhereInput = {};
    const hasManagementScope = this.hasV3ManagementAuthority(actor);

    if (actor.accountClass !== AccountClass.SUPER_ADMIN) {
      if (!hasManagementScope) {
        where.employeeAccountId = actor.accountId;
      } else {
        where.officeId = actor.officeId ?? '__missing_office__';
        const visibleOrgUnitIds = actor.visibleOrgUnitIds ?? [];
        if (visibleOrgUnitIds.length > 0) {
          where.orgUnitId = { in: visibleOrgUnitIds };
        }
      }
    }

    if (query.officeId) where.officeId = query.officeId;
    if (query.orgUnitId) where.orgUnitId = query.orgUnitId;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { reportingLocation: { contains: search, mode: 'insensitive' } },
        { shiftName: { contains: search, mode: 'insensitive' } },
        { shift: { is: { name: { contains: search, mode: 'insensitive' } } } },
        { employee: { is: { username: { contains: search, mode: 'insensitive' } } } },
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
    const hasManagementScope = this.hasV3ManagementAuthority(actor);

    if (actor.accountClass !== AccountClass.SUPER_ADMIN) {
      if (!hasManagementScope) {
        where.employeeAccountId = actor.accountId;
      } else {
        where.officeId = actor.officeId ?? '__missing_office__';
        const visibleOrgUnitIds = actor.visibleOrgUnitIds ?? [];
        if (visibleOrgUnitIds.length > 0) {
          where.orgUnitId = { in: visibleOrgUnitIds };
        }
      }
    }

    if (query.officeId) where.officeId = query.officeId;
    if (query.orgUnitId) where.orgUnitId = query.orgUnitId;
    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { note: { contains: search, mode: 'insensitive' } },
        { employee: { is: { username: { contains: search, mode: 'insensitive' } } } },
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
    if (!query.officeId && !query.orgUnitId) return;

    if (actor.accountClass !== AccountClass.SUPER_ADMIN && !this.hasV3ManagementAuthority(actor)) {
      throw new ForbiddenException('Personal reports cannot expand with organization filters.');
    }

    const officeId = query.officeId ?? actor.officeId ?? null;
    if (!officeId) {
      throw new ForbiddenException('The selected Office is outside your authorized report scope.');
    }
    if (actor.accountClass !== AccountClass.SUPER_ADMIN && actor.officeId !== officeId) {
      throw new ForbiddenException('The selected Office is outside your authorized report scope.');
    }

    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: { id: true, isActive: true },
    });
    if (!office?.isActive) {
      throw new ForbiddenException('The selected Office is outside your authorized report scope.');
    }

    if (!query.orgUnitId) return;
    const orgUnit = await this.prisma.orgUnit.findFirst({
      where: { id: query.orgUnitId, officeId, isActive: true },
      select: { id: true },
    });
    if (!orgUnit) {
      throw new ForbiddenException('The selected Org Unit is outside your authorized report scope.');
    }
    if (
      actor.accountClass !== AccountClass.SUPER_ADMIN &&
      !(actor.visibleOrgUnitIds ?? []).includes(query.orgUnitId)
    ) {
      throw new ForbiddenException('The selected Org Unit is outside your authorized report scope.');
    }
  }

  private async resolveScopeLabel(actor: WorkActorContext): Promise<string> {
    if (actor.accountClass === AccountClass.SUPER_ADMIN) return 'Patan Branch';

    if (this.hasV3ManagementAuthority(actor) && actor.officeId) {
      if (actor.primaryOrgUnitId) {
        const orgUnit = await this.prisma.orgUnit.findUnique({
          where: { id: actor.primaryOrgUnitId },
          select: { name: true },
        });
        if (orgUnit?.name) return orgUnit.name;
      }
      const office = await this.prisma.office.findUnique({
        where: { id: actor.officeId },
        select: { name: true },
      });
      if (office?.name) return office.name;
    }

    const account = await this.prisma.account.findUnique({
      where: { id: actor.accountId },
      select: { username: true, employee: { select: { empName: true } } },
    });
    return account?.employee?.empName ?? account?.username ?? 'My account';
  }

  private hasV3ManagementAuthority(actor: WorkActorContext): boolean {
    if (actor.accountClass === AccountClass.SUPER_ADMIN) return true;
    return (actor.assignableOrgUnitIds?.length ?? 0) > 0 || (actor.operationalTeamLeadIds?.length ?? 0) > 0;
  }

  private getScopeType(actor: WorkActorContext): WorkReportScopeType {
    if (actor.accountClass === AccountClass.SUPER_ADMIN) return 'ORGANIZATION';
    if (!this.hasV3ManagementAuthority(actor)) return 'PERSONAL';
    if (actor.primaryOrgUnitId) return 'ORG_UNIT';
    return 'OFFICE';
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
      ? filename.replace(/\.csv$/i, '-partial.csv')
      : filename;

    return {
      content: `\uFEFF${content}\r\n`,
      filename: protectedFilename,
      rowCount: rows.length,
      truncated,
    };
  }

  private csvCell(value: string | number | boolean | null | undefined): string {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }
}
