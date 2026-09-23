import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  Prisma,
  WorkAssignmentRole,
  WorkCompletionReviewStatus,
  WorkItemStatus,
  WorkSalesCoordinationStatus,
  WorkTypeVersionStatus,
} from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import {
  WorkReportExportDataset,
  WorkReportOfficeExportQueryDto,
} from './dto/work-report-office-export-query.dto';
import { WorkReportDrilldownDataset } from './dto/work-report-drilldown-query.dto';
import {
  WorkReportQueryDto,
  WorkReportRecordsQueryDto,
  WorkReportSlaState,
  WorkReportWorkflowStage,
} from './dto/work-report-office-query.dto';
import { WorkTypeTemplate } from './fixed-work-type-template';
import { isWorkSystemControlledFieldCode } from './work-foundation.constants';
import { WorkScopeService, type WorkActorContext } from './work-scope.service';
import { WorkReportsService } from './work-reports.service';

const KATHMANDU_OFFSET_MS = 5.75 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const CLASSIC_ACTIVE = [
  WorkItemStatus.ASSIGNED,
  WorkItemStatus.ACKNOWLEDGED,
  WorkItemStatus.IN_PROGRESS,
  WorkItemStatus.HELP_REQUESTED,
  WorkItemStatus.REOPENED,
  WorkItemStatus.BLOCKED,
  WorkItemStatus.COMPLETED_PENDING_REVIEW,
] as const;

const workRecordSelect = {
  id: true,
  ticketNumber: true,
  title: true,
  status: true,
  registeredAt: true,
  plannedStartAt: true,
  dueAt: true,
  completedAt: true,
  closedAt: true,
  cancelledAt: true,
  createdAt: true,
  primaryOwnerOrgUnitId: true,
  assignedOperationalTeamId: true,
  customerName: true,
  locationText: true,
  requestNumber: true,
  serviceNumber: true,
  cpcSerial: true,
  olt: true,
  fdcName: true,
  fapName: true,
  salesMemberAccountId: true,
  salesCoordinationStatus: true,
  workTypeVersion: {
    select: {
      id: true,
      name: true,
      template: true,
      workTypeDefinition: {
        select: { id: true, code: true, isActive: true },
      },
      fields: {
        orderBy: { sortOrder: 'asc' as const },
        select: {
          id: true,
          code: true,
          label: true,
          fieldType: true,
          stageDefinitionId: true,
          config: true,
        },
      },
    },
  },
  fieldValues: {
    select: {
      fieldDefinitionId: true,
      value: true,
    },
  },
  primaryOwnerOrgUnit: {
    select: { id: true, code: true, name: true, parentOrgUnitId: true },
  },
  assignedOperationalTeam: {
    select: { id: true, code: true, name: true, orgUnitId: true },
  },
  references: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      referenceType: true,
      value: true,
      sourceFieldDefinitionId: true,
    },
  },
  assignments: {
    where: { endedAt: null },
    orderBy: { createdAt: 'asc' as const },
    select: {
      assignmentRole: true,
      acknowledgedAt: true,
      startedAt: true,
      assignee: {
        select: {
          id: true,
          username: true,
          employee: { select: { empId: true, empName: true } },
        },
      },
    },
  },
  responsibleReviewer: {
    select: {
      id: true,
      username: true,
      employee: { select: { empId: true, empName: true } },
    },
  },
  salesMember: {
    select: {
      id: true,
      username: true,
      employee: { select: { empId: true, empName: true } },
    },
  },
  completionReports: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: { reviewStatus: true },
  },
  childWorkItems: {
    select: { status: true },
  },
} satisfies Prisma.WorkItemSelect;

type WorkRecord = Prisma.WorkItemGetPayload<{
  select: typeof workRecordSelect;
}>;
type ReportAccount = NonNullable<WorkRecord['responsibleReviewer']>;
type ReportReference = { label: string; value: string; display: string };
type ReportInformationItem = {
  code: string;
  label: string;
  value: string;
  display: string;
};
type ReportStaff = {
  accountId: string;
  name: string;
  employeeId: string | null;
};
type PerformanceCounts = {
  tickets: number;
  completed: number;
  pending: number;
};
type PerformanceRow = {
  date: string;
  orgUnit: NonNullable<WorkRecord['primaryOwnerOrgUnit']>;
  operationalTeam: NonNullable<WorkRecord['assignedOperationalTeam']>;
  supportStaff: ReportStaff[];
  otherStaff: ReportStaff[];
  references: ReportReference[];
  workTypes: Record<string, PerformanceCounts>;
  total: PerformanceCounts;
};
type OverviewTeamSummary = {
  teamId: string;
  name: string;
  orgUnitId: string;
  orgUnitName: string;
  activeWork: number;
  newWork: number;
  inProgress: number;
  waitingForSales: number;
  waitingForApproval: number;
  returnedForCorrection: number;
  overdueWork: number;
  completedDuring: number;
};
type DutyExportRow = {
  dutyDate: string;
  employee: string;
  employeeId: string | null;
  designation: string | null;
  shift: string;
  startsAt: string;
  endsAt: string;
  orgUnit: { name: string } | null;
  operationalTeam: { name: string } | null;
  reportingLocation: string | null;
  supervisor: string;
  status: string;
  cancellationReason: string | null;
  notes: string | null;
};
type DutyExportContent = {
  sections?: { duty?: { rows: DutyExportRow[] } | null } | null;
};
type WorkRecordExportRow = {
  ticketNumber: string;
  workType: { name: string };
  workflowStage: string;
  primaryOwner: { name: string };
  executionTeams: Array<{ name: string }>;
  primaryAssignee: string;
  startedBy: string | null;
  reference: ReportReference | null;
  information: ReportInformationItem[];
  salesCoordinationStatus: WorkSalesCoordinationStatus | null;
  salesMember: string | null;
  responsibleReviewer: string;
  createdAt: string;
  dueAt: string;
  closedAt: string | null;
};
type TechnicalPerformanceExport = {
  workTypeGroups: Array<{ id: string; name: string }>;
  rows: PerformanceRow[];
};
type OverviewExport = {
  work?: { totals?: { activeAtEnd?: number; completionRate?: number | null } };
  workflow?: {
    completedDuring?: number;
    waitingForApproval?: number;
    overdue?: number;
    newWork?: number;
    inProgress?: number;
    waitingForSales?: number;
    returnedForCorrection?: number;
  };
  trend?: Array<{ date: string; workCreated: number; workClosed: number }>;
  teams?: OverviewTeamSummary[];
};

