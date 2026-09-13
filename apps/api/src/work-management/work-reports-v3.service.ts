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
  EmployeeStatus,
  EmploymentStatus,
  OrgMembershipType,
  WorkItemStatus,
  WorkRuntimeStatus,
  WorkStageAssignmentRole,
  WorkStageAssignmentTargetType,
  WorkStageStatus,
  WorkTypeVersionStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import {
  WorkReportV3QueryDto,
  WorkReportV3RecordsQueryDto,
  WorkReportV3StageAnalysisQueryDto,
  WorkReportV3SlaState,
} from './dto/work-report-v3-query.dto';
import {
  WorkReportV3ExportDataset,
  WorkReportV3ExportQueryDto,
} from './dto/work-report-v3-export-query.dto';

const MAX_REPORT_DAYS = 366;
const KATHMANDU_OFFSET_MS = 5.75 * 60 * 60 * 1000;
const DUE_SOON_MS = 24 * 60 * 60 * 1000;
const TECHNICAL_WORK_TYPE_CODES = [
  'ROUTINE_WORK',
  'TROUBLE_TICKET',
  'NETWORK_MAINTENANCE',
  'NEW_INSTALLATION',
  'UPDATE_SERVICES',
  'INSPECTION',
  'EMERGENCY_WORK',
] as const;

type TechnicalWorkTypeCode = (typeof TECHNICAL_WORK_TYPE_CODES)[number];

const TERMINAL_STAGE_STATUSES = new Set<WorkStageStatus>([
  WorkStageStatus.COMPLETED,
  WorkStageStatus.SKIPPED,
  WorkStageStatus.CANCELLED,
]);

const WAITING_STAGE_STATUSES = new Set<WorkStageStatus>([
  WorkStageStatus.PENDING,
  WorkStageStatus.READY,
  WorkStageStatus.SUBMITTED,
  WorkStageStatus.RETURNED,
]);

export type WorkReportV3ScopeType =
  | 'PERSONAL'
  | 'TEAM'
  | 'ORG_UNIT'
  | 'ORG_UNIT_SUBTREE'
  | 'OFFICE';

export interface WorkReportV3Scope {
  type: WorkReportV3ScopeType;
  officeId: string;
  accountId: string;
  orgUnitIds: string[];
  operationalTeamIds: string[];
  personalOperationalTeamIds: string[];
  availableActions: {
    view: boolean;
    export: boolean;
  };
}

export interface WorkReportV3Context {
  office: {
    id: string;
    code: string;
    name: string;
    isActive: boolean;
  };
  scope: Omit<WorkReportV3Scope, 'personalOperationalTeamIds'>;
  filters: {
    orgUnits: Array<{
      id: string;
      code: string;
      name: string;
      isActive: boolean;
    }>;
    operationalTeams: Array<{
      id: string;
      code: string;
      name: string;
      orgUnitId: string;
      isActive: boolean;
      archivedAt: string | null;
    }>;
    workTypes: Array<{
      id: string;
      code: string;
      name: string;
      isActive: boolean;
    }>;
    canFilterByOrgUnit: boolean;
    canFilterByOperationalTeam: boolean;
  };
}

export interface WorkReportV3CountResult {
  generatedAt: string;
  distinctWork: number;
}

export interface WorkReportV3Overview {
  generatedAt: string;
  totalWork: number;
  statuses: Record<WorkRuntimeStatus, number>;
  sla: {
    overdue: number;
    dueSoon: number;
  };
  organizationPerformance: Array<{
    orgUnit: { id: string; code: string; name: string };
    primaryOwnerWork: number;
    participantWork: number;
    responsibleStages: number;
    completedWork: number;
    overdueWork: number;
  }>;
  teamExecution: Array<{
    operationalTeam: {
      id: string;
      code: string;
      name: string;
      orgUnitId: string;
    };
    workCount: number;
  }>;
}

export interface WorkReportV3WorkRecord {
  id: string;
  ticketNumber: string;
  workType: { id: string; code: string; name: string };
  primaryOwner: { id: string; code: string; name: string };
  executionTeams: Array<{ id: string; code: string; name: string }>;
  reference: {
    display: string | null;
    items: Array<{ type: string; value: string }>;
  };
  date: string;
  status: WorkRuntimeStatus;
  availableActions: { view: true };
}

export interface WorkReportV3WorkRecords {
  generatedAt: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  items: WorkReportV3WorkRecord[];
}

export interface WorkReportV3TechnicalPerformanceCounts {
  tickets: number;
  completed: number;
  pending: number;
}

export interface WorkReportV3TechnicalPerformanceRow {
  date: string;
  orgUnit: { id: string; code: string; name: string };
  operationalTeam: { id: string; code: string; name: string } | null;
  supportStaff: Array<{
    accountId: string;
    name: string;
    employeeId: string | null;
  }>;
  otherStaff: Array<{
    accountId: string;
    name: string;
    employeeId: string | null;
  }>;
  references: string[];
  workTypes: Record<
    TechnicalWorkTypeCode,
    WorkReportV3TechnicalPerformanceCounts
  >;
  total: WorkReportV3TechnicalPerformanceCounts;
}

export interface WorkReportV3TechnicalPerformance {
  generatedAt: string;
  rows: WorkReportV3TechnicalPerformanceRow[];
  totals: {
    workTypes: Record<
      TechnicalWorkTypeCode,
      WorkReportV3TechnicalPerformanceCounts
    >;
    total: WorkReportV3TechnicalPerformanceCounts;
  };
}

export interface WorkReportV3StageAnalysisRow {
  id: string;
  workItem: {
    id: string;
    ticketNumber: string;
    status: WorkRuntimeStatus;
    dueAt: string;
    workSlaState: WorkReportV3SlaState;
  };
  stage: {
    code: string;
    name: string;
    status: WorkStageStatus;
    responsibleOrgUnit: { id: string; code: string; name: string };
    operationalTeams: Array<{ id: string; code: string; name: string }>;
    dueAt: string | null;
    slaMinutes: number | null;
    slaState: WorkReportV3SlaState;
    blockerReason: string | null;
    readyAt: string | null;
    startedAt: string | null;
    submittedAt: string | null;
    completedAt: string | null;
  };
  durations: {
    elapsedMinutes: number;
    activeMinutes: number;
    waitingMinutes: number;
    blockedMinutes: number;
  };
}

export interface WorkReportV3StageAnalysis {
  generatedAt: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  summary: Array<{
    orgUnit: { id: string; code: string; name: string };
    stageCount: number;
    completedStages: number;
    waitingStages: number;
    blockedStages: number;
    overdueStages: number;
  }>;
  items: WorkReportV3StageAnalysisRow[];
}

export interface WorkReportV3CsvExport {
  filename: string;
  rowCount: number;
  content: string;
}

export interface WorkReportV3PrintPayload {
  dataset: WorkReportV3ExportDataset;
  generatedAt: string;
  office: { id: string; code: string; name: string };
  period: { from: string | null; to: string | null };
  rowCount: number;
  content:
    | WorkReportV3Overview
    | WorkReportV3WorkRecord[]
    | WorkReportV3TechnicalPerformance
    | WorkReportV3StageAnalysisRow[];
}

export interface WorkReportV3DutyCompatibility {
  generatedAt: string;
  mode: 'LEGACY_COMPATIBILITY';
  migrationPhase: 11;
  message: string;
  dataRoute: '/work-reports/drilldown';
  csvRoute: '/work-reports/export';
  dataset: 'DUTY_ASSIGNMENTS';
}

export interface WorkReportV3Reconciliation {
  officeId: string;
  generatedAt: string;
  scopeType: 'OFFICE';
  counts: {
    nativeV3Work: number;
    reportableV3Work: number;
    missingPrimaryOwner: number;
    missingWorkTypeVersion: number;
    missingRuntimeStatus: number;
    participantRows: number;
    runtimeStages: number;
    operationalTeamAssignments: number;
    activeTeamAssignmentsMissingOperationalTeamTarget: number;
    legacyTeamCompatibilityPointers: number;
    workWithLegacyTeamPrimaryOwner: number;
    participantsOnLegacyTeamOrgUnits: number;
    stagesWithLegacyTeamResponsibleOrgUnit: number;
    formalOrgUnits: number;
    operationalTeams: number;
    workTypes: number;
  };
  invariants: {
    distinctWorkCounting: true;
    activeTeamAssignmentsMissingOperationalTeamTargetExpected: 0;
    workWithLegacyTeamPrimaryOwnerExpected: 0;
    participantsOnLegacyTeamOrgUnitsExpected: 0;
    stagesWithLegacyTeamResponsibleOrgUnitExpected: 0;
  };
}

