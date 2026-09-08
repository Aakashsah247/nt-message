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
  EmployeeStatus,
  EmploymentStatus,
  OrgMembershipType,
  WorkItemStatus,
  WorkRuntimeStatus,
  WorkStageAssignmentTargetType,
  WorkTypeVersionStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import {
  WorkReportV3QueryDto,
  WorkReportV3SlaState,
} from './dto/work-report-v3-query.dto';

const MAX_REPORT_DAYS = 366;
const DUE_SOON_MS = 24 * 60 * 60 * 1000;

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
          some: { orgUnitId: query.participantOrgUnitId, endedAt: null },
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
                endsAt: null,
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

  private async resolveScope(
    user: AuthenticatedUser,
    officeId: string,
  ): Promise<WorkReportV3Scope> {
    const account = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      select: {
        id: true,
        role: true,
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

    if (!account || !account.isEnabled || account.role !== user.role) {
      throw new ForbiddenException('Your account cannot access reports.');
    }

    if (account.role === AccountRole.SUPER_ADMIN) {
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
              some: { orgUnitId: { in: scope.orgUnitIds }, endedAt: null },
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
    const orgUnitIds = [query.orgUnitId, query.participantOrgUnitId].filter(
      (value): value is string => Boolean(value),
    );

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
        { runtimeStatus: { in: [WorkRuntimeStatus.COMPLETED, WorkRuntimeStatus.CANCELLED] } },
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