@Injectable()
export class WorkReportsClassicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workScopeService: WorkScopeService,
    private readonly workReportsService: WorkReportsService,
    private readonly authorization: OrganizationAuthorizationService,
  ) {}

  private async assertReportAccess(
    user: AuthenticatedUser,
    officeId: string,
    exportRequired = false,
  ): Promise<void> {
    if (user.accountClass === AccountClass.SUPER_ADMIN) return;
    await this.authorization.assertCan(
      user,
      exportRequired ? CAPABILITIES.REPORTS_EXPORT : CAPABILITIES.REPORTS_VIEW,
      officeId,
      null,
    );
  }

  async getContext(user: AuthenticatedUser, officeId: string) {
    await this.assertReportAccess(user, officeId);
    const actor = await this.workScopeService.resolveActorContext(user);
    this.assertOffice(actor, officeId);
    const office = await this.prisma.office.findFirst({
      where: { id: officeId, isActive: true },
      select: { id: true, code: true, name: true, isActive: true },
    });
    if (!office) throw new NotFoundException('An active Office was not found.');

    const visibleOrgUnitIds =
      actor.accountClass === AccountClass.SUPER_ADMIN
        ? undefined
        : (actor.visibleOrgUnitIds ?? []);
    const orgUnits = await this.prisma.orgUnit.findMany({
      where: {
        officeId,
        isActive: true,
        ...(visibleOrgUnitIds ? { id: { in: visibleOrgUnitIds } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, isActive: true },
    });
    const orgUnitIds = orgUnits.map((unit) => unit.id);
    const teams = await this.prisma.operationalTeam.findMany({
      where: {
        orgUnit: { officeId },
        isActive: true,
        archivedAt: null,
        ...(visibleOrgUnitIds ? { orgUnitId: { in: orgUnitIds } } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        orgUnitId: true,
        isActive: true,
        archivedAt: true,
      },
    });
    const workTypes = await this.prisma.workTypeDefinition.findMany({
      where: {
        officeId,
        versions: { some: { status: WorkTypeVersionStatus.PUBLISHED } },
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        isActive: true,
        versions: {
          where: { status: WorkTypeVersionStatus.PUBLISHED },
          orderBy: { version: 'desc' },
          take: 1,
          select: { name: true, template: true },
        },
      },
    });

    const teamIds = [
      ...new Set([
        ...(actor.operationalTeamLeadIds ?? []),
        ...(actor.operationalTeamMemberIds ?? []),
      ]),
    ];
    const scopeType =
      actor.accountClass === AccountClass.SUPER_ADMIN
        ? 'OFFICE'
        : (actor.assignableOrgUnitIds?.length ?? 0) > 0
          ? 'ORG_UNIT_SUBTREE'
          : teamIds.length > 0
            ? 'TEAM'
            : 'PERSONAL';

    return {
      office,
      scope: {
        type: scopeType,
        officeId,
        accountId: actor.accountId,
        orgUnitIds,
        operationalTeamIds: teams.map((team) => team.id),
        availableActions: { view: true, export: true },
      },
      filters: {
        orgUnits,
        operationalTeams: teams,
        workTypes: workTypes.map((definition) => ({
          id: definition.id,
          code: definition.code,
          name: definition.versions[0]?.name ?? definition.code,
          template:
            definition.versions[0]?.template ?? WorkTypeTemplate.STANDARD,
          isActive: definition.isActive,
        })),
        canFilterByOrgUnit: orgUnits.length > 1,
        canFilterByOperationalTeam: teams.length > 1,
      },
    };
  }

  async getOverview(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportQueryDto,
  ) {
    await this.assertReportAccess(user, officeId);
    const actor = await this.workScopeService.resolveActorContext(user);
    this.assertOffice(actor, officeId);

    const period = this.resolvePeriod(query.from, query.to);
    const baseWhere = await this.buildWhere(actor, officeId, {
      ...query,
      from: undefined,
      to: undefined,
      workflowStage: undefined,
      slaState: undefined,
      status: undefined,
      search: undefined,
    });
    const filteredWhere = await this.buildWhere(actor, officeId, query);
    const catalogWhere = await this.buildWhere(actor, officeId, {
      ...query,
      from: undefined,
      to: undefined,
      workTypeId: undefined,
      workflowStage: undefined,
      slaState: undefined,
      status: undefined,
      search: undefined,
    });
    const now = new Date();
    const cutoff = new Date(
      Math.min(now.getTime(), period.endExclusive.getTime()),
    );

    const [periodRows, createdRows, closedRows, activeRows, workTypeRows] =
      await Promise.all([
        this.prisma.workItem.findMany({
          where: filteredWhere,
          select: {
            id: true,
            status: true,
            dueAt: true,
            createdAt: true,
            closedAt: true,
            salesCoordinationStatus: true,
            assignedOperationalTeamId: true,
            assignedOperationalTeam: {
              select: { id: true, code: true, name: true, orgUnitId: true },
            },
            primaryOwnerOrgUnit: {
              select: { id: true, code: true, name: true },
            },
            completionReports: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { reviewStatus: true },
            },
          },
        }),
        this.prisma.workItem.findMany({
          where: {
            AND: [
              baseWhere,
              { createdAt: { gte: period.start, lt: period.endExclusive } },
            ],
          },
          select: { createdAt: true, closedAt: true },
        }),
        this.prisma.workItem.findMany({
          where: {
            AND: [
              baseWhere,
              { closedAt: { gte: period.start, lt: period.endExclusive } },
            ],
          },
          select: {
            closedAt: true,
            assignedOperationalTeamId: true,
          },
        }),
        this.prisma.workItem.findMany({
          where: {
            AND: [
              baseWhere,
              { createdAt: { lt: period.endExclusive } },
              { status: { in: [...CLASSIC_ACTIVE] } },
            ],
          },
          select: {
            id: true,
            status: true,
            dueAt: true,
            salesCoordinationStatus: true,
            assignedOperationalTeamId: true,
            assignedOperationalTeam: {
              select: { id: true, code: true, name: true, orgUnitId: true },
            },
            primaryOwnerOrgUnit: {
              select: { id: true, code: true, name: true },
            },
            completionReports: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { reviewStatus: true },
            },
          },
        }),
        this.prisma.workItem.findMany({
          where: {
            AND: [
              catalogWhere,
              {
                OR: [
                  { createdAt: { gte: period.start, lt: period.endExclusive } },
                  { closedAt: { gte: period.start, lt: period.endExclusive } },
                  { status: { in: [...CLASSIC_ACTIVE] } },
                ],
              },
            ],
          },
          distinct: ['workTypeVersionId'],
          select: {
            workTypeVersion: {
              select: {
                id: true,
                name: true,
                template: true,
                workTypeDefinition: {
                  select: { id: true, code: true, isActive: true },
                },
              },
            },
          },
        }),
      ]);

    const statuses: Record<WorkItemStatus, number> = {
      ASSIGNED: 0,
      ACKNOWLEDGED: 0,
      IN_PROGRESS: 0,
      HELP_REQUESTED: 0,
      COMPLETED_PENDING_REVIEW: 0,
      CLOSED: 0,
      REOPENED: 0,
      BLOCKED: 0,
      CANCELLED: 0,
    };
    for (const row of periodRows) {
      statuses[row.status] += 1;
    }

    const workflow = {
      newWork: 0,
      inProgress: 0,
      waitingForSales: 0,
      waitingForApproval: 0,
      returnedForCorrection: 0,
      overdue: activeRows.filter((row) => row.dueAt < cutoff).length,
      completedDuring: closedRows.length,
    };

    const teamMap = new Map<string, OverviewTeamSummary>();
    const ensureTeam = (
      row: (typeof activeRows)[number],
    ): OverviewTeamSummary | null => {
      const team = row.assignedOperationalTeam;
      if (!team) return null;
      const existing = teamMap.get(team.id) ?? {
        teamId: team.id,
        name: team.name,
        orgUnitId: team.orgUnitId,
        orgUnitName: row.primaryOwnerOrgUnit?.name ?? 'Org Unit',
        activeWork: 0,
        newWork: 0,
        inProgress: 0,
        waitingForSales: 0,
        waitingForApproval: 0,
        returnedForCorrection: 0,
        overdueWork: 0,
        completedDuring: 0,
      };
      teamMap.set(team.id, existing);
      return existing;
    };

    for (const row of activeRows) {
      const stage = this.workflowStage(row);
      if (stage === 'NEW') workflow.newWork += 1;
      if (stage === 'IN_PROGRESS') workflow.inProgress += 1;
      if (stage === 'WAITING_FOR_SALES') workflow.waitingForSales += 1;
      if (stage === 'WAITING_FOR_APPROVAL') workflow.waitingForApproval += 1;
      if (stage === 'RETURNED_FOR_CORRECTION')
        workflow.returnedForCorrection += 1;

      const team = ensureTeam(row);
      if (!team) continue;
      team.activeWork += 1;
      if (stage === 'NEW') team.newWork += 1;
      if (stage === 'IN_PROGRESS') team.inProgress += 1;
      if (stage === 'WAITING_FOR_SALES') team.waitingForSales += 1;
      if (stage === 'WAITING_FOR_APPROVAL') team.waitingForApproval += 1;
      if (stage === 'RETURNED_FOR_CORRECTION') team.returnedForCorrection += 1;
      if (row.dueAt < cutoff) team.overdueWork += 1;
    }

    for (const row of closedRows) {
      if (!row.assignedOperationalTeamId) continue;
      const existing = teamMap.get(row.assignedOperationalTeamId);
      if (existing) existing.completedDuring += 1;
    }

    const trendByDate = new Map<
      string,
      { date: string; workCreated: number; workClosed: number }
    >();
    for (const row of createdRows) {
      const date = this.kathmanduDate(row.createdAt);
      const trend = trendByDate.get(date) ?? {
        date,
        workCreated: 0,
        workClosed: 0,
      };
      trend.workCreated += 1;
      trendByDate.set(date, trend);
    }
    for (const row of closedRows) {
      if (!row.closedAt) continue;
      const date = this.kathmanduDate(row.closedAt);
      const trend = trendByDate.get(date) ?? {
        date,
        workCreated: 0,
        workClosed: 0,
      };
      trend.workClosed += 1;
      trendByDate.set(date, trend);
    }

    const createdAndClosed = createdRows.filter(
      (row) => row.closedAt && row.closedAt < period.endExclusive,
    ).length;
    const reportableWorkTypes = workTypeRows.flatMap((row) => {
      const version = row.workTypeVersion;
      if (!version) return [];
      return [
        {
          id: version.workTypeDefinition.id,
          versionId: version.id,
          code: version.workTypeDefinition.code,
          name: version.name,
          template: version.template,
          isActive: version.workTypeDefinition.isActive,
        },
      ];
    });

    return {
      generatedAt: now.toISOString(),
      period: {
        from: period.from,
        to: period.to,
        days: period.days,
      },
      totalWork: periodRows.length,
      statuses,
      sla: {
        overdue: workflow.overdue,
        dueSoon: activeRows.filter((row) => {
          const ms = row.dueAt.getTime() - now.getTime();
          return ms >= 0 && ms <= 60 * 60 * 1000;
        }).length,
      },
      work: {
        totals: {
          activeAtEnd: activeRows.length,
          completionRate:
            createdRows.length > 0
              ? Math.round((createdAndClosed / createdRows.length) * 1000) / 10
              : null,
        },
      },
      workflow,
      teams: [...teamMap.values()].filter(
        (team) => team.activeWork > 0 || team.completedDuring > 0,
      ),
      trend: [...trendByDate.values()].sort((left, right) =>
        left.date.localeCompare(right.date),
      ),
      workTypeOptions: reportableWorkTypes,
    };
  }

  async getWorkRecords(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportRecordsQueryDto,
  ) {
    await this.assertReportAccess(user, officeId);
    const actor = await this.workScopeService.resolveActorContext(user);
    this.assertOffice(actor, officeId);
    const where = await this.buildWhere(actor, officeId, query);
    const [total, rows] = await Promise.all([
      this.prisma.workItem.count({ where }),
      this.prisma.workItem.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: workRecordSelect,
      }),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(Math.ceil(total / query.limit), 1),
      items: rows.map((row) => this.serializeRecord(row)),
    };
  }

  async getTechnicalPerformance(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportQueryDto,
  ) {
    await this.assertReportAccess(user, officeId);
    const actor = await this.workScopeService.resolveActorContext(user);
    this.assertOffice(actor, officeId);
    const where = await this.buildWhere(actor, officeId, query);
    const rows = await this.prisma.workItem.findMany({
      where: {
        AND: [
          where,
          {
            workTypeVersion: {
              is: { template: { not: WorkTypeTemplate.ADMINISTRATIVE } },
            },
          },
          { assignedOperationalTeamId: { not: null } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: workRecordSelect,
    });

    const blank = (): PerformanceCounts => ({
      tickets: 0,
      completed: 0,
      pending: 0,
    });
    const grouped = new Map<string, PerformanceRow>();
    const totalTypes: Record<string, PerformanceCounts> = {};
    const grand = blank();
    const workTypeGroups = new Map<
      string,
      {
        id: string;
        definitionId: string;
        code: string;
        name: string;
        referenceLabel: string;
      }
    >();

    for (const row of rows) {
      const team = row.assignedOperationalTeam;
      const org = row.primaryOwnerOrgUnit;
      const version = row.workTypeVersion;
      if (!org || !team || !version) continue;

      const groupId = version.id;
      const reportReference = this.resolveReportReference(row);
      if (!workTypeGroups.has(groupId)) {
        workTypeGroups.set(groupId, {
          id: groupId,
          definitionId: version.workTypeDefinition.id,
          code: version.workTypeDefinition.code,
          name: version.name,
          referenceLabel: reportReference?.label ?? 'Reference',
        });
      }

      const date = this.kathmanduDate(row.createdAt);
      const key = `${date}:${team.id}`;
      const item = grouped.get(key) ?? {
        date,
        orgUnit: org,
        operationalTeam: team,
        supportStaff: [] as ReportStaff[],
        otherStaff: [] as ReportStaff[],
        references: [] as ReportReference[],
        workTypes: {},
        total: blank(),
      };
      const counts = item.workTypes[groupId] ?? blank();
      counts.tickets += 1;
      item.total.tickets += 1;
      const globalType = totalTypes[groupId] ?? blank();
      globalType.tickets += 1;
      grand.tickets += 1;
      if (row.status === WorkItemStatus.CLOSED) {
        counts.completed += 1;
        item.total.completed += 1;
        globalType.completed += 1;
        grand.completed += 1;
      } else {
        counts.pending += 1;
        item.total.pending += 1;
        globalType.pending += 1;
        grand.pending += 1;
      }
      item.workTypes[groupId] = counts;
      totalTypes[groupId] = globalType;

      for (const assignment of row.assignments) {
        const staff = {
          accountId: assignment.assignee.id,
          name:
            assignment.assignee.employee?.empName ??
            assignment.assignee.username ??
            'NT Message User',
          employeeId: assignment.assignee.employee?.empId ?? null,
        };
        if (assignment.assignmentRole === WorkAssignmentRole.SUPPORTING) {
          if (
            !item.supportStaff.some(
              (person) => person.accountId === staff.accountId,
            )
          ) {
            item.supportStaff.push(staff);
          }
        }
      }

      if (row.salesMember) {
        const sales = {
          accountId: row.salesMember.id,
          name:
            row.salesMember.employee?.empName ??
            row.salesMember.username ??
            'Sales',
          employeeId: row.salesMember.employee?.empId ?? null,
        };
        if (
          !item.otherStaff.some(
            (person) => person.accountId === sales.accountId,
          )
        ) {
          item.otherStaff.push(sales);
        }
      }

      if (
        reportReference &&
        !item.references.some(
          (reference) =>
            reference.label === reportReference.label &&
            reference.value === reportReference.value,
        )
      ) {
        item.references.push(reportReference);
      }
      grouped.set(key, item);
    }

    return {
      generatedAt: new Date().toISOString(),
      workTypeGroups: [...workTypeGroups.values()],
      rows: [...grouped.values()],
      totals: { workTypes: totalTypes, total: grand },
    };
  }

  async getPrintPayload(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportOfficeExportQueryDto,
  ) {
    await this.assertReportAccess(user, officeId, true);
    const context = await this.getContext(user, officeId);
    const period = { from: query.from ?? null, to: query.to ?? null };
    if (query.dataset === WorkReportExportDataset.OVERVIEW) {
      const content = await this.getOverview(user, officeId, query);
      return {
        dataset: query.dataset,
        generatedAt: new Date().toISOString(),
        office: context.office,
        period,
        rowCount: content.totalWork,
        content,
      };
    }
    if (query.dataset === WorkReportExportDataset.WORK_RECORDS) {
      const content = await this.getAllWorkRecords(user, officeId, query);
      return {
        dataset: query.dataset,
        generatedAt: new Date().toISOString(),
        office: context.office,
        period,
        rowCount: content.length,
        content,
      };
    }
    if (query.dataset === WorkReportExportDataset.TECHNICAL_PERFORMANCE) {
      const content = await this.getTechnicalPerformance(user, officeId, query);
      return {
        dataset: query.dataset,
        generatedAt: new Date().toISOString(),
        office: context.office,
        period,
        rowCount: content.rows.length,
        content,
      };
    }
    if (query.dataset === WorkReportExportDataset.DUTY_ASSIGNMENTS) {
      const first = await this.workReportsService.getDrilldown(user, {
        dataset: WorkReportDrilldownDataset.DUTY_ASSIGNMENTS,
        officeId,
        from: query.from,
        to: query.to,
        orgUnitId: query.orgUnitId,
        operationalTeamId: query.operationalTeamId,
        search: query.search,
        page: 1,
        limit: 100,
      });
      const rows = [...(first.sections.duty?.rows ?? [])];
      const totalPages = first.sections.duty?.pagination.totalPages ?? 1;
      for (let page = 2; page <= totalPages; page += 1) {
        const next = await this.workReportsService.getDrilldown(user, {
          dataset: WorkReportDrilldownDataset.DUTY_ASSIGNMENTS,
          officeId,
          from: query.from,
          to: query.to,
          orgUnitId: query.orgUnitId,
          operationalTeamId: query.operationalTeamId,
          search: query.search,
          page,
          limit: 100,
        });
        rows.push(...(next.sections.duty?.rows ?? []));
      }
      const content = {
        ...first,
        sections: {
          ...first.sections,
          duty: first.sections.duty ? { ...first.sections.duty, rows } : null,
        },
      };
      return {
        dataset: query.dataset,
        generatedAt: new Date().toISOString(),
        office: context.office,
        period,
        rowCount: rows.length,
        content,
      };
    }
    return {
      dataset: query.dataset,
      generatedAt: new Date().toISOString(),
      office: context.office,
      period,
      rowCount: 0,
      content: [],
    };
  }

  async exportCsv(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportOfficeExportQueryDto,
  ) {
    await this.assertReportAccess(user, officeId, true);
    const payload = await this.getPrintPayload(user, officeId, query);
    let rows: string[][];

    if (query.dataset === WorkReportExportDataset.DUTY_ASSIGNMENTS) {
      const report = payload.content as DutyExportContent;
      const dutyRows = report.sections?.duty?.rows ?? [];
      rows = [
        [
          'Duty Date',
          'Employee',
          'Employee ID',
          'Designation',
          'Shift',
          'Starts At',
          'Ends At',
          'Org Unit',
          'Operational Team',
          'Reporting Location',
          'Supervisor',
          'Status',
          'Cancellation Reason',
          'Notes',
        ],
        ...dutyRows.map((row) => [
          row.dutyDate ?? '',
          row.employee ?? '',
          row.employeeId ?? '',
          row.designation ?? '',
          row.shift ?? '',
          row.startsAt ?? '',
          row.endsAt ?? '',
          row.orgUnit?.name ?? '',
          row.operationalTeam?.name ?? '',
          row.reportingLocation ?? '',
          row.supervisor ?? '',
          row.status ?? '',
          row.cancellationReason ?? '',
          row.notes ?? '',
        ]),
      ];
    } else if (query.dataset === WorkReportExportDataset.WORK_RECORDS) {
      rows = [
        [
          'Ticket',
          'Work Type',
          'Stage',
          'Execution OrgUnit',
          'Main Team / Owner',
          'Started By',
          'Reference',
          'Information',
          'Sales Status',
          'Sales Member',
          'Responsible Reviewer',
          'Created At',
          'Due At',
          'Manager Approved At',
        ],
        ...(payload.content as WorkRecordExportRow[]).map((row) => [
          row.ticketNumber,
          row.workType.name,
          row.workflowStage,
          row.primaryOwner.name,
          row.executionTeams.map((team) => team.name).join('; ') ||
            row.primaryAssignee ||
            '',
          row.startedBy ?? '',
          row.reference?.display ?? '',
          (row.information ?? []).map((item) => item.display).join('; '),
          row.salesCoordinationStatus ?? 'NOT_REQUIRED',
          row.salesMember ?? '',
          row.responsibleReviewer ?? '',
          row.createdAt ?? '',
          row.dueAt ?? '',
          row.closedAt ?? '',
        ]),
      ];
    } else if (
      query.dataset === WorkReportExportDataset.TECHNICAL_PERFORMANCE
    ) {
      const report = payload.content as TechnicalPerformanceExport;
      const groups = report.workTypeGroups ?? [];
      rows = [
        [
          'S.N.',
          'Date',
          'Execution OrgUnit',
          'Team',
          'Support Staff',
          'Other Staff',
          'Reference',
          ...groups.flatMap((group) => [
            `${group.name} Tickets`,
            `${group.name} Completed`,
            `${group.name} Pending`,
          ]),
          ...(groups.length > 1
            ? ['Total Tickets', 'Total Completed', 'Total Pending']
            : []),
        ],
        ...report.rows.map((row, index) => [
          String(index + 1),
          row.date,
          row.orgUnit.name,
          row.operationalTeam?.name ?? '',
          String(row.supportStaff.length),
          String(row.otherStaff.length),
          row.references.map((reference) => reference.display).join('; '),
          ...groups.flatMap((group) => {
            const counts = row.workTypes[group.id] ?? {
              tickets: 0,
              completed: 0,
              pending: 0,
            };
            return [
              String(counts.tickets),
              String(counts.completed),
              String(counts.pending),
            ];
          }),
          ...(groups.length > 1
            ? [
                String(row.total.tickets),
                String(row.total.completed),
                String(row.total.pending),
              ]
            : []),
        ]),
      ];
    } else {
      const overview = payload.content as OverviewExport;
      rows = [
        ['Section', 'Metric', 'Value'],
        ['Context', 'Office', payload.office.name],
        ['Context', 'From', payload.period.from ?? ''],
        ['Context', 'To', payload.period.to ?? ''],
        ['KPI', 'Active Work', String(overview.work?.totals?.activeAtEnd ?? 0)],
        ['KPI', 'Completed', String(overview.workflow?.completedDuring ?? 0)],
        [
          'KPI',
          'Need Review',
          String(overview.workflow?.waitingForApproval ?? 0),
        ],
        ['KPI', 'Overdue', String(overview.workflow?.overdue ?? 0)],
        [
          'KPI',
          'Completion Rate (%)',
          String(overview.work?.totals?.completionRate ?? ''),
        ],
        ['Workflow', 'New', String(overview.workflow?.newWork ?? 0)],
        ['Workflow', 'In Progress', String(overview.workflow?.inProgress ?? 0)],
        [
          'Workflow',
          'Waiting for Sales',
          String(overview.workflow?.waitingForSales ?? 0),
        ],
        [
          'Workflow',
          'Waiting for Approval',
          String(overview.workflow?.waitingForApproval ?? 0),
        ],
        [
          'Workflow',
          'Returned for Correction',
          String(overview.workflow?.returnedForCorrection ?? 0),
        ],
        ...(overview.trend ?? []).flatMap((day) => [
          ['Trend', `${day.date} · Created`, String(day.workCreated)],
          ['Trend', `${day.date} · Completed`, String(day.workClosed)],
        ]),
        ...(overview.teams ?? []).flatMap((team) => [
          [
            'Team Performance',
            `${team.name} · Active`,
            String(team.activeWork),
          ],
          [
            'Team Performance',
            `${team.name} · In Progress`,
            String(team.inProgress),
          ],
          [
            'Team Performance',
            `${team.name} · Waiting for Sales`,
            String(team.waitingForSales),
          ],
          [
            'Team Performance',
            `${team.name} · Need Review`,
            String(team.waitingForApproval),
          ],
          [
            'Team Performance',
            `${team.name} · Overdue`,
            String(team.overdueWork),
          ],
          [
            'Team Performance',
            `${team.name} · Completed`,
            String(team.completedDuring),
          ],
        ]),
      ];
    }

    const content = rows
      .map((row) => row.map((cell) => this.csv(cell)).join(','))
      .join('\n');
    return {
      filename: `nt-work-${query.dataset.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
      rowCount: Math.max(rows.length - 1, 0),
      content,
    };
  }

  async saveSnapshot(
    user: AuthenticatedUser,
    officeId: string,
    dto: import('./dto/save-work-report-snapshot.dto').SaveWorkReportSnapshotDto,
  ) {
    await this.assertReportAccess(user, officeId);
    const actor = await this.workScopeService.resolveActorContext(user);
    this.assertOffice(actor, officeId);
    const payload = await this.getPrintPayload(user, officeId, dto);
    const defaultName =
      `${payload.office.name} ${this.snapshotDatasetLabel(dto.dataset)} ${payload.period.from ?? ''}${payload.period.to && payload.period.to !== payload.period.from ? ` to ${payload.period.to}` : ''}`.trim();
    const name = dto.name?.trim() || defaultName;
    const query = {
      from: dto.from ?? null,
      to: dto.to ?? null,
      orgUnitId: dto.orgUnitId ?? null,
      operationalTeamId: dto.operationalTeamId ?? null,
      workTypeId: dto.workTypeId ?? null,
      status: dto.status ?? null,
      slaState: dto.slaState ?? null,
      workflowStage: dto.workflowStage ?? null,
      search: dto.search?.trim() || null,
      dataset: dto.dataset,
    };
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        dataset: string;
        periodFrom: string | null;
        periodTo: string | null;
        createdAt: Date;
      }>
    >(Prisma.sql`
      INSERT INTO "work_report_snapshots" (
        "office_id",
        "created_by_account_id",
        "name",
        "dataset",
        "period_from",
        "period_to",
        "query",
        "payload"
      ) VALUES (
        ${officeId}::uuid,
        ${user.accountId}::uuid,
        ${name},
        ${dto.dataset},
        ${dto.from ?? null},
        ${dto.to ?? null},
        ${JSON.stringify(query)}::jsonb,
        ${JSON.stringify(payload)}::jsonb
      )
      RETURNING
        "id",
        "name",
        "dataset",
        "period_from" AS "periodFrom",
        "period_to" AS "periodTo",
        "created_at" AS "createdAt"
    `);
    const snapshot = rows[0];
    if (!snapshot)
      throw new BadRequestException('The report snapshot could not be saved.');
    return {
      ...snapshot,
      createdAt: snapshot.createdAt.toISOString(),
      rowCount: payload.rowCount,
    };
  }

  async listSnapshots(user: AuthenticatedUser, officeId: string) {
    await this.assertReportAccess(user, officeId);
    const actor = await this.workScopeService.resolveActorContext(user);
    this.assertOffice(actor, officeId);
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        dataset: string;
        periodFrom: string | null;
        periodTo: string | null;
        createdAt: Date;
        rowCount: number | null;
      }>
    >(Prisma.sql`
      SELECT
        "id",
        "name",
        "dataset",
        "period_from" AS "periodFrom",
        "period_to" AS "periodTo",
        "created_at" AS "createdAt",
        CASE
          WHEN jsonb_typeof("payload"->'rowCount') = 'number'
            THEN ("payload"->>'rowCount')::int
          ELSE NULL
        END AS "rowCount"
      FROM "work_report_snapshots"
      WHERE "office_id" = ${officeId}::uuid
        AND "created_by_account_id" = ${user.accountId}::uuid
      ORDER BY "created_at" DESC
      LIMIT 100
    `);
    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getSnapshot(
    user: AuthenticatedUser,
    officeId: string,
    snapshotId: string,
  ) {
    await this.assertReportAccess(user, officeId);
    const actor = await this.workScopeService.resolveActorContext(user);
    this.assertOffice(actor, officeId);
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        dataset: string;
        periodFrom: string | null;
        periodTo: string | null;
        query: unknown;
        payload: unknown;
        createdAt: Date;
      }>
    >(Prisma.sql`
      SELECT
        "id",
        "name",
        "dataset",
        "period_from" AS "periodFrom",
        "period_to" AS "periodTo",
        "query",
        "payload",
        "created_at" AS "createdAt"
      FROM "work_report_snapshots"
      WHERE "id" = ${snapshotId}::uuid
        AND "office_id" = ${officeId}::uuid
        AND "created_by_account_id" = ${user.accountId}::uuid
      LIMIT 1
    `);
    const snapshot = rows[0];
    if (!snapshot) throw new NotFoundException('Saved report was not found.');
    return { ...snapshot, createdAt: snapshot.createdAt.toISOString() };
  }

  private snapshotDatasetLabel(dataset: WorkReportExportDataset): string {
    if (dataset === WorkReportExportDataset.OVERVIEW) return 'Overview Report';
    if (dataset === WorkReportExportDataset.TECHNICAL_PERFORMANCE)
      return 'Performance Report';
    if (dataset === WorkReportExportDataset.DUTY_ASSIGNMENTS)
      return 'Duty Report';
    return 'Work Records Report';
  }

  getDutyCompatibility() {
    return {
      generatedAt: new Date().toISOString(),
      mode: 'LEGACY_COMPATIBILITY' as const,
      migrationPhase: 11 as const,
      message:
        'Duty reporting remains available through the Duty assignment dataset.',
      dataRoute: '/work-reports/drilldown' as const,
      csvRoute: '/work-reports/export' as const,
      dataset: 'DUTY_ASSIGNMENTS' as const,
    };
  }

  private async getAllWorkRecords(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportQueryDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.assertOffice(actor, officeId);
    const where = await this.buildWhere(actor, officeId, query);
    const rows = await this.prisma.workItem.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: workRecordSelect,
    });
    return rows.map((row) => this.serializeRecord(row));
  }

  private async buildWhere(
    actor: WorkActorContext,
    officeId: string,
    query: WorkReportQueryDto,
  ): Promise<Prisma.WorkItemWhereInput> {
    const filters: Prisma.WorkItemWhereInput[] = [
      { officeId },
      this.workScopeService.buildOrganizationHierarchyWorkWhere(actor),
      {
        OR: [
          { workTypeVersionId: null },
          {
            workTypeVersion: {
              is: {
                workTypeDefinition: {
                  is: {
                    versions: {
                      some: { status: WorkTypeVersionStatus.PUBLISHED },
                    },
                  },
                },
              },
            },
          },
        ],
      },
    ];

    const range = this.dateRange(query.from, query.to);
    if (range) filters.push({ createdAt: range });

    if (query.orgUnitId) {
      const descendants = await this.prisma.orgUnitClosure.findMany({
        where: { ancestorOrgUnitId: query.orgUnitId },
        select: { descendantOrgUnitId: true },
      });
      const ids = descendants.map((row) => row.descendantOrgUnitId);
      filters.push({
        primaryOwnerOrgUnitId: { in: ids.length > 0 ? ids : [query.orgUnitId] },
      });
    }

    if (query.operationalTeamId) {
      filters.push({ assignedOperationalTeamId: query.operationalTeamId });
    }
    if (query.workTypeId) {
      filters.push({
        workTypeVersion: {
          is: { workTypeDefinitionId: query.workTypeId },
        },
      });
    }
    if (query.status) filters.push({ status: query.status });

    const search = query.search?.trim();
    if (search) {
      filters.push({
        OR: [
          { ticketNumber: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          { customerName: { contains: search, mode: 'insensitive' } },
          { locationText: { contains: search, mode: 'insensitive' } },
          { requestNumber: { contains: search, mode: 'insensitive' } },
          { serviceNumber: { contains: search, mode: 'insensitive' } },
          {
            references: {
              some: { value: { contains: search, mode: 'insensitive' } },
            },
          },
          {
            assignedOperationalTeam: {
              is: { name: { contains: search, mode: 'insensitive' } },
            },
          },
        ],
      });
    }

    if (query.slaState === WorkReportSlaState.OVERDUE) {
      filters.push({
        dueAt: { lt: new Date() },
        status: { in: [...CLASSIC_ACTIVE] },
      });
    }
    if (query.slaState === WorkReportSlaState.DUE_SOON) {
      const now = new Date();
      filters.push({
        dueAt: { gte: now, lte: new Date(now.getTime() + 60 * 60 * 1000) },
        status: { in: [...CLASSIC_ACTIVE] },
      });
    }

    if (query.workflowStage === WorkReportWorkflowStage.WAITING_FOR_SALES) {
      filters.push({
        salesCoordinationStatus: WorkSalesCoordinationStatus.READY_FOR_SALES,
        status: { in: [...CLASSIC_ACTIVE] },
      });
    }

    if (
      query.workflowStage === WorkReportWorkflowStage.WAITING_FOR_APPROVAL ||
      query.workflowStage === WorkReportWorkflowStage.RETURNED_FOR_CORRECTION
    ) {
      const candidates = await this.prisma.workItem.findMany({
        where: {
          AND: [
            ...filters,
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
      const returned =
        query.workflowStage === WorkReportWorkflowStage.RETURNED_FOR_CORRECTION;
      const ids = candidates
        .filter((item) => {
          const isReturned =
            item.completionReports[0]?.reviewStatus ===
            WorkCompletionReviewStatus.INFORMATION_REQUESTED;
          return returned ? isReturned : !isReturned;
        })
        .map((item) => item.id);
      filters.push({ id: { in: ids } });
    }

    return { AND: filters };
  }

  private serializeRecord(row: WorkRecord) {
    const reference = this.resolveReportReference(row);
    const primary = row.assignments.find(
      (assignment) => assignment.assignmentRole === WorkAssignmentRole.PRIMARY,
    );
    const supportingStaff = row.assignments
      .filter(
        (assignment) =>
          assignment.assignmentRole === WorkAssignmentRole.SUPPORTING,
      )
      .map((assignment) => this.accountName(assignment.assignee));
    const completedChildren = row.childWorkItems.filter(
      (child) => child.status === WorkItemStatus.CLOSED,
    ).length;
    const childTotal = row.childWorkItems.length;

    return {
      id: row.id,
      ticketNumber: row.ticketNumber,
      title: row.title,
      workType: {
        id: row.workTypeVersion?.workTypeDefinition.id ?? '',
        versionId: row.workTypeVersion?.id ?? '',
        code: row.workTypeVersion?.workTypeDefinition.code ?? 'UNKNOWN',
        name: row.workTypeVersion?.name ?? 'Work',
        template: row.workTypeVersion?.template ?? WorkTypeTemplate.STANDARD,
      },
      primaryOwner: row.primaryOwnerOrgUnit ?? {
        id: '',
        code: '',
        name: 'Unknown OrgUnit',
      },
      executionTeams: row.assignedOperationalTeam
        ? [row.assignedOperationalTeam]
        : [],
      reference,
      information: this.resolveReportInformation(row),
      date: this.kathmanduDate(row.createdAt),
      status: row.status,
      workflowStage: this.workflowStage(row),
      // Legacy convenience columns remain serialized for historical clients only.
      // Version-bound report/detail/CSV surfaces use `information` above.
      customerName: row.customerName,
      location: row.locationText,
      cpcSerial: row.cpcSerial,
      olt: row.olt,
      fdcName: row.fdcName,
      fapName: row.fapName,
      createdAt: row.createdAt.toISOString(),
      dueAt: row.dueAt.toISOString(),
      closedAt: row.closedAt?.toISOString() ?? null,
      overdueDays:
        row.status !== WorkItemStatus.CLOSED &&
        row.status !== WorkItemStatus.CANCELLED
          ? Math.max(0, Math.floor((Date.now() - row.dueAt.getTime()) / DAY_MS))
          : 0,
      primaryAssignee: this.accountName(primary?.assignee),
      startedBy: primary?.startedAt ? this.accountName(primary.assignee) : null,
      supportingStaff,
      responsibleReviewer: this.accountName(row.responsibleReviewer),
      salesMember: row.salesMember ? this.accountName(row.salesMember) : null,
      salesCoordinationStatus: row.salesCoordinationStatus,
      childProgress: {
        total: childTotal,
        completed: completedChildren,
        inProgress: childTotal - completedChildren,
        percentage:
          childTotal > 0
            ? Math.round((completedChildren / childTotal) * 1000) / 10
            : null,
      },
      availableActions: { view: true as const },
    };
  }

  private resolveReportInformation(row: WorkRecord): ReportInformationItem[] {
    const version = row.workTypeVersion;
    const fields = version?.fields ?? [];

    if (version && fields.length > 0) {
      const configuredReference = fields.find(
        (field) => this.fieldConfig(field.config).reportReference === true,
      );

      return fields.flatMap((field) => {
        if (isWorkSystemControlledFieldCode(field.code)) return [];
        const config = this.fieldConfig(field.config);
        const collectionMode =
          typeof config.collectionMode === 'string'
            ? config.collectionMode
            : field.stageDefinitionId === null
              ? 'CREATION_ONLY'
              : 'STAGE_ONLY';
        if (collectionMode === 'STAGE_ONLY') return [];
        if (configuredReference?.id === field.id) return [];

        const fieldValue = row.fieldValues.find(
          (value) => value.fieldDefinitionId === field.id,
        );
        const value = this.reportValue(fieldValue?.value);
        if (!value) return [];
        return [
          {
            code: field.code,
            label: field.label,
            value,
            display: `${field.label}: ${value}`,
          },
        ];
      });
    }

    // Historical Work predating WorkTypeVersion bindings keeps the classic
    // convenience-column fallback. Never use this fallback for version-bound Work.
    const legacy = [
      ['CUSTOMER_NAME', 'Customer', row.customerName],
      ['LOCATION', 'Location', row.locationText],
      ['CPC_SERIAL', 'CPC Serial', row.cpcSerial],
      ['OLT', 'OLT', row.olt],
      ['FDC_NAME', 'FDC', row.fdcName],
      ['FAP_NAME', 'FAP', row.fapName],
    ] as const;

    return legacy.flatMap(([code, label, rawValue]) => {
      const value = this.reportValue(rawValue);
      return value
        ? [{ code, label, value, display: `${label}: ${value}` }]
        : [];
    });
  }

  private resolveReportReference(row: WorkRecord): {
    label: string;
    value: string;
    display: string;
  } | null {
    const version = row.workTypeVersion;
    const fields = version?.fields ?? [];
    const configured = fields.find(
      (field) => this.fieldConfig(field.config).reportReference === true,
    );

    if (configured) {
      const fieldValue = row.fieldValues.find(
        (value) => value.fieldDefinitionId === configured.id,
      );
      const value = this.reportValue(fieldValue?.value);
      if (value) {
        return {
          label: configured.label,
          value,
          display: `${configured.label}: ${value}`,
        };
      }
    }

    const code = version?.workTypeDefinition?.code ?? '';
    const tokenField = fields.find((field) =>
      ['REQUEST_NUMBER', 'TOKEN_NUMBER'].includes(field.code),
    );
    const serviceField = fields.find(
      (field) => field.code === 'SERVICE_NUMBER',
    );
    const useToken = ['NEW_INSTALLATION', 'UPDATE_SERVICES'].includes(code);
    const fallbackValue = useToken
      ? row.requestNumber
      : (row.serviceNumber ?? row.requestNumber);
    const fallbackField = useToken ? tokenField : (serviceField ?? tokenField);
    if (fallbackValue) {
      const label =
        fallbackField?.label ?? (useToken ? 'Token Number' : 'Service Number');
      return {
        label,
        value: fallbackValue,
        display: `${label}: ${fallbackValue}`,
      };
    }

    const firstReference = row.references[0];
    if (firstReference?.value) {
      const sourceField = fields.find(
        (field) => field.id === firstReference.sourceFieldDefinitionId,
      );
      const label = sourceField?.label ?? 'Reference';
      return {
        label,
        value: firstReference.value,
        display: `${label}: ${firstReference.value}`,
      };
    }

    return null;
  }

  private fieldConfig(value: Prisma.JsonValue): Prisma.JsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
  }

  private reportValue(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value.trim() || null;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    if (Array.isArray(value)) {
      const joined = value
        .map((item) => this.reportValue(item))
        .filter((item): item is string => Boolean(item))
        .join(' · ');
      return joined || null;
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const preferred =
        record.value ?? record.label ?? record.other ?? record.text;
      if (preferred !== undefined) return this.reportValue(preferred);
      return JSON.stringify(value) ?? null;
    }
    if (typeof value === 'bigint') return value.toString();
    return null;
  }

  private workflowStage(row: {
    status: WorkItemStatus;
    salesCoordinationStatus: WorkSalesCoordinationStatus | null;
    completionReports: Array<{ reviewStatus: WorkCompletionReviewStatus }>;
  }):
    | 'NEW'
    | 'IN_PROGRESS'
    | 'WAITING_FOR_SALES'
    | 'WAITING_FOR_APPROVAL'
    | 'RETURNED_FOR_CORRECTION'
    | 'COMPLETED'
    | 'CANCELLED' {
    if (row.status === WorkItemStatus.CLOSED) return 'COMPLETED';
    if (row.status === WorkItemStatus.CANCELLED) return 'CANCELLED';
    if (row.status === WorkItemStatus.COMPLETED_PENDING_REVIEW) {
      return row.completionReports[0]?.reviewStatus ===
        WorkCompletionReviewStatus.INFORMATION_REQUESTED
        ? 'RETURNED_FOR_CORRECTION'
        : 'WAITING_FOR_APPROVAL';
    }
    if (
      row.salesCoordinationStatus ===
      WorkSalesCoordinationStatus.READY_FOR_SALES
    ) {
      return 'WAITING_FOR_SALES';
    }
    if (
      row.status === WorkItemStatus.ASSIGNED ||
      row.status === WorkItemStatus.ACKNOWLEDGED ||
      row.status === WorkItemStatus.REOPENED
    ) {
      return 'NEW';
    }
    return 'IN_PROGRESS';
  }

  private accountName(account: ReportAccount | null | undefined): string {
    if (!account) return '—';
    return (
      account.employee?.empName ??
      account.employee?.empId ??
      account.username ??
      'NT Message User'
    );
  }

  private resolvePeriod(from?: string, to?: string) {
    const today = this.kathmanduDate(new Date());
    const resolvedFrom = from ?? to ?? today;
    const resolvedTo = to ?? from ?? today;
    const start = new Date(`${resolvedFrom}T00:00:00+05:45`);
    const endStart = new Date(`${resolvedTo}T00:00:00+05:45`);
    const endExclusive = new Date(endStart.getTime() + DAY_MS);
    if (endExclusive <= start) {
      throw new BadRequestException(
        'Report end date must be on or after the start date.',
      );
    }
    return {
      from: resolvedFrom,
      to: resolvedTo,
      start,
      endExclusive,
      days: Math.max(
        1,
        Math.round((endExclusive.getTime() - start.getTime()) / DAY_MS),
      ),
    };
  }

  private assertOffice(actor: WorkActorContext, officeId: string): void {
    if (actor.accountClass === AccountClass.SUPER_ADMIN) return;
    if (actor.officeId !== officeId)
      throw new ForbiddenException(
        'The requested report Office is outside your scope.',
      );
  }

  private dateRange(from?: string, to?: string): Prisma.DateTimeFilter | null {
    if (!from && !to) return null;
    const start = from ? new Date(`${from}T00:00:00+05:45`) : undefined;
    const end = to
      ? new Date(new Date(`${to}T00:00:00+05:45`).getTime() + DAY_MS)
      : undefined;
    if (start && end && end <= start)
      throw new BadRequestException(
        'Report end date must be on or after the start date.',
      );
    return { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) };
  }

  private kathmanduDate(date: Date): string {
    return new Date(date.getTime() + KATHMANDU_OFFSET_MS)
      .toISOString()
      .slice(0, 10);
  }

  private csv(value: string): string {
    return `"${value.replace(/"/g, '""')}"`;
  }
}