interface ReportRange {
  start: Date;
  endExclusive: Date;
}

@Injectable()
export class WorkReportsV3Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
  ) {}

  async getContext(
    user: AuthenticatedUser,
    officeId: string,
  ): Promise<WorkReportV3Context> {
    const office = await this.requireOffice(officeId);
    const scope = await this.resolveScope(user, officeId);

    const orgUnitWhere: Prisma.OrgUnitWhereInput = {
      officeId,
      orgUnitType: { isTeam: false },
      ...(scope.type === 'OFFICE'
        ? {}
        : scope.orgUnitIds.length > 0
          ? { id: { in: scope.orgUnitIds } }
          : { id: { in: [] } }),
    };

    const teamWhere: Prisma.OperationalTeamWhereInput = {
      orgUnit: { officeId },
      ...(scope.type === 'OFFICE'
        ? {}
        : scope.type === 'TEAM'
          ? { id: { in: scope.operationalTeamIds } }
          : scope.type === 'PERSONAL'
            ? { id: { in: [] } }
            : { orgUnitId: { in: scope.orgUnitIds } }),
    };

    const [orgUnits, operationalTeams, workTypes] = await Promise.all([
      this.prisma.orgUnit.findMany({
        where: orgUnitWhere,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, code: true, name: true, isActive: true },
      }),
      this.prisma.operationalTeam.findMany({
        where: teamWhere,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          orgUnitId: true,
          isActive: true,
          archivedAt: true,
        },
      }),
      this.prisma.workTypeDefinition.findMany({
        where: { officeId },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        select: {
          id: true,
          code: true,
          isActive: true,
          versions: {
            where: {
              status: {
                in: [
                  WorkTypeVersionStatus.PUBLISHED,
                  WorkTypeVersionStatus.RETIRED,
                ],
              },
            },
            orderBy: { version: 'desc' },
            take: 1,
            select: { name: true },
          },
        },
      }),
    ]);

    return {
      office,
      scope: {
        type: scope.type,
        officeId: scope.officeId,
        accountId: scope.accountId,
        orgUnitIds: scope.orgUnitIds,
        operationalTeamIds: scope.operationalTeamIds,
        availableActions: scope.availableActions,
      },
      filters: {
        orgUnits,
        operationalTeams: operationalTeams.map((team) => ({
          ...team,
          archivedAt: team.archivedAt?.toISOString() ?? null,
        })),
        workTypes: workTypes.map((item) => ({
          id: item.id,
          code: item.code,
          name: item.versions[0]?.name ?? item.code,
          isActive: item.isActive,
        })),
        canFilterByOrgUnit:
          scope.type === 'OFFICE' ||
          scope.type === 'ORG_UNIT' ||
          scope.type === 'ORG_UNIT_SUBTREE',
        canFilterByOperationalTeam: scope.type !== 'PERSONAL',
      },
    };
  }

  async getDistinctWorkCount(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportV3QueryDto,
  ): Promise<WorkReportV3CountResult> {
    await this.requireOffice(officeId);
    const where = await this.buildScopedWorkWhere(user, officeId, query);
    return {
      generatedAt: new Date().toISOString(),
      distinctWork: await this.prisma.workItem.count({ where }),
    };
  }

  async getOverview(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportV3QueryDto,
  ): Promise<WorkReportV3Overview> {
    await this.requireOffice(officeId);
    const scope = await this.resolveScope(user, officeId);
    const where = await this.buildScopedWorkWhere(user, officeId, query);
    const now = new Date();
    const overdueWhere: Prisma.WorkItemWhereInput = {
      AND: [where, this.slaWhere(WorkReportV3SlaState.OVERDUE, now)],
    };
    const dueSoonWhere: Prisma.WorkItemWhereInput = {
      AND: [where, this.slaWhere(WorkReportV3SlaState.DUE_SOON, now)],
    };

    const [
      totalWork,
      statusGroups,
      overdue,
      dueSoon,
      primaryOwnerGroups,
      completedPrimaryOwnerGroups,
      overduePrimaryOwnerGroups,
      participantPairs,
      responsibleStageGroups,
      teamAssignments,
    ] = await Promise.all([
      this.prisma.workItem.count({ where }),
      this.prisma.workItem.groupBy({
        by: ['runtimeStatus'],
        where,
        _count: { _all: true },
      }),
      this.prisma.workItem.count({ where: overdueWhere }),
      this.prisma.workItem.count({ where: dueSoonWhere }),
      scope.type === 'PERSONAL'
        ? Promise.resolve([])
        : this.prisma.workItem.groupBy({
            by: ['primaryOwnerOrgUnitId'],
            where,
            _count: { _all: true },
          }),
      scope.type === 'PERSONAL'
        ? Promise.resolve([])
        : this.prisma.workItem.groupBy({
            by: ['primaryOwnerOrgUnitId'],
            where: {
              AND: [where, { runtimeStatus: WorkRuntimeStatus.COMPLETED }],
            },
            _count: { _all: true },
          }),
      scope.type === 'PERSONAL'
        ? Promise.resolve([])
        : this.prisma.workItem.groupBy({
            by: ['primaryOwnerOrgUnitId'],
            where: overdueWhere,
            _count: { _all: true },
          }),
      scope.type === 'PERSONAL'
        ? Promise.resolve([])
        : this.prisma.workOrgUnitParticipant.findMany({
            where: { workItem: { is: where } },
            select: { orgUnitId: true, workItemId: true },
            distinct: ['orgUnitId', 'workItemId'],
          }),
      scope.type === 'PERSONAL'
        ? Promise.resolve([])
        : this.prisma.workStage.groupBy({
            by: ['responsibleOrgUnitId'],
            where: { workItem: { is: where } },
            _count: { _all: true },
          }),
      scope.type === 'PERSONAL'
        ? Promise.resolve([])
        : this.prisma.workStageAssignment.findMany({
            where: {
              targetType: WorkStageAssignmentTargetType.TEAM,
              targetOperationalTeamId: { not: null },
              workStage: { is: { workItem: { is: where } } },
            },
            select: {
              targetOperationalTeamId: true,
              workStage: { select: { workItemId: true } },
            },
          }),
    ]);

    const statuses = Object.values(WorkRuntimeStatus).reduce(
      (acc, status) => {
        acc[status] = 0;
        return acc;
      },
      {} as Record<WorkRuntimeStatus, number>,
    );
    for (const group of statusGroups) {
      if (group.runtimeStatus)
        statuses[group.runtimeStatus] = group._count._all;
    }

    const primaryOwnerCounts = new Map<string, number>();
    const completedCounts = new Map<string, number>();
    const overdueCounts = new Map<string, number>();
    for (const group of primaryOwnerGroups) {
      if (group.primaryOwnerOrgUnitId) {
        primaryOwnerCounts.set(group.primaryOwnerOrgUnitId, group._count._all);
      }
    }
    for (const group of completedPrimaryOwnerGroups) {
      if (group.primaryOwnerOrgUnitId) {
        completedCounts.set(group.primaryOwnerOrgUnitId, group._count._all);
      }
    }
    for (const group of overduePrimaryOwnerGroups) {
      if (group.primaryOwnerOrgUnitId) {
        overdueCounts.set(group.primaryOwnerOrgUnitId, group._count._all);
      }
    }

    const participantWorkSets = new Map<string, Set<string>>();
    for (const row of participantPairs) {
      const set = participantWorkSets.get(row.orgUnitId) ?? new Set<string>();
      set.add(row.workItemId);
      participantWorkSets.set(row.orgUnitId, set);
    }

    const stageCounts = new Map<string, number>();
    for (const group of responsibleStageGroups) {
      stageCounts.set(group.responsibleOrgUnitId, group._count._all);
    }

    const orgUnitIds = new Set<string>([
      ...primaryOwnerCounts.keys(),
      ...participantWorkSets.keys(),
      ...stageCounts.keys(),
      ...completedCounts.keys(),
      ...overdueCounts.keys(),
    ]);
    const orgUnits =
      orgUnitIds.size === 0
        ? []
        : await this.prisma.orgUnit.findMany({
            where: {
              id: { in: [...orgUnitIds] },
              officeId,
              orgUnitType: { isTeam: false },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: { id: true, code: true, name: true },
          });

    const teamWorkSets = new Map<string, Set<string>>();
    for (const row of teamAssignments) {
      if (!row.targetOperationalTeamId) continue;
      const set =
        teamWorkSets.get(row.targetOperationalTeamId) ?? new Set<string>();
      set.add(row.workStage.workItemId);
      teamWorkSets.set(row.targetOperationalTeamId, set);
    }
    const teams =
      teamWorkSets.size === 0
        ? []
        : await this.prisma.operationalTeam.findMany({
            where: {
              id: { in: [...teamWorkSets.keys()] },
              orgUnit: { officeId },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: { id: true, code: true, name: true, orgUnitId: true },
          });

    return {
      generatedAt: now.toISOString(),
      totalWork,
      statuses,
      sla: { overdue, dueSoon },
      organizationPerformance: orgUnits.map((orgUnit) => ({
        orgUnit,
        primaryOwnerWork: primaryOwnerCounts.get(orgUnit.id) ?? 0,
        participantWork: participantWorkSets.get(orgUnit.id)?.size ?? 0,
        responsibleStages: stageCounts.get(orgUnit.id) ?? 0,
        completedWork: completedCounts.get(orgUnit.id) ?? 0,
        overdueWork: overdueCounts.get(orgUnit.id) ?? 0,
      })),
      teamExecution: teams.map((operationalTeam) => ({
        operationalTeam,
        workCount: teamWorkSets.get(operationalTeam.id)?.size ?? 0,
      })),
    };
  }

  async getWorkRecords(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportV3RecordsQueryDto,
  ): Promise<WorkReportV3WorkRecords> {
    await this.requireOffice(officeId);
    const where = await this.buildScopedWorkWhere(user, officeId, query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const skip = (page - 1) * limit;

    const [total, records] = await Promise.all([
      this.prisma.workItem.count({ where }),
      this.prisma.workItem.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { ticketNumber: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true,
          ticketNumber: true,
          createdAt: true,
          runtimeStatus: true,
          workTypeVersion: {
            select: {
              name: true,
              workTypeDefinition: { select: { id: true, code: true } },
            },
          },
          primaryOwnerOrgUnit: {
            select: { id: true, code: true, name: true },
          },
          references: {
            orderBy: [{ createdAt: 'asc' }, { referenceType: 'asc' }],
            select: { referenceType: true, value: true },
          },
          runtimeStages: {
            select: {
              assignments: {
                where: {
                  targetType: WorkStageAssignmentTargetType.TEAM,
                  targetOperationalTeamId: { not: null },
                },
                select: {
                  targetOperationalTeam: {
                    select: { id: true, code: true, name: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const items: WorkReportV3WorkRecord[] = records.map((record) => {
      if (
        !record.runtimeStatus ||
        !record.workTypeVersion ||
        !record.primaryOwnerOrgUnit
      ) {
        throw new BadRequestException(
          `Work ${record.ticketNumber} is missing required V3 report data.`,
        );
      }

      const teamMap = new Map<
        string,
        { id: string; code: string; name: string }
      >();
      for (const stage of record.runtimeStages) {
        for (const assignment of stage.assignments) {
          const team = assignment.targetOperationalTeam;
          if (team) teamMap.set(team.id, team);
        }
      }

      const definition = record.workTypeVersion.workTypeDefinition;
      return {
        id: record.id,
        ticketNumber: record.ticketNumber,
        workType: {
          id: definition.id,
          code: definition.code,
          name: record.workTypeVersion.name,
        },
        primaryOwner: record.primaryOwnerOrgUnit,
        executionTeams: [...teamMap.values()].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        reference: this.presentWorkReference(
          definition.code,
          record.references,
        ),
        date: this.formatKathmanduDate(record.createdAt),
        status: record.runtimeStatus,
        availableActions: { view: true },
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      items,
    };
  }

  async getTechnicalPerformance(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportV3QueryDto,
  ): Promise<WorkReportV3TechnicalPerformance> {
    await this.requireOffice(officeId);
    const where = await this.buildScopedWorkWhere(user, officeId, query);
    const range = this.resolveRange(query);
    const reportEnd = range?.endExclusive ?? new Date();
    const workItems = await this.prisma.workItem.findMany({
      where: {
        AND: [
          where,
          {
            workTypeVersion: {
              is: {
                workTypeDefinition: {
                  code: { in: [...TECHNICAL_WORK_TYPE_CODES] },
                },
              },
            },
          },
        ],
      },
      orderBy: [{ createdAt: 'asc' }, { ticketNumber: 'asc' }],
      select: {
        id: true,
        ticketNumber: true,
        createdAt: true,
        completedAt: true,
        cancelledAt: true,
        runtimeStatus: true,
        workTypeVersion: {
          select: {
            name: true,
            workTypeDefinition: { select: { id: true, code: true } },
          },
        },
        primaryOwnerOrgUnit: {
          select: { id: true, code: true, name: true },
        },
        references: {
          orderBy: [{ createdAt: 'asc' }, { referenceType: 'asc' }],
          select: { referenceType: true, value: true },
        },
        runtimeStages: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            responsibleOrgUnitId: true,
            assignments: {
              orderBy: { startsAt: 'asc' },
              select: {
                assignmentRole: true,
                targetAccountId: true,
                targetAccount: {
                  select: {
                    id: true,
                    username: true,
                    employee: { select: { empId: true, empName: true } },
                  },
                },
                targetOperationalTeam: {
                  select: { id: true, code: true, name: true },
                },
              },
            },
            submissions: {
              orderBy: { createdAt: 'asc' },
              select: {
                submittedByAccountId: true,
                submittedBy: {
                  select: {
                    id: true,
                    username: true,
                    employee: { select: { empId: true, empName: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const rows = new Map<
      string,
      {
        row: WorkReportV3TechnicalPerformanceRow;
        support: Map<
          string,
          { accountId: string; name: string; employeeId: string | null }
        >;
        other: Map<
          string,
          { accountId: string; name: string; employeeId: string | null }
        >;
        references: Set<string>;
      }
    >();

    for (const item of workItems) {
      if (
        !item.runtimeStatus ||
        !item.workTypeVersion ||
        !item.primaryOwnerOrgUnit
      ) {
        throw new BadRequestException(
          `Work ${item.ticketNumber} is missing required V3 performance data.`,
        );
      }

      const workTypeCode = item.workTypeVersion.workTypeDefinition.code
        .trim()
        .toUpperCase();
      if (!this.isTechnicalWorkTypeCode(workTypeCode)) continue;
      if (item.cancelledAt && item.cancelledAt < reportEnd) continue;

      const primaryOwner = item.primaryOwnerOrgUnit;
      const executionTeam = this.primaryExecutionTeam(
        item.runtimeStages,
        primaryOwner.id,
      );
      const date = this.formatKathmanduDate(item.createdAt);
      const rowKey = `${date}:${primaryOwner.id}:${executionTeam?.id ?? 'ORG_UNIT'}`;
      let state = rows.get(rowKey);
      if (!state) {
        state = {
          row: {
            date,
            orgUnit: primaryOwner,
            operationalTeam: executionTeam,
            supportStaff: [],
            otherStaff: [],
            references: [],
            workTypes: this.zeroTechnicalWorkTypes(),
            total: this.zeroPerformanceCounts(),
          },
          support: new Map(),
          other: new Map(),
          references: new Set(),
        };
        rows.set(rowKey, state);
      }

      const completed = Boolean(
        item.completedAt && item.completedAt < reportEnd,
      );
      const typeCounts = state.row.workTypes[workTypeCode];
      typeCounts.tickets += 1;
      state.row.total.tickets += 1;
      if (completed) {
        typeCounts.completed += 1;
        state.row.total.completed += 1;
      } else {
        typeCounts.pending += 1;
        state.row.total.pending += 1;
      }

      for (const stage of item.runtimeStages) {
        for (const assignment of stage.assignments) {
          if (
            assignment.assignmentRole === WorkStageAssignmentRole.SUPPORTING &&
            assignment.targetAccount
          ) {
            const person = this.reportPerson(assignment.targetAccount);
            state.support.set(person.accountId, person);
          }
          if (
            stage.responsibleOrgUnitId !== primaryOwner.id &&
            assignment.targetAccount
          ) {
            const person = this.reportPerson(assignment.targetAccount);
            state.other.set(person.accountId, person);
          }
        }

        if (stage.responsibleOrgUnitId !== primaryOwner.id) {
          for (const submission of stage.submissions) {
            const person = this.reportPerson(submission.submittedBy);
            state.other.set(person.accountId, person);
          }
        }
      }

      for (const accountId of state.support.keys()) {
        state.other.delete(accountId);
      }

      const reference = this.presentWorkReference(
        workTypeCode,
        item.references,
      ).display;
      if (reference) state.references.add(reference);
    }

    const reportRows = [...rows.values()]
      .map((state) => ({
        ...state.row,
        supportStaff: [...state.support.values()].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
        otherStaff: [...state.other.values()].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
        references: [...state.references].sort((left, right) =>
          left.localeCompare(right),
        ),
      }))
      .sort((left, right) => {
        const date = left.date.localeCompare(right.date);
        if (date !== 0) return date;
        const unit = left.orgUnit.name.localeCompare(right.orgUnit.name);
        if (unit !== 0) return unit;
        return (left.operationalTeam?.name ?? '').localeCompare(
          right.operationalTeam?.name ?? '',
        );
      });

    const totals = {
      workTypes: this.zeroTechnicalWorkTypes(),
      total: this.zeroPerformanceCounts(),
    };
    for (const row of reportRows) {
      for (const code of TECHNICAL_WORK_TYPE_CODES) {
        totals.workTypes[code].tickets += row.workTypes[code].tickets;
        totals.workTypes[code].completed += row.workTypes[code].completed;
        totals.workTypes[code].pending += row.workTypes[code].pending;
      }
      totals.total.tickets += row.total.tickets;
      totals.total.completed += row.total.completed;
      totals.total.pending += row.total.pending;
    }

    return {
      generatedAt: new Date().toISOString(),
      rows: reportRows,
      totals,
    };
  }

  async getStageAnalysis(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportV3StageAnalysisQueryDto,
  ): Promise<WorkReportV3StageAnalysis> {
    await this.requireOffice(officeId);
    const workWhere = await this.buildScopedWorkWhere(user, officeId, query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const skip = (page - 1) * limit;
    const now = new Date();

    const stageWhere: Prisma.WorkStageWhereInput = {
      AND: [
        { workItem: { is: workWhere } },
        ...(query.responsibleOrgUnitId
          ? [{ responsibleOrgUnitId: query.responsibleOrgUnitId }]
          : []),
        ...(query.stageStatus ? [{ status: query.stageStatus }] : []),
        ...(query.operationalTeamId
          ? [
              {
                assignments: {
                  some: {
                    targetType: WorkStageAssignmentTargetType.TEAM,
                    targetOperationalTeamId: query.operationalTeamId,
                  },
                },
              },
            ]
          : []),
      ],
    };

    const [total, statusGroups, overdueGroups, stages] = await Promise.all([
      this.prisma.workStage.count({ where: stageWhere }),
      this.prisma.workStage.groupBy({
        by: ['responsibleOrgUnitId', 'status'],
        where: stageWhere,
        _count: { _all: true },
      }),
      this.prisma.workStage.groupBy({
        by: ['responsibleOrgUnitId'],
        where: {
          AND: [stageWhere, this.currentStageOverdueWhere(now)],
        },
        _count: { _all: true },
      }),
      this.prisma.workStage.findMany({
        where: stageWhere,
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          slaMinutes: true,
          dueAt: true,
          blockerReason: true,
          readyAt: true,
          startedAt: true,
          submittedAt: true,
          completedAt: true,
          cancelledAt: true,
          createdAt: true,
          responsibleOrgUnit: {
            select: { id: true, code: true, name: true },
          },
          workItem: {
            select: {
              id: true,
              ticketNumber: true,
              runtimeStatus: true,
              dueAt: true,
              completedAt: true,
              cancelledAt: true,
            },
          },
          assignments: {
            where: {
              targetType: WorkStageAssignmentTargetType.TEAM,
              targetOperationalTeamId: { not: null },
            },
            select: {
              targetOperationalTeam: {
                select: { id: true, code: true, name: true },
              },
            },
          },
          events: {
            where: { toStageStatus: { not: null } },
            orderBy: { createdAt: 'asc' },
            select: {
              fromStageStatus: true,
              toStageStatus: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    const orgUnitIds = new Set<string>(
      statusGroups.map((group) => group.responsibleOrgUnitId),
    );
    for (const group of overdueGroups)
      orgUnitIds.add(group.responsibleOrgUnitId);
    const orgUnits =
      orgUnitIds.size === 0
        ? []
        : await this.prisma.orgUnit.findMany({
            where: {
              id: { in: [...orgUnitIds] },
              officeId,
              orgUnitType: { isTeam: false },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
            select: { id: true, code: true, name: true },
          });

    const statusCounts = new Map<string, Map<WorkStageStatus, number>>();
    for (const group of statusGroups) {
      const counts =
        statusCounts.get(group.responsibleOrgUnitId) ??
        new Map<WorkStageStatus, number>();
      counts.set(group.status, group._count._all);
      statusCounts.set(group.responsibleOrgUnitId, counts);
    }
    const overdueCounts = new Map(
      overdueGroups.map((group) => [
        group.responsibleOrgUnitId,
        group._count._all,
      ]),
    );

    const items: WorkReportV3StageAnalysisRow[] = stages.map((stage) => {
      if (!stage.workItem.runtimeStatus) {
        throw new BadRequestException(
          `Work ${stage.workItem.ticketNumber} is missing runtime report status.`,
        );
      }
      const teamMap = new Map<
        string,
        { id: string; code: string; name: string }
      >();
      for (const assignment of stage.assignments) {
        const team = assignment.targetOperationalTeam;
        if (team) teamMap.set(team.id, team);
      }

      return {
        id: stage.id,
        workItem: {
          id: stage.workItem.id,
          ticketNumber: stage.workItem.ticketNumber,
          status: stage.workItem.runtimeStatus,
          dueAt: stage.workItem.dueAt.toISOString(),
          workSlaState: this.deadlineState(
            stage.workItem.dueAt,
            stage.workItem.runtimeStatus,
            stage.workItem.completedAt,
            stage.workItem.cancelledAt,
            now,
          ),
        },
        stage: {
          code: stage.code,
          name: stage.name,
          status: stage.status,
          responsibleOrgUnit: stage.responsibleOrgUnit,
          operationalTeams: [...teamMap.values()],
          dueAt: stage.dueAt?.toISOString() ?? null,
          slaMinutes: stage.slaMinutes,
          slaState: this.stageDeadlineState(stage, now),
          blockerReason: stage.blockerReason,
          readyAt: stage.readyAt?.toISOString() ?? null,
          startedAt: stage.startedAt?.toISOString() ?? null,
          submittedAt: stage.submittedAt?.toISOString() ?? null,
          completedAt: stage.completedAt?.toISOString() ?? null,
        },
        durations: this.calculateStageDurations(stage, now),
      };
    });

    return {
      generatedAt: now.toISOString(),
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
      summary: orgUnits.map((orgUnit) => {
        const counts =
          statusCounts.get(orgUnit.id) ?? new Map<WorkStageStatus, number>();
        const waitingStages = [...WAITING_STAGE_STATUSES].reduce(
          (sum, status) => sum + (counts.get(status) ?? 0),
          0,
        );
        return {
          orgUnit,
          stageCount: [...counts.values()].reduce(
            (sum, count) => sum + count,
            0,
          ),
          completedStages: counts.get(WorkStageStatus.COMPLETED) ?? 0,
          waitingStages,
          blockedStages: counts.get(WorkStageStatus.BLOCKED) ?? 0,
          overdueStages: overdueCounts.get(orgUnit.id) ?? 0,
        };
      }),
      items,
    };
  }

  async getDutyCompatibility(
    user: AuthenticatedUser,
    officeId: string,
  ): Promise<WorkReportV3DutyCompatibility> {
    await this.requireOffice(officeId);
    await this.resolveScope(user, officeId);

    return {
      generatedAt: new Date().toISOString(),
      mode: 'LEGACY_COMPATIBILITY',
      migrationPhase: 11,
      message:
        'Duty reporting remains on the existing Duty dataset until the Phase 11 OrgUnit migration. Phase 10 does not rewrite Duty ownership or history.',
      dataRoute: '/work-reports/drilldown',
      csvRoute: '/work-reports/export',
      dataset: 'DUTY_ASSIGNMENTS',
    };
  }

  async exportCsv(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportV3ExportQueryDto,
  ): Promise<WorkReportV3CsvExport> {
    await this.requireOffice(officeId);
    await this.assertExportAllowed(user, officeId);

    if (query.dataset === WorkReportV3ExportDataset.OVERVIEW) {
      const overview = await this.getOverview(user, officeId, query);
      const rows: Array<Array<string | number>> = [];
      rows.push(['Work', 'Total Work', overview.totalWork]);
      for (const status of Object.values(WorkRuntimeStatus)) {
        rows.push(['Work Status', status, overview.statuses[status] ?? 0]);
      }
      rows.push(
        ['SLA', 'Overdue', overview.sla.overdue],
        ['SLA', 'Due Soon', overview.sla.dueSoon],
      );
      for (const row of overview.organizationPerformance) {
        const label = `${row.orgUnit.code} - ${row.orgUnit.name}`;
        rows.push(
          ['OrgUnit', `${label} · Primary Owner Work`, row.primaryOwnerWork],
          ['OrgUnit', `${label} · Participant Work`, row.participantWork],
          ['OrgUnit', `${label} · Responsible Stages`, row.responsibleStages],
          ['OrgUnit', `${label} · Completed Work`, row.completedWork],
          ['OrgUnit', `${label} · Overdue Work`, row.overdueWork],
        );
      }
      for (const row of overview.teamExecution) {
        rows.push([
          'Operational Team',
          `${row.operationalTeam.code} - ${row.operationalTeam.name} · Work Executed`,
          row.workCount,
        ]);
      }
      return this.createCsvExport(
        this.exportFilename('report-overview', query),
        ['Section', 'Metric', 'Value'],
        rows,
      );
    }

    if (query.dataset === WorkReportV3ExportDataset.WORK_RECORDS) {
      const rows = await this.collectAllWorkRecords(user, officeId, query);
      return this.createCsvExport(
        this.exportFilename('work-records', query),
        [
          'Ticket',
          'Work Type',
          'Primary Owner',
          'Execution Team',
          'Reference',
          'Date',
          'Status',
        ],
        rows.map((row) => [
          row.ticketNumber,
          row.workType.name,
          `${row.primaryOwner.code} - ${row.primaryOwner.name}`,
          row.executionTeams.map((team) => team.name).join('; '),
          row.reference.display ?? '',
          row.date,
          row.status,
        ]),
      );
    }

    if (query.dataset === WorkReportV3ExportDataset.TECHNICAL_PERFORMANCE) {
      const report = await this.getTechnicalPerformance(user, officeId, query);
      return this.createCsvExport(
        this.exportFilename('technical-performance', query),
        [
          'S.N.',
          'Date',
          'OrgUnit',
          'Team',
          'Support Staff',
          'Other Staff / Sales',
          'Ticket',
          'Pending',
          'Completed',
          'Service / Token',
        ],
        report.rows.map((row, index) => [
          index + 1,
          row.date,
          `${row.orgUnit.code} - ${row.orgUnit.name}`,
          row.operationalTeam?.name ?? '',
          row.supportStaff
            .map((person) => this.reportPersonLabel(person))
            .join('; '),
          row.otherStaff
            .map((person) => this.reportPersonLabel(person))
            .join('; '),
          row.total.tickets,
          row.total.pending,
          row.total.completed,
          row.references.join('; '),
        ]),
      );
    }

    const rows = await this.collectAllStageAnalysisRows(user, officeId, query);
    return this.createCsvExport(
      this.exportFilename('stage-sla', query),
      [
        'Ticket',
        'Work Status',
        'Work SLA',
        'Stage',
        'Stage Status',
        'Responsible OrgUnit',
        'Execution Team',
        'Stage SLA',
        'Due At',
        'Elapsed Minutes',
        'Active Minutes',
        'Waiting Minutes',
        'Blocked Minutes',
        'Blocker',
      ],
      rows.map((row) => [
        row.workItem.ticketNumber,
        row.workItem.status,
        row.workItem.workSlaState,
        row.stage.name,
        row.stage.status,
        `${row.stage.responsibleOrgUnit.code} - ${row.stage.responsibleOrgUnit.name}`,
        row.stage.operationalTeams.map((team) => team.name).join('; '),
        row.stage.slaState,
        row.stage.dueAt ?? '',
        row.durations.elapsedMinutes,
        row.durations.activeMinutes,
        row.durations.waitingMinutes,
        row.durations.blockedMinutes,
        row.stage.blockerReason ?? '',
      ]),
    );
  }

  async getPrintPayload(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportV3ExportQueryDto,
  ): Promise<WorkReportV3PrintPayload> {
    const office = await this.requireOffice(officeId);
    await this.assertExportAllowed(user, officeId);

    let content: WorkReportV3PrintPayload['content'];
    let rowCount: number;

    if (query.dataset === WorkReportV3ExportDataset.OVERVIEW) {
      content = await this.getOverview(user, officeId, query);
      rowCount = content.organizationPerformance.length;
    } else if (query.dataset === WorkReportV3ExportDataset.WORK_RECORDS) {
      content = await this.collectAllWorkRecords(user, officeId, query);
      rowCount = content.length;
    } else if (
      query.dataset === WorkReportV3ExportDataset.TECHNICAL_PERFORMANCE
    ) {
      content = await this.getTechnicalPerformance(user, officeId, query);
      rowCount = content.rows.length;
    } else {
      content = await this.collectAllStageAnalysisRows(user, officeId, query);
      rowCount = content.length;
    }

    return {
      dataset: query.dataset,
      generatedAt: new Date().toISOString(),
      office: { id: office.id, code: office.code, name: office.name },
      period: { from: query.from ?? null, to: query.to ?? null },
      rowCount,
      content,
    };
  }

  async getReconciliation(
    user: AuthenticatedUser,
    officeId: string,
  ): Promise<WorkReportV3Reconciliation> {
    await this.requireOffice(officeId);
    const scope = await this.resolveScope(user, officeId);

    if (scope.type !== 'OFFICE') {
      throw new ForbiddenException(
        'Report reconciliation is available only to Office-wide report scope.',
      );
    }

    const nativeV3Where: Prisma.WorkItemWhereInput = {
      officeId,
      status: WorkItemStatus.V3_RUNTIME,
    };
    const reportableWhere: Prisma.WorkItemWhereInput = {
      ...nativeV3Where,
      workTypeVersionId: { not: null },
      primaryOwnerOrgUnitId: { not: null },
      runtimeStatus: { not: null },
    };

    const [
      nativeV3Work,
      reportableV3Work,
      missingPrimaryOwner,
      missingWorkTypeVersion,
      missingRuntimeStatus,
      participantRows,
      runtimeStages,
      operationalTeamAssignments,
      activeTeamAssignmentsMissingOperationalTeamTarget,
      legacyTeamCompatibilityPointers,
      workWithLegacyTeamPrimaryOwner,
      participantsOnLegacyTeamOrgUnits,
      stagesWithLegacyTeamResponsibleOrgUnit,
      formalOrgUnits,
      operationalTeams,
      workTypes,
    ] = await Promise.all([
      this.prisma.workItem.count({ where: nativeV3Where }),
      this.prisma.workItem.count({ where: reportableWhere }),
      this.prisma.workItem.count({
        where: { ...nativeV3Where, primaryOwnerOrgUnitId: null },
      }),
      this.prisma.workItem.count({
        where: { ...nativeV3Where, workTypeVersionId: null },
      }),
      this.prisma.workItem.count({
        where: { ...nativeV3Where, runtimeStatus: null },
      }),
      this.prisma.workOrgUnitParticipant.count({
        where: { workItem: { is: reportableWhere } },
      }),
      this.prisma.workStage.count({
        where: { workItem: { is: reportableWhere } },
      }),
      this.prisma.workStageAssignment.count({
        where: {
          workStage: { is: { workItem: { is: reportableWhere } } },
          targetType: WorkStageAssignmentTargetType.TEAM,
          targetOperationalTeamId: { not: null },
        },
      }),
      this.prisma.workStageAssignment.count({
        where: {
          workStage: { is: { workItem: { is: reportableWhere } } },
          targetType: WorkStageAssignmentTargetType.TEAM,
          targetOperationalTeamId: null,
          endsAt: null,
        },
      }),
      this.prisma.workStageAssignment.count({
        where: {
          workStage: { is: { workItem: { is: reportableWhere } } },
          targetType: WorkStageAssignmentTargetType.TEAM,
          targetOrgUnitId: { not: null },
        },
      }),
      this.prisma.workItem.count({
        where: {
          AND: [
            reportableWhere,
            {
              primaryOwnerOrgUnit: {
                is: { orgUnitType: { isTeam: true } },
              },
            },
          ],
        },
      }),
      this.prisma.workOrgUnitParticipant.count({
        where: {
          workItem: { is: reportableWhere },
          orgUnit: { is: { orgUnitType: { isTeam: true } } },
        },
      }),
      this.prisma.workStage.count({
        where: {
          workItem: { is: reportableWhere },
          responsibleOrgUnit: {
            is: { orgUnitType: { isTeam: true } },
          },
        },
      }),
      this.prisma.orgUnit.count({
        where: {
          officeId,
          orgUnitType: { isTeam: false },
        },
      }),
      this.prisma.operationalTeam.count({
        where: { orgUnit: { officeId } },
      }),
      this.prisma.workTypeDefinition.count({ where: { officeId } }),
    ]);

    return {
      officeId,
      generatedAt: new Date().toISOString(),
      scopeType: 'OFFICE',
      counts: {
        nativeV3Work,
        reportableV3Work,
        missingPrimaryOwner,
        missingWorkTypeVersion,
        missingRuntimeStatus,
        participantRows,
        runtimeStages,
        operationalTeamAssignments,
        activeTeamAssignmentsMissingOperationalTeamTarget,
        legacyTeamCompatibilityPointers,
        workWithLegacyTeamPrimaryOwner,
        participantsOnLegacyTeamOrgUnits,
        stagesWithLegacyTeamResponsibleOrgUnit,
        formalOrgUnits,
        operationalTeams,
        workTypes,
      },
      invariants: {
        distinctWorkCounting: true,
        activeTeamAssignmentsMissingOperationalTeamTargetExpected: 0,
        workWithLegacyTeamPrimaryOwnerExpected: 0,
        participantsOnLegacyTeamOrgUnitsExpected: 0,
        stagesWithLegacyTeamResponsibleOrgUnitExpected: 0,
      },
    };
  }

  async buildScopedWorkWhere(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportV3QueryDto,
  ): Promise<Prisma.WorkItemWhereInput> {
    const scope = await this.resolveScope(user, officeId);
    await this.assertFiltersInsideScope(scope, query);
    const range = this.resolveRange(query);
    const now = new Date();
    const scopeWhere = this.scopeWorkWhere(scope);

    const AND: Prisma.WorkItemWhereInput[] = [
      {
        officeId,
        status: WorkItemStatus.V3_RUNTIME,
        runtimeStatus: { not: null },
        workTypeVersionId: { not: null },
        primaryOwnerOrgUnitId: { not: null },
      },
      scopeWhere,
    ];

    if (range) {
      AND.push({ createdAt: { gte: range.start, lt: range.endExclusive } });
    }
    if (query.orgUnitId) {
      AND.push({ primaryOwnerOrgUnitId: query.orgUnitId });
    }
    if (query.participantOrgUnitId) {
      AND.push({
        orgUnitParticipants: {
          some: { orgUnitId: query.participantOrgUnitId },
        },
      });
    }
    if (query.responsibleOrgUnitId) {
      AND.push({
        runtimeStages: {
          some: { responsibleOrgUnitId: query.responsibleOrgUnitId },
        },
      });
    }
    if (query.operationalTeamId) {
      AND.push({
        runtimeStages: {
          some: {
            assignments: {
              some: {
                targetType: WorkStageAssignmentTargetType.TEAM,
                targetOperationalTeamId: query.operationalTeamId,
              },
            },
          },
        },
      });
    }
    if (query.workTypeId) {
      AND.push({
        workTypeVersion: {
          is: { workTypeDefinitionId: query.workTypeId },
        },
      });
    }
    if (query.runtimeStatus) {
      AND.push({ runtimeStatus: query.runtimeStatus });
    }
    if (query.stageStatus) {
      AND.push({ runtimeStages: { some: { status: query.stageStatus } } });
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      AND.push({
        OR: [
          { ticketNumber: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          {
            references: {
              some: { normalizedValue: { contains: search.toLowerCase() } },
            },
          },
        ],
      });
    }
    if (query.slaState) {
      AND.push(this.slaWhere(query.slaState, now));
    }

    return { AND };
  }

  private async assertExportAllowed(
    user: AuthenticatedUser,
    officeId: string,
  ): Promise<void> {
    const scope = await this.resolveScope(user, officeId);
    if (!scope.availableActions.export) {
      throw new ForbiddenException(
        'You do not have permission to export reports.',
      );
    }
  }

  private async collectAllWorkRecords(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportV3QueryDto,
  ): Promise<WorkReportV3WorkRecord[]> {
    const first = await this.getWorkRecords(user, officeId, {
      ...query,
      page: 1,
      limit: 100,
    });
    const items = [...first.items];
    for (let page = 2; page <= first.totalPages; page += 1) {
      const next = await this.getWorkRecords(user, officeId, {
        ...query,
        page,
        limit: 100,
      });
      items.push(...next.items);
    }
    return items;
  }

  private async collectAllStageAnalysisRows(
    user: AuthenticatedUser,
    officeId: string,
    query: WorkReportV3QueryDto,
  ): Promise<WorkReportV3StageAnalysisRow[]> {
    const first = await this.getStageAnalysis(user, officeId, {
      ...query,
      page: 1,
      limit: 100,
    });
    const items = [...first.items];
    for (let page = 2; page <= first.totalPages; page += 1) {
      const next = await this.getStageAnalysis(user, officeId, {
        ...query,
        page,
        limit: 100,
      });
      items.push(...next.items);
    }
    return items;
  }

  private exportFilename(prefix: string, query: WorkReportV3QueryDto): string {
    const range =
      query.from && query.to ? `${query.from}-to-${query.to}` : 'all';
    return `${prefix}-${range}.csv`;
  }

  private reportPersonLabel(person: {
    name: string;
    employeeId: string | null;
  }): string {
    return person.employeeId
      ? `${person.name} (${person.employeeId})`
      : person.name;
  }

  private createCsvExport(
    filename: string,
    headers: string[],
    rows: Array<Array<string | number | boolean | null | undefined>>,
  ): WorkReportV3CsvExport {
    const lines = [headers, ...rows].map((row) =>
      row.map((cell) => this.csvCell(cell)).join(','),
    );
    return {
      filename,
      rowCount: rows.length,
      content: `\uFEFF${lines.join('\r\n')}\r\n`,
    };
  }

  private csvCell(value: string | number | boolean | null | undefined): string {
    let text = value == null ? '' : String(value);
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  private async resolveScope(
    user: AuthenticatedUser,
    officeId: string,
  ): Promise<WorkReportV3Scope> {
    const account = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      select: {
        id: true,
        accountClass: true,
        isEnabled: true,
        employee: {
          select: {
            id: true,
            status: true,
            employmentStatus: true,
            archivedAt: true,
            orgMemberships: {
              where: {
                officeId,
                membershipType: OrgMembershipType.PRIMARY,
                startsAt: { lte: new Date() },
                OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
              },
              take: 1,
              select: { orgUnitId: true },
            },
          },
        },
      },
    });

    if (
      !account ||
      !account.isEnabled ||
      account.accountClass !== user.accountClass
    ) {
      throw new ForbiddenException('Your account cannot access reports.');
    }

    if (account.accountClass === AccountClass.SUPER_ADMIN) {
      const view = await this.authorization.can(
        user,
        CAPABILITIES.REPORTS_VIEW,
        officeId,
        null,
      );
      if (!view) {
        throw new ForbiddenException('You do not have report access.');
      }
      return {
        type: 'OFFICE',
        officeId,
        accountId: account.id,
        orgUnitIds: [],
        operationalTeamIds: [],
        personalOperationalTeamIds: [],
        availableActions: {
          view: true,
          export: await this.authorization.can(
            user,
            CAPABILITIES.REPORTS_EXPORT,
            officeId,
            null,
          ),
        },
      };
    }

    const employee = account.employee;
    if (
      !employee ||
      employee.status !== EmployeeStatus.ACTIVE ||
      employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      employee.archivedAt !== null ||
      employee.orgMemberships.length === 0
    ) {
      throw new ForbiddenException(
        'Your active Office membership is required for reports.',
      );
    }

    if (
      await this.authorization.can(
        user,
        CAPABILITIES.REPORTS_VIEW,
        officeId,
        null,
      )
    ) {
      return {
        type: 'OFFICE',
        officeId,
        accountId: account.id,
        orgUnitIds: [],
        operationalTeamIds: [],
        personalOperationalTeamIds: [],
        availableActions: {
          view: true,
          export: await this.authorization.can(
            user,
            CAPABILITIES.REPORTS_EXPORT,
            officeId,
            null,
          ),
        },
      };
    }

    const visibleOrgUnitIds = await this.authorization.visibleOrgUnitIds(
      user,
      CAPABILITIES.REPORTS_VIEW,
      officeId,
    );
    if (visibleOrgUnitIds.length > 0) {
      const formalVisibleOrgUnits = await this.prisma.orgUnit.findMany({
        where: {
          id: { in: visibleOrgUnitIds },
          officeId,
          orgUnitType: { isTeam: false },
        },
        select: { id: true },
      });
      const formalVisibleOrgUnitIds = formalVisibleOrgUnits.map(
        (unit) => unit.id,
      );

      if (formalVisibleOrgUnitIds.length > 0) {
        const exportOrgUnitIds = await this.authorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.REPORTS_EXPORT,
          officeId,
        );
        const exportableFormalOrgUnitIds = new Set(
          (
            await this.prisma.orgUnit.findMany({
              where: {
                id: { in: exportOrgUnitIds },
                officeId,
                orgUnitType: { isTeam: false },
              },
              select: { id: true },
            })
          ).map((unit) => unit.id),
        );

        return {
          type:
            formalVisibleOrgUnitIds.length === 1
              ? 'ORG_UNIT'
              : 'ORG_UNIT_SUBTREE',
          officeId,
          accountId: account.id,
          orgUnitIds: formalVisibleOrgUnitIds,
          operationalTeamIds: [],
          personalOperationalTeamIds: [],
          availableActions: {
            view: true,
            export: formalVisibleOrgUnitIds.some((id) =>
              exportableFormalOrgUnitIds.has(id),
            ),
          },
        };
      }
    }

    const [leadTeams, memberTeams] = await Promise.all([
      this.prisma.operationalTeam.findMany({
        where: {
          isActive: true,
          archivedAt: null,
          orgUnit: { officeId, isActive: true },
          leadAssignments: {
            some: {
              employeeId: employee.id,
              effectiveFrom: { lte: new Date() },
              OR: [
                { effectiveUntil: null },
                { effectiveUntil: { gt: new Date() } },
              ],
            },
          },
        },
        select: { id: true, orgUnitId: true },
      }),
      this.prisma.operationalTeam.findMany({
        where: {
          isActive: true,
          archivedAt: null,
          orgUnit: { officeId, isActive: true },
          members: {
            some: {
              employeeId: employee.id,
              startsAt: { lte: new Date() },
              OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
            },
          },
        },
        select: { id: true },
      }),
    ]);

    if (leadTeams.length > 0) {
      return {
        type: 'TEAM',
        officeId,
        accountId: account.id,
        orgUnitIds: [...new Set(leadTeams.map((team) => team.orgUnitId))],
        operationalTeamIds: leadTeams.map((team) => team.id),
        personalOperationalTeamIds: memberTeams.map((team) => team.id),
        availableActions: { view: true, export: true },
      };
    }

    return {
      type: 'PERSONAL',
      officeId,
      accountId: account.id,
      orgUnitIds: [],
      operationalTeamIds: [],
      personalOperationalTeamIds: memberTeams.map((team) => team.id),
      availableActions: { view: true, export: true },
    };
  }

  private scopeWorkWhere(scope: WorkReportV3Scope): Prisma.WorkItemWhereInput {
    if (scope.type === 'OFFICE') {
      return {};
    }

    if (scope.type === 'ORG_UNIT' || scope.type === 'ORG_UNIT_SUBTREE') {
      return {
        OR: [
          { primaryOwnerOrgUnitId: { in: scope.orgUnitIds } },
          {
            orgUnitParticipants: {
              some: { orgUnitId: { in: scope.orgUnitIds } },
            },
          },
          {
            runtimeStages: {
              some: { responsibleOrgUnitId: { in: scope.orgUnitIds } },
            },
          },
        ],
      };
    }

    if (scope.type === 'TEAM') {
      return {
        runtimeStages: {
          some: {
            assignments: {
              some: {
                targetType: WorkStageAssignmentTargetType.TEAM,
                targetOperationalTeamId: { in: scope.operationalTeamIds },
              },
            },
          },
        },
      };
    }

    return {
      OR: [
        { createdByAccountId: scope.accountId },
        {
          runtimeStages: {
            some: {
              assignments: {
                some: {
                  OR: [
                    { targetAccountId: scope.accountId },
                    ...(scope.personalOperationalTeamIds.length > 0
                      ? [
                          {
                            targetType: WorkStageAssignmentTargetType.TEAM,
                            targetOperationalTeamId: {
                              in: scope.personalOperationalTeamIds,
                            },
                          },
                        ]
                      : []),
                  ],
                },
              },
            },
          },
        },
      ],
    };
  }

  private async assertFiltersInsideScope(
    scope: WorkReportV3Scope,
    query: WorkReportV3QueryDto,
  ): Promise<void> {
    const orgUnitIds = [
      query.orgUnitId,
      query.participantOrgUnitId,
      query.responsibleOrgUnitId,
    ].filter((value): value is string => Boolean(value));

    if (scope.type === 'PERSONAL' && orgUnitIds.length > 0) {
      throw new ForbiddenException(
        'Personal reports do not allow organization filters.',
      );
    }

    if (
      scope.type !== 'OFFICE' &&
      orgUnitIds.some((id) => !scope.orgUnitIds.includes(id))
    ) {
      throw new ForbiddenException(
        'The selected OrgUnit is outside your report scope.',
      );
    }

    if (query.operationalTeamId) {
      if (scope.type === 'PERSONAL') {
        throw new ForbiddenException(
          'Personal reports do not allow Team filters.',
        );
      }

      if (
        scope.type === 'TEAM' &&
        !scope.operationalTeamIds.includes(query.operationalTeamId)
      ) {
        throw new ForbiddenException(
          'The selected Team is outside your report scope.',
        );
      }

      if (scope.type === 'ORG_UNIT' || scope.type === 'ORG_UNIT_SUBTREE') {
        const team = await this.prisma.operationalTeam.findFirst({
          where: {
            id: query.operationalTeamId,
            orgUnitId: { in: scope.orgUnitIds },
          },
          select: { id: true },
        });
        if (!team) {
          throw new ForbiddenException(
            'The selected Team is outside your report scope.',
          );
        }
      }

      if (scope.type === 'OFFICE') {
        const team = await this.prisma.operationalTeam.findFirst({
          where: {
            id: query.operationalTeamId,
            orgUnit: { officeId: scope.officeId },
          },
          select: { id: true },
        });
        if (!team) {
          throw new ForbiddenException(
            'The selected Team is outside this Office.',
          );
        }
      }
    }

    if (query.workTypeId) {
      const workType = await this.prisma.workTypeDefinition.findFirst({
        where: { id: query.workTypeId, officeId: scope.officeId },
        select: { id: true },
      });
      if (!workType) {
        throw new ForbiddenException(
          'The selected Work Type is outside this Office.',
        );
      }
    }
  }

  private formatKathmanduDate(value: Date): string {
    const kathmandu = new Date(value.getTime() + KATHMANDU_OFFSET_MS);
    return [
      kathmandu.getUTCFullYear(),
      String(kathmandu.getUTCMonth() + 1).padStart(2, '0'),
      String(kathmandu.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }

  private presentWorkReference(
    workTypeCode: string,
    references: Array<{ referenceType: string; value: string }>,
  ): WorkReportV3WorkRecord['reference'] {
    const normalized = references.map((reference) => ({
      type: reference.referenceType.trim().toUpperCase(),
      value: reference.value,
    }));

    if (workTypeCode.trim().toUpperCase() === 'NEW_INSTALLATION') {
      const token = normalized.find((reference) =>
        ['TOKEN_NUMBER', 'TOKEN', 'REQUEST_NUMBER'].includes(reference.type),
      );
      const cpc = normalized.find(
        (reference) => reference.type === 'CPC_SERIAL',
      );
      const items = [token, cpc].filter(
        (reference): reference is { type: string; value: string } =>
          Boolean(reference),
      );
      const parts = [
        token ? `Token ${token.value}` : null,
        cpc ? `CPC ${cpc.value}` : null,
      ].filter((value): value is string => Boolean(value));
      return { display: parts.length > 0 ? parts.join(' · ') : null, items };
    }

    const service = normalized.find(
      (reference) => reference.type === 'SERVICE_NUMBER',
    );
    const primary = service ?? normalized[0] ?? null;
    return {
      display: primary?.value ?? null,
      items: normalized,
    };
  }

  private zeroPerformanceCounts(): WorkReportV3TechnicalPerformanceCounts {
    return { tickets: 0, completed: 0, pending: 0 };
  }

  private zeroTechnicalWorkTypes(): Record<
    TechnicalWorkTypeCode,
    WorkReportV3TechnicalPerformanceCounts
  > {
    return {
      ROUTINE_WORK: this.zeroPerformanceCounts(),
      TROUBLE_TICKET: this.zeroPerformanceCounts(),
      NETWORK_MAINTENANCE: this.zeroPerformanceCounts(),
      NEW_INSTALLATION: this.zeroPerformanceCounts(),
      UPDATE_SERVICES: this.zeroPerformanceCounts(),
      INSPECTION: this.zeroPerformanceCounts(),
      EMERGENCY_WORK: this.zeroPerformanceCounts(),
    };
  }

  private isTechnicalWorkTypeCode(
    value: string,
  ): value is TechnicalWorkTypeCode {
    return (TECHNICAL_WORK_TYPE_CODES as readonly string[]).includes(value);
  }

  private reportPerson(account: {
    id: string;
    username: string | null;
    employee: { empId: string; empName: string } | null;
  }): { accountId: string; name: string; employeeId: string | null } {
    return {
      accountId: account.id,
      name: account.employee?.empName ?? account.username ?? 'Unknown user',
      employeeId: account.employee?.empId ?? null,
    };
  }

  private primaryExecutionTeam(
    stages: Array<{
      responsibleOrgUnitId: string;
      assignments: Array<{
        targetOperationalTeam: {
          id: string;
          code: string;
          name: string;
        } | null;
      }>;
    }>,
    primaryOwnerOrgUnitId: string,
  ): { id: string; code: string; name: string } | null {
    for (const stage of stages) {
      if (stage.responsibleOrgUnitId !== primaryOwnerOrgUnitId) continue;
      for (const assignment of stage.assignments) {
        if (assignment.targetOperationalTeam) {
          return assignment.targetOperationalTeam;
        }
      }
    }
    return null;
  }

  private currentStageOverdueWhere(now: Date): Prisma.WorkStageWhereInput {
    return {
      status: {
        notIn: [
          WorkStageStatus.COMPLETED,
          WorkStageStatus.SKIPPED,
          WorkStageStatus.CANCELLED,
        ],
      },
      dueAt: { lt: now },
    };
  }

  private deadlineState(
    dueAt: Date,
    status: WorkRuntimeStatus,
    completedAt: Date | null,
    cancelledAt: Date | null,
    now: Date,
  ): WorkReportV3SlaState {
    if (status === WorkRuntimeStatus.CANCELLED || cancelledAt) {
      return WorkReportV3SlaState.ON_TRACK;
    }
    if (status === WorkRuntimeStatus.COMPLETED || completedAt) {
      return completedAt && completedAt > dueAt
        ? WorkReportV3SlaState.OVERDUE
        : WorkReportV3SlaState.ON_TRACK;
    }
    if (dueAt < now) return WorkReportV3SlaState.OVERDUE;
    if (dueAt < new Date(now.getTime() + DUE_SOON_MS)) {
      return WorkReportV3SlaState.DUE_SOON;
    }
    return WorkReportV3SlaState.ON_TRACK;
  }

  private stageDeadlineState(
    stage: {
      status: WorkStageStatus;
      dueAt: Date | null;
      completedAt: Date | null;
      cancelledAt: Date | null;
    },
    now: Date,
  ): WorkReportV3SlaState {
    if (!stage.dueAt) return WorkReportV3SlaState.ON_TRACK;
    if (stage.status === WorkStageStatus.CANCELLED || stage.cancelledAt) {
      return WorkReportV3SlaState.ON_TRACK;
    }
    if (
      stage.status === WorkStageStatus.COMPLETED ||
      stage.status === WorkStageStatus.SKIPPED ||
      stage.completedAt
    ) {
      return stage.completedAt && stage.completedAt > stage.dueAt
        ? WorkReportV3SlaState.OVERDUE
        : WorkReportV3SlaState.ON_TRACK;
    }
    if (stage.dueAt < now) return WorkReportV3SlaState.OVERDUE;
    if (stage.dueAt < new Date(now.getTime() + DUE_SOON_MS)) {
      return WorkReportV3SlaState.DUE_SOON;
    }
    return WorkReportV3SlaState.ON_TRACK;
  }

  private calculateStageDurations(
    stage: {
      createdAt: Date;
      status: WorkStageStatus;
      completedAt: Date | null;
      cancelledAt: Date | null;
      events: Array<{
        fromStageStatus: WorkStageStatus | null;
        toStageStatus: WorkStageStatus | null;
        createdAt: Date;
      }>;
    },
    now: Date,
  ): WorkReportV3StageAnalysisRow['durations'] {
    let currentStatus: WorkStageStatus = WorkStageStatus.PENDING;
    let cursor = stage.createdAt;
    let activeMs = 0;
    let waitingMs = 0;
    let blockedMs = 0;

    const accumulate = (status: WorkStageStatus, milliseconds: number) => {
      if (milliseconds <= 0 || TERMINAL_STAGE_STATUSES.has(status)) return;
      if (status === WorkStageStatus.IN_PROGRESS) {
        activeMs += milliseconds;
      } else if (status === WorkStageStatus.BLOCKED) {
        blockedMs += milliseconds;
      } else if (WAITING_STAGE_STATUSES.has(status)) {
        waitingMs += milliseconds;
      }
    };

    for (const event of stage.events) {
      const eventAt = event.createdAt < cursor ? cursor : event.createdAt;
      const intervalStatus = event.fromStageStatus ?? currentStatus;
      accumulate(intervalStatus, eventAt.getTime() - cursor.getTime());
      cursor = eventAt;
      if (event.toStageStatus) currentStatus = event.toStageStatus;
    }

    const terminalAt = stage.completedAt ?? stage.cancelledAt;
    const endAt = terminalAt && terminalAt < now ? terminalAt : now;
    if (endAt > cursor) {
      accumulate(currentStatus, endAt.getTime() - cursor.getTime());
    }

    const minutes = (milliseconds: number) =>
      Math.round((milliseconds / 60_000) * 10) / 10;
    return {
      elapsedMinutes: minutes(activeMs + waitingMs + blockedMs),
      activeMinutes: minutes(activeMs),
      waitingMinutes: minutes(waitingMs),
      blockedMinutes: minutes(blockedMs),
    };
  }

  private resolveRange(query: WorkReportV3QueryDto): ReportRange | null {
    if (!query.from && !query.to) return null;
    if (!query.from || !query.to) {
      throw new BadRequestException(
        'Both report start and end dates are required together.',
      );
    }

    const start = new Date(`${query.from}T00:00:00+05:45`);
    const endInclusive = new Date(`${query.to}T00:00:00+05:45`);
    if (endInclusive.getTime() < start.getTime()) {
      throw new BadRequestException(
        'Report end date must be on or after the start date.',
      );
    }

    const days =
      Math.floor((endInclusive.getTime() - start.getTime()) / 86_400_000) + 1;
    if (days > MAX_REPORT_DAYS) {
      throw new BadRequestException(
        `Report range cannot exceed ${MAX_REPORT_DAYS} days.`,
      );
    }

    return {
      start,
      endExclusive: new Date(endInclusive.getTime() + 86_400_000),
    };
  }

  private slaWhere(
    state: WorkReportV3SlaState,
    now: Date,
  ): Prisma.WorkItemWhereInput {
    const activeStatuses: WorkRuntimeStatus[] = [
      WorkRuntimeStatus.DRAFT,
      WorkRuntimeStatus.OPEN,
      WorkRuntimeStatus.IN_PROGRESS,
      WorkRuntimeStatus.WAITING,
      WorkRuntimeStatus.BLOCKED,
    ];

    if (state === WorkReportV3SlaState.OVERDUE) {
      return {
        runtimeStatus: { in: activeStatuses },
        dueAt: { lt: now },
      };
    }
    if (state === WorkReportV3SlaState.DUE_SOON) {
      return {
        runtimeStatus: { in: activeStatuses },
        dueAt: { gte: now, lt: new Date(now.getTime() + DUE_SOON_MS) },
      };
    }
    return {
      OR: [
        {
          runtimeStatus: {
            in: [WorkRuntimeStatus.COMPLETED, WorkRuntimeStatus.CANCELLED],
          },
        },
        { dueAt: { gte: new Date(now.getTime() + DUE_SOON_MS) } },
      ],
    };
  }

  private async requireOffice(officeId: string) {
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: { id: true, code: true, name: true, isActive: true },
    });
    if (!office) {
      throw new NotFoundException('Office was not found.');
    }
    return office;
  }
}
