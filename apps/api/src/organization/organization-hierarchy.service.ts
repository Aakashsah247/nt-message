import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../database/prisma.service';
import { NativeCacheService } from '../security/native-cache.service';
import {
  AccountClass,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  OrgMembershipType,
  type Prisma,
} from '../generated/prisma/client';

import { CreateOfficeDto } from './dto/create-office.dto';
import { CreateOrgUnitDto } from './dto/create-org-unit.dto';
import { CreateOrgUnitTypeDto } from './dto/create-org-unit-type.dto';
import { MoveOrgUnitDto } from './dto/move-org-unit.dto';
import { SetOrgUnitStatusDto } from './dto/set-org-unit-status.dto';
import { UpdateOrgUnitDto } from './dto/update-org-unit.dto';
import { UpdateOrgUnitTypeDto } from './dto/update-org-unit-type.dto';
import {
  CAPABILITIES,
  ORGANIZATION_ACCESS_CAPABILITIES,
  grantKeyAllowsCapability,
  type Capability,
} from './organization-capabilities';
import { OrganizationAuthorityService } from './organization-authority.service';
import { OrganizationAuthorizationService } from './organization-authorization.service';
import { ensureDefaultWorkTypeCatalog } from '../work-management/default-work-type-catalog';

const ORG_UNIT_DEPENDENCY_COUNT_SELECT = {
  childOrgUnits: true,
  memberships: true,
  leadershipAssignments: true,
  delegatedPermissions: true,
  intendedAccountRequests: true,
  primaryWorkTypeVersions: true,
  workTypeCreatorRules: true,
  workStageResponsibilities: true,
  primaryOwnedWorkItems: true,
  workParticipants: true,
  collaborationRequestsFrom: true,
  collaborationRequestsTo: true,
  responsibleWorkStages: true,
  workStageAssignmentTargets: true,
  ownershipTransfersFrom: true,
  ownershipTransfersTo: true,
  operationalTeams: true,
  dutyShiftTemplatesV3: true,
  dutyScheduleSeriesV3: true,
  dutyAssignmentsV3: true,
  dutyCoverageV3: true,
  dutyExceptionsV3: true,
  dutyHolidaysV3: true,
  officialGroupsV3: true,
  announcementsV3: true,
} as const;

type OrgUnitDependencyCounts = Record<
  keyof typeof ORG_UNIT_DEPENDENCY_COUNT_SELECT,
  number
>;

const INTERNAL_REACTIVATABLE_ORG_UNIT_TYPES = new Set(['PLACEMENT_PENDING']);

const ORG_UNIT_TYPE_CACHE_TTL_MS = 60_000;

@Injectable()
export class OrganizationHierarchyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authority: OrganizationAuthorityService,
    private readonly authorization: OrganizationAuthorizationService,
    private readonly conversationsService?: ConversationsService,
    @Optional() private readonly cache?: NativeCacheService,
  ) {}

  private orgUnitTypesCacheKey(officeId: string): string {
    return `reference:org-unit-types:${officeId}`;
  }

  private invalidateOrgUnitTypeCache(officeId: string): void {
    this.cache?.delete(this.orgUnitTypesCacheKey(officeId));
  }

  private normalizeCode(value: string): string {
    return value.trim().toUpperCase();
  }

  private normalizeName(value: string): string {
    return value.trim().replace(/\s+/g, ' ');
  }

  private nameKey(value: string): string {
    return this.normalizeName(value).toLocaleLowerCase('en-US');
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private isForeignKeyConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      (error as { code?: unknown }).code === 'P2003'
    );
  }

  private summarizeOrgUnitDependencies(counts: OrgUnitDependencyCounts) {
    const workRecords =
      counts.primaryWorkTypeVersions +
      counts.workTypeCreatorRules +
      counts.workStageResponsibilities +
      counts.primaryOwnedWorkItems +
      counts.workParticipants +
      counts.collaborationRequestsFrom +
      counts.collaborationRequestsTo +
      counts.responsibleWorkStages +
      counts.workStageAssignmentTargets +
      counts.ownershipTransfersFrom +
      counts.ownershipTransfersTo;
    const dutyRecords =
      counts.dutyShiftTemplatesV3 +
      counts.dutyScheduleSeriesV3 +
      counts.dutyAssignmentsV3 +
      counts.dutyCoverageV3 +
      counts.dutyExceptionsV3 +
      counts.dutyHolidaysV3;
    const blockers: string[] = [];

    const addBlocker = (count: number, label: string): void => {
      if (count > 0) {
        blockers.push(`${count} ${label}${count === 1 ? '' : 's'}`);
      }
    };

    addBlocker(counts.childOrgUnits, 'child unit');
    addBlocker(counts.memberships, 'people placement record');
    addBlocker(counts.leadershipAssignments, 'leadership record');
    addBlocker(counts.delegatedPermissions, 'shared access record');
    addBlocker(counts.intendedAccountRequests, 'account request');
    addBlocker(workRecords, 'work record');
    addBlocker(counts.operationalTeams, 'team record');
    addBlocker(dutyRecords, 'duty record');
    addBlocker(counts.officialGroupsV3, 'official group');
    addBlocker(counts.announcementsV3, 'announcement');

    return {
      blockers,
      linkedRecordCount:
        counts.childOrgUnits +
        counts.memberships +
        counts.leadershipAssignments +
        counts.delegatedPermissions +
        counts.intendedAccountRequests +
        workRecords +
        counts.operationalTeams +
        dutyRecords +
        counts.officialGroupsV3 +
        counts.announcementsV3,
    };
  }

  private async getOrgUnitDeletionContext(officeId: string, unitId: string) {
    const unit = await this.prisma.orgUnit.findFirst({
      where: {
        id: unitId,
        officeId,
      },
      select: {
        id: true,
        code: true,
        name: true,
        _count: {
          select: ORG_UNIT_DEPENDENCY_COUNT_SELECT,
        },
      },
    });

    if (!unit) {
      throw new NotFoundException('Unit was not found.');
    }

    return {
      unit,
      ...this.summarizeOrgUnitDependencies(unit._count),
    };
  }

  async createOffice(user: AuthenticatedUser, dto: CreateOfficeDto) {
    this.authority.assertPlatformAdmin(user);

    const code = this.normalizeCode(dto.code);
    const name = this.normalizeName(dto.name);

    try {
      const office = await this.prisma.$transaction(async (tx) => {
        const createdOffice = await tx.office.create({
          data: {
            code,
            name,
            nameKey: this.nameKey(name),
          },
        });

        await ensureDefaultWorkTypeCatalog(
          tx,
          createdOffice.id,
          user.accountId,
        );

        return createdOffice;
      });

      return {
        message: 'Office created successfully.',
        office,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'An office with this code or name already exists.',
        );
      }

      throw error;
    }
  }

  async listOffices(user: AuthenticatedUser) {
    const visibleOfficeIds = await this.authority.listVisibleOfficeIds(user);

    const [offices, currentPrimaryMemberships] = await Promise.all([
      this.prisma.office.findMany({
        where:
          visibleOfficeIds === null
            ? {}
            : {
                id: {
                  in: visibleOfficeIds,
                },
              },
        orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              orgUnits: true,
              memberships: true,
            },
          },
        },
      }),
      this.prisma.orgMembership.findMany({
        where: {
          ...(visibleOfficeIds === null
            ? {}
            : { officeId: { in: visibleOfficeIds } }),
          membershipType: OrgMembershipType.PRIMARY,
          startsAt: { lte: new Date() },
          OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          employee: {
            is: {
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              archivedAt: null,
            },
          },
        },
        select: { officeId: true, employeeId: true },
      }),
    ]);

    const currentPeopleByOffice = new Map<string, Set<string>>();
    for (const membership of currentPrimaryMemberships) {
      const people =
        currentPeopleByOffice.get(membership.officeId) ?? new Set();
      people.add(membership.employeeId);
      currentPeopleByOffice.set(membership.officeId, people);
    }

    return {
      data: offices.map((office) => ({
        ...office,
        currentPeopleCount: currentPeopleByOffice.get(office.id)?.size ?? 0,
      })),
    };
  }

  async getWorkspaceContext(user: AuthenticatedUser) {
    if (user.accountClass === AccountClass.SUPER_ADMIN) {
      return {
        authority: {
          kind: 'SUPER_ADMIN' as const,
          isOfficeHead: false,
          isOrganizationHead: false,
          isOrgUnitHead: false,
          isOperationalTeamLead: false,
        },
        primaryPlacement: null,
        scope: {
          officeIds: [],
          headedOrgUnitIds: [],
          topLevelHeadedOrgUnitIds: [],
          operationalTeamLeadIds: [],
        },
        features: {
          dashboard: true,
          directory: true,
          organizationView: true,
          organizationManage: false,
          accountRequests: false,
          workManagement: false,
          myWork: false,
          dutyRoster: false,
          myDuty: false,
          teamManagement: false,
          reports: true,
          workTypes: false,
          messages: true,
          settings: true,
          emergency: false,
          workOversight: true,
        },
      };
    }

    const now = new Date();
    const account = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      select: {
        isEnabled: true,
        accountClass: true,
        employee: {
          select: {
            id: true,
            status: true,
            employmentStatus: true,
            archivedAt: true,
            orgMemberships: {
              where: {
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
              },
              select: {
                officeId: true,
                orgUnitId: true,
                membershipType: true,
                office: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  },
                },
                orgUnit: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    orgUnitType: {
                      select: {
                        id: true,
                        code: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
            orgLeadershipAssignments: {
              where: {
                effectiveFrom: { lte: now },
                OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
              },
              select: {
                officeId: true,
                orgUnitId: true,
                leadershipType: true,
                orgUnit: {
                  select: {
                    id: true,
                    parentOrgUnitId: true,
                  },
                },
              },
            },
            operationalTeamLeadAssignments: {
              where: {
                effectiveFrom: { lte: now },
                OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
                team: {
                  is: {
                    isActive: true,
                    archivedAt: null,
                  },
                },
              },
              select: {
                teamId: true,
              },
            },
          },
        },
      },
    });

    if (
      !account?.isEnabled ||
      account.accountClass !== AccountClass.OFFICE_USER ||
      !account.employee ||
      account.employee.status !== EmployeeStatus.ACTIVE ||
      account.employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      account.employee.archivedAt !== null
    ) {
      throw new ForbiddenException('Your employee account is not active.');
    }

    const delegatedPermissions = await this.prisma.delegatedPermission.findMany(
      {
        where: {
          granteeAccountId: user.accountId,
          revokedAt: null,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        },
        select: { capability: true },
      },
    );
    const delegatedCapabilities = new Set(
      delegatedPermissions.map((permission) => permission.capability),
    );
    const hasDelegatedCapability = (...capabilities: Capability[]) =>
      capabilities.some((capability) =>
        [...delegatedCapabilities].some((grantKey) =>
          grantKeyAllowsCapability(grantKey, capability),
        ),
      );

    const employee = account.employee;
    const primaryMembership =
      employee.orgMemberships.find(
        (membership) => membership.membershipType === OrgMembershipType.PRIMARY,
      ) ??
      employee.orgMemberships[0] ??
      null;
    const officeHeadAssignments = employee.orgLeadershipAssignments.filter(
      (assignment) =>
        assignment.leadershipType === OrgLeadershipType.OFFICE_HEAD,
    );
    const orgUnitHeadAssignments = employee.orgLeadershipAssignments.filter(
      (assignment) =>
        assignment.leadershipType === OrgLeadershipType.ORG_UNIT_HEAD &&
        assignment.orgUnitId !== null,
    );
    const topLevelOrgUnitHeadAssignments = orgUnitHeadAssignments.filter(
      (assignment) => assignment.orgUnit?.parentOrgUnitId === null,
    );

    const isOfficeHead = officeHeadAssignments.length > 0;
    const isOrgUnitHead = orgUnitHeadAssignments.length > 0;
    const isOrganizationHead = topLevelOrgUnitHeadAssignments.length > 0;
    const isOperationalTeamLead =
      employee.operationalTeamLeadAssignments.length > 0;

    // Operational Team Lead is a contextual employee assignment, not a
    // permanent hierarchy/account persona. Keep the employee identity stable
    // and expose current team-lead responsibility independently below.
    const authorityKind = isOfficeHead
      ? ('OFFICE_HEAD' as const)
      : isOrganizationHead
        ? ('ORGANIZATION_HEAD' as const)
        : isOrgUnitHead
          ? ('ORG_UNIT_HEAD' as const)
          : ('EMPLOYEE' as const);

    const isFormalManager = isOfficeHead || isOrgUnitHead;
    const hasDelegatedOrganizationAccess = hasDelegatedCapability(
      ...ORGANIZATION_ACCESS_CAPABILITIES,
    );
    const hasDelegatedOrganizationMutation = hasDelegatedCapability(
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      CAPABILITIES.ORGANIZATION_RENAME_UNIT,
      CAPABILITIES.ORGANIZATION_MOVE_UNIT,
      CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
      CAPABILITIES.MEMBERSHIP_TRANSFER_INTERNAL,
      CAPABILITIES.MEMBERSHIP_ASSIGN_SECONDARY,
      CAPABILITIES.LEADERSHIP_ASSIGN,
      CAPABILITIES.LEADERSHIP_ASSIGN_ACTING,
      CAPABILITIES.LEADERSHIP_ASSIGN_DEPUTY,
    );
    const hasDelegatedWorkManagement = hasDelegatedCapability(
      CAPABILITIES.WORK_VIEW,
      CAPABILITIES.WORK_ASSIGN,
      CAPABILITIES.WORK_REQUEST_PARTICIPANT,
      CAPABILITIES.WORK_ACCEPT_PARTICIPANT,
      CAPABILITIES.WORK_APPROVE_STAGE,
      CAPABILITIES.WORK_RETURN_STAGE,
      CAPABILITIES.WORK_CANCEL,
      CAPABILITIES.WORK_REOPEN,
    );
    const hasDelegatedWorkTypeManagement = hasDelegatedCapability(
      CAPABILITIES.WORK_TYPE_VIEW,
      CAPABILITIES.WORK_TYPE_DRAFT,
    );
    const hasDelegatedDutyManagement = hasDelegatedCapability(
      CAPABILITIES.DUTY_VIEW,
      CAPABILITIES.DUTY_CREATE,
      CAPABILITIES.DUTY_ASSIGN,
      CAPABILITIES.DUTY_MANAGE,
    );
    const hasDelegatedReports = hasDelegatedCapability(
      CAPABILITIES.REPORTS_VIEW,
      CAPABILITIES.REPORTS_EXPORT,
    );
    const hasDelegatedTeamManagement = hasDelegatedCapability(
      CAPABILITIES.TEAM_MANAGE,
    );
    const hasDelegatedAccountRequests = hasDelegatedCapability(
      CAPABILITIES.USERS_REQUEST_CREATE,
    );
    const canManageWork = isFormalManager || hasDelegatedWorkManagement;
    const canManageDuty = isFormalManager || hasDelegatedDutyManagement;

    const officeIds = [
      ...new Set([
        ...employee.orgMemberships.map((membership) => membership.officeId),
        ...employee.orgLeadershipAssignments.map(
          (assignment) => assignment.officeId,
        ),
      ]),
    ];

    return {
      authority: {
        kind: authorityKind,
        isOfficeHead,
        isOrganizationHead,
        isOrgUnitHead,
        isOperationalTeamLead,
      },
      primaryPlacement: primaryMembership
        ? {
            office: primaryMembership.office,
            orgUnit: primaryMembership.orgUnit,
          }
        : null,
      scope: {
        officeIds,
        headedOrgUnitIds: orgUnitHeadAssignments
          .map((assignment) => assignment.orgUnitId)
          .filter((orgUnitId): orgUnitId is string => Boolean(orgUnitId)),
        topLevelHeadedOrgUnitIds: topLevelOrgUnitHeadAssignments
          .map((assignment) => assignment.orgUnitId)
          .filter((orgUnitId): orgUnitId is string => Boolean(orgUnitId)),
        operationalTeamLeadIds: employee.operationalTeamLeadAssignments.map(
          (assignment) => assignment.teamId,
        ),
      },
      features: {
        dashboard: true,
        directory: isFormalManager || hasDelegatedOrganizationAccess,
        organizationView: isFormalManager || hasDelegatedOrganizationAccess,
        organizationManage: isFormalManager || hasDelegatedOrganizationMutation,
        accountRequests: isFormalManager || hasDelegatedAccountRequests,
        workManagement: canManageWork,
        // Team Lead is a contextual team responsibility, not management
        // authority. Team Leads stay on the same personal Work surface as
        // every other employee unless formal/delegated authority exists.
        myWork: !isFormalManager,
        dutyRoster: canManageDuty,
        // Office Head uses Office-wide Duty Management; every other Office
        // user retains the personal My Duty surface from the previous model.
        myDuty: !isOfficeHead,
        // Operational Team administration is structural and intentionally is
        // not implied by Team Lead status or unrelated delegated capabilities.
        teamManagement: isFormalManager || hasDelegatedTeamManagement,
        reports: isFormalManager || hasDelegatedReports,
        workTypes:
          isOfficeHead || isOrganizationHead || hasDelegatedWorkTypeManagement,
        messages: true,
        settings: true,
        emergency: true,
        workOversight: false,
      },
    };
  }

  async getNavigationContext(user: AuthenticatedUser) {
    const { data: offices } = await this.listOffices(user);
    const officeIds = offices.map((office) => office.id);

    if (user.accountClass === AccountClass.SUPER_ADMIN) {
      return {
        mode: 'VIEW' as const,
        officeIds,
        manageableOfficeIds: [],
      };
    }

    const manageableOfficeIds: string[] = [];

    for (const office of offices) {
      const [
        canCreateRoot,
        createScopes,
        renameScopes,
        moveScopes,
        statusScopes,
      ] = await Promise.all([
        this.authorization.can(
          user,
          CAPABILITIES.ORGANIZATION_CREATE_UNIT,
          office.id,
          null,
        ),
        this.authorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.ORGANIZATION_CREATE_UNIT,
          office.id,
        ),
        this.authorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.ORGANIZATION_RENAME_UNIT,
          office.id,
        ),
        this.authorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.ORGANIZATION_MOVE_UNIT,
          office.id,
        ),
        this.authorization.visibleOrgUnitIds(
          user,
          CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
          office.id,
        ),
      ]);

      if (
        canCreateRoot ||
        createScopes.length > 0 ||
        renameScopes.length > 0 ||
        moveScopes.length > 0 ||
        statusScopes.length > 0
      ) {
        manageableOfficeIds.push(office.id);
      }
    }

    return {
      mode:
        manageableOfficeIds.length > 0
          ? ('MANAGE' as const)
          : ('NONE' as const),
      officeIds,
      manageableOfficeIds,
    };
  }

  async getOfficeHeadContext(user: AuthenticatedUser) {
    if (user.accountClass === AccountClass.SUPER_ADMIN) {
      return {
        isOfficeHead: false,
        officeIds: [],
      };
    }

    const { data: offices } = await this.listOffices(user);
    const officeIds: string[] = [];

    for (const office of offices) {
      try {
        await this.authority.assertOfficeHead(user, office.id);
        officeIds.push(office.id);
      } catch (error) {
        if (error instanceof ForbiddenException) {
          continue;
        }

        throw error;
      }
    }

    return {
      isOfficeHead: officeIds.length > 0,
      officeIds,
    };
  }

  async getOffice(user: AuthenticatedUser, officeId: string) {
    await this.authority.assertCanViewOffice(user, officeId);

    const [office, orgUnitTypes] = await Promise.all([
      this.prisma.office.findUnique({
        where: { id: officeId },
        select: {
          id: true,
          code: true,
          name: true,
          isActive: true,
          sortOrder: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              orgUnits: true,
              memberships: true,
              leadershipAssignments: true,
            },
          },
        },
      }),
      this.cache
        ? this.cache.getOrSet(
            this.orgUnitTypesCacheKey(officeId),
            () =>
              this.prisma.orgUnitType.findMany({
                where: { officeId },
                orderBy: [
                  { isActive: 'desc' },
                  { sortOrder: 'asc' },
                  { name: 'asc' },
                ],
              }),
            { ttlMs: ORG_UNIT_TYPE_CACHE_TTL_MS },
          )
        : this.prisma.orgUnitType.findMany({
            where: { officeId },
            orderBy: [
              { isActive: 'desc' },
              { sortOrder: 'asc' },
              { name: 'asc' },
            ],
          }),
    ]);

    if (!office) {
      this.invalidateOrgUnitTypeCache(officeId);
      throw new NotFoundException('Office was not found.');
    }

    return {
      office: {
        ...office,
        orgUnitTypes,
      },
    };
  }

  async getTree(user: AuthenticatedUser, officeId: string) {
    await this.authority.assertCanViewOffice(user, officeId);

    const visibleOrgUnitIds = await this.authorization.visibleOrgUnitIds(
      user,
      CAPABILITIES.ORGANIZATION_VIEW,
      officeId,
    );

    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    });

    if (!office) {
      throw new NotFoundException('Office was not found.');
    }

    const units = await this.prisma.orgUnit.findMany({
      where: {
        officeId,
        id: {
          in: visibleOrgUnitIds,
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        officeId: true,
        parentOrgUnitId: true,
        code: true,
        name: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        orgUnitType: {
          select: {
            id: true,
            code: true,
            name: true,
            isTeam: true,
            isActive: true,
          },
        },
        _count: {
          select: ORG_UNIT_DEPENDENCY_COUNT_SELECT,
        },
      },
    });

    const childrenByParent = new Map<string | null, typeof units>();

    for (const unit of units) {
      const siblings = childrenByParent.get(unit.parentOrgUnitId) ?? [];

      siblings.push(unit);
      childrenByParent.set(unit.parentOrgUnitId, siblings);
    }

    const buildTree = (
      parentId: string | null,
    ): Array<Record<string, unknown>> =>
      (childrenByParent.get(parentId) ?? []).map((unit) => {
        const dependencySummary = this.summarizeOrgUnitDependencies(
          unit._count,
        );

        return {
          ...unit,
          _count: {
            memberships: unit._count.memberships,
            childOrgUnits: unit._count.childOrgUnits,
            leadershipAssignments: unit._count.leadershipAssignments,
          },
          linkedRecordCount: dependencySummary.linkedRecordCount,
          deletionProtected: dependencySummary.blockers.length > 0,
          children: buildTree(unit.id),
        };
      });

    return {
      office,
      tree: buildTree(null),
    };
  }

  async getAvailableActions(
    user: AuthenticatedUser,
    officeId: string,
    orgUnitId: string | null,
  ) {
    await this.authority.assertCanViewOffice(user, officeId);

    const unit = orgUnitId
      ? await this.getUnitForOffice(officeId, orgUnitId)
      : null;

    const createUnit = await this.authorization.can(
      user,
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      officeId,
      orgUnitId,
    );

    if (!orgUnitId) {
      return {
        officeId,
        orgUnitId: null,
        availableActions: {
          createChildUnit: createUnit,
          renameUnit: false,
          moveUnit: false,
          changeUnitStatus: false,
          deactivationBlockers: {
            activeChildUnits: 0,
            activeMemberships: 0,
            activeLeadershipAssignments: 0,
          },
          deleteUnit: false,
          deleteBlockers: [],
        },
      };
    }

    const [renameUnit, moveUnit, changeUnitStatus] = await Promise.all([
      this.authorization.can(
        user,
        CAPABILITIES.ORGANIZATION_RENAME_UNIT,
        officeId,
        orgUnitId,
      ),
      this.authorization.can(
        user,
        CAPABILITIES.ORGANIZATION_MOVE_UNIT,
        officeId,
        orgUnitId,
      ),
      this.authorization.can(
        user,
        CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
        officeId,
        orgUnitId,
      ),
    ]);

    const deactivationBlockers =
      changeUnitStatus && unit?.isActive
        ? await this.getOrgUnitDeactivationBlockers(orgUnitId)
        : {
            activeChildUnits: 0,
            activeMemberships: 0,
            activeLeadershipAssignments: 0,
          };

    let deleteUnit = false;
    let deleteBlockers: string[] = [];

    try {
      await this.authority.assertOfficeHead(user, officeId);
      const deletionContext = await this.getOrgUnitDeletionContext(
        officeId,
        orgUnitId,
      );
      deleteBlockers = deletionContext.blockers;
      deleteUnit = deleteBlockers.length === 0;
    } catch (error) {
      if (!(error instanceof ForbiddenException)) {
        throw error;
      }
    }

    return {
      officeId,
      orgUnitId,
      availableActions: {
        createChildUnit: createUnit,
        renameUnit,
        moveUnit,
        changeUnitStatus,
        deactivationBlockers,
        deleteUnit,
        deleteBlockers,
      },
    };
  }

  async createUnitType(
    user: AuthenticatedUser,
    officeId: string,
    dto: CreateOrgUnitTypeDto,
  ) {
    await this.authorization.assertCan(
      user,
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      officeId,
      null,
    );

    const code = this.normalizeCode(dto.code);
    const name = this.normalizeName(dto.name);

    if (dto.isTeam) {
      throw new BadRequestException(
        'Operational Teams are managed separately and cannot be created as OrgUnit types.',
      );
    }

    try {
      const unitType = await this.prisma.orgUnitType.create({
        data: {
          officeId,
          code,
          name,
          nameKey: this.nameKey(name),
          isTeam: dto.isTeam ?? false,
          sortOrder: dto.sortOrder ?? 0,
        },
      });

      this.invalidateOrgUnitTypeCache(officeId);

      return {
        message: 'Organization type created successfully.',
        unitType,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('This organization type already exists.');
      }

      throw error;
    }
  }

  async updateUnitType(
    user: AuthenticatedUser,
    officeId: string,
    typeId: string,
    dto: UpdateOrgUnitTypeDto,
  ) {
    await this.authorization.assertCan(
      user,
      CAPABILITIES.ORGANIZATION_RENAME_UNIT,
      officeId,
      null,
    );

    if (dto.isActive !== undefined) {
      await this.authorization.assertCan(
        user,
        CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
        officeId,
        null,
      );
    }

    const existing = await this.prisma.orgUnitType.findFirst({
      where: {
        id: typeId,
        officeId,
      },
    });

    if (!existing) {
      throw new NotFoundException('Organization type was not found.');
    }

    if (dto.isActive === false && existing.isActive) {
      const activeUnits = await this.prisma.orgUnit.count({
        where: {
          orgUnitTypeId: typeId,
          isActive: true,
        },
      });

      if (activeUnits > 0) {
        throw new ConflictException(
          'Deactivate the active organizational units using this type first.',
        );
      }
    }

    const data: Prisma.OrgUnitTypeUpdateInput = {};

    if (dto.code !== undefined) {
      data.code = this.normalizeCode(dto.code);
    }

    if (dto.name !== undefined) {
      const name = this.normalizeName(dto.name);
      data.name = name;
      data.nameKey = this.nameKey(name);
    }

    if (dto.isTeam !== undefined && dto.isTeam !== existing.isTeam) {
      throw new BadRequestException(
        'Team classification on legacy OrgUnit types is historical and cannot be changed.',
      );
    }

    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
    }

    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }

    try {
      const unitType = await this.prisma.orgUnitType.update({
        where: { id: typeId },
        data,
      });

      this.invalidateOrgUnitTypeCache(officeId);

      return {
        message: 'Organization type updated successfully.',
        unitType,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException('This organization type already exists.');
      }

      throw error;
    }
  }

  async createOrgUnit(
    user: AuthenticatedUser,
    officeId: string,
    dto: CreateOrgUnitDto,
  ) {
    await this.authorization.assertCan(
      user,
      CAPABILITIES.ORGANIZATION_CREATE_UNIT,
      officeId,
      dto.parentOrgUnitId ?? null,
    );

    const code = this.normalizeCode(dto.code);
    const name = this.normalizeName(dto.name);

    try {
      const orgUnit = await this.prisma.$transaction(async (transaction) => {
        const unitType = await transaction.orgUnitType.findFirst({
          where: {
            id: dto.orgUnitTypeId,
            officeId,
            isActive: true,
          },
          select: {
            id: true,
            isTeam: true,
          },
        });

        if (!unitType) {
          throw new BadRequestException(
            'Select an active organization type from this office.',
          );
        }

        if (unitType.isTeam) {
          throw new BadRequestException(
            'Operational Teams cannot be created as formal OrgUnits.',
          );
        }

        if (dto.parentOrgUnitId) {
          const parent = await transaction.orgUnit.findFirst({
            where: {
              id: dto.parentOrgUnitId,
              officeId,
              isActive: true,
            },
            select: { id: true },
          });

          if (!parent) {
            throw new BadRequestException(
              'Select an active parent unit from this office.',
            );
          }
        }

        const created = await transaction.orgUnit.create({
          data: {
            officeId,
            orgUnitTypeId: dto.orgUnitTypeId,
            parentOrgUnitId: dto.parentOrgUnitId ?? null,
            code,
            name,
            nameKey: this.nameKey(name),
            sortOrder: dto.sortOrder ?? 0,
          },
        });

        await transaction.orgUnitClosure.create({
          data: {
            ancestorOrgUnitId: created.id,
            descendantOrgUnitId: created.id,
            depth: 0,
          },
        });

        if (dto.parentOrgUnitId) {
          const ancestors = await transaction.orgUnitClosure.findMany({
            where: {
              descendantOrgUnitId: dto.parentOrgUnitId,
            },
            select: {
              ancestorOrgUnitId: true,
              depth: true,
            },
          });

          if (ancestors.length > 0) {
            await transaction.orgUnitClosure.createMany({
              data: ancestors.map((ancestor) => ({
                ancestorOrgUnitId: ancestor.ancestorOrgUnitId,
                descendantOrgUnitId: created.id,
                depth: ancestor.depth + 1,
              })),
            });
          }
        }

        return created;
      });

      return {
        message: 'Unit created successfully.',
        orgUnit,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A unit with this code or name already exists in this location.',
        );
      }

      throw error;
    }
  }

  async updateOrgUnit(
    user: AuthenticatedUser,
    officeId: string,
    unitId: string,
    dto: UpdateOrgUnitDto,
  ) {
    const existing = await this.getUnitForOffice(officeId, unitId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.ORGANIZATION_RENAME_UNIT,
      officeId,
      unitId,
    );

    if (
      dto.code === undefined &&
      dto.name === undefined &&
      dto.sortOrder === undefined
    ) {
      throw new BadRequestException('Provide at least one field to update.');
    }

    const data: Prisma.OrgUnitUpdateInput = {};

    if (dto.code !== undefined) {
      data.code = this.normalizeCode(dto.code);
    }

    if (dto.name !== undefined) {
      const name = this.normalizeName(dto.name);
      data.name = name;
      data.nameKey = this.nameKey(name);
    }

    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }

    try {
      const orgUnit = await this.prisma.orgUnit.update({
        where: {
          id: existing.id,
        },
        data,
      });

      return {
        message: 'Unit updated successfully.',
        orgUnit,
      };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException(
          'A unit with this code or name already exists in this location.',
        );
      }

      throw error;
    }
  }

  async moveOrgUnit(
    user: AuthenticatedUser,
    officeId: string,
    unitId: string,
    dto: MoveOrgUnitDto,
  ) {
    const unit = await this.getUnitForOffice(officeId, unitId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.ORGANIZATION_MOVE_UNIT,
      officeId,
      unitId,
    );

    const newParentId = dto.parentOrgUnitId ?? null;

    if (newParentId === unit.id) {
      throw new BadRequestException('A unit cannot be placed inside itself.');
    }

    if (newParentId) {
      const parent = await this.prisma.orgUnit.findFirst({
        where: {
          id: newParentId,
          officeId,
          isActive: true,
        },
        select: { id: true },
      });

      if (!parent) {
        throw new BadRequestException(
          'Select an active parent unit from this office.',
        );
      }

      await this.authorization.assertCan(
        user,
        CAPABILITIES.ORGANIZATION_MOVE_UNIT,
        officeId,
        newParentId,
      );
    } else {
      await this.authorization.assertCan(
        user,
        CAPABILITIES.ORGANIZATION_MOVE_UNIT,
        officeId,
        null,
      );
    }

    const orgUnit = await this.prisma.$transaction(async (transaction) => {
      if (newParentId) {
        const createsCycle = await transaction.orgUnitClosure.findUnique({
          where: {
            ancestorOrgUnitId_descendantOrgUnitId: {
              ancestorOrgUnitId: unitId,
              descendantOrgUnitId: newParentId,
            },
          },
          select: { depth: true },
        });

        if (createsCycle) {
          throw new ConflictException(
            'This move would create a circular organization structure.',
          );
        }
      }

      const subtree = await transaction.orgUnitClosure.findMany({
        where: {
          ancestorOrgUnitId: unitId,
        },
        select: {
          descendantOrgUnitId: true,
          depth: true,
        },
      });

      if (subtree.length === 0) {
        throw new ConflictException(
          'The organization tree is incomplete for this unit.',
        );
      }

      const subtreeIds = subtree.map((item) => item.descendantOrgUnitId);

      await transaction.orgUnitClosure.deleteMany({
        where: {
          descendantOrgUnitId: {
            in: subtreeIds,
          },
          ancestorOrgUnitId: {
            notIn: subtreeIds,
          },
        },
      });

      const updated = await transaction.orgUnit.update({
        where: { id: unitId },
        data: {
          parentOrgUnitId: newParentId,
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });

      if (newParentId) {
        const parentAncestors = await transaction.orgUnitClosure.findMany({
          where: {
            descendantOrgUnitId: newParentId,
          },
          select: {
            ancestorOrgUnitId: true,
            depth: true,
          },
        });

        const links = parentAncestors.flatMap((ancestor) =>
          subtree.map((descendant) => ({
            ancestorOrgUnitId: ancestor.ancestorOrgUnitId,
            descendantOrgUnitId: descendant.descendantOrgUnitId,
            depth: ancestor.depth + 1 + descendant.depth,
          })),
        );

        if (links.length > 0) {
          await transaction.orgUnitClosure.createMany({
            data: links,
            skipDuplicates: true,
          });
        }
      }

      return updated;
    });

    await this.conversationsService?.synchronizeAllOfficialGroupsSafely(
      user.accountId,
      'ORG_UNIT_MOVED',
    );

    return {
      message: 'Unit moved successfully.',
      orgUnit,
    };
  }

  async setOrgUnitStatus(
    user: AuthenticatedUser,
    officeId: string,
    unitId: string,
    dto: SetOrgUnitStatusDto,
  ) {
    const unit = await this.getUnitForOffice(officeId, unitId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.ORGANIZATION_DEACTIVATE_UNIT,
      officeId,
      unitId,
    );

    if (unit.isActive === dto.isActive) {
      this.synchronizeOfficialGroupsAfterUnitStatus(
        user.accountId,
        dto.isActive,
      );

      return {
        message: dto.isActive
          ? 'Unit is already active.'
          : 'Unit is already inactive.',
        orgUnit: unit,
      };
    }

    if (!dto.isActive) {
      const deactivationBlockers =
        await this.getOrgUnitDeactivationBlockers(unitId);

      if (
        deactivationBlockers.activeChildUnits > 0 ||
        deactivationBlockers.activeMemberships > 0 ||
        deactivationBlockers.activeLeadershipAssignments > 0
      ) {
        throw new ConflictException(
          'Move or end the active people, leadership and child units before deactivating this unit.',
        );
      }
    } else {
      const type = await this.prisma.orgUnitType.findUnique({
        where: { id: unit.orgUnitTypeId },
        select: {
          code: true,
          isActive: true,
        },
      });

      const canReactivateWithInactiveType =
        unit.code === 'UNASSIGNED' &&
        type?.code !== undefined &&
        INTERNAL_REACTIVATABLE_ORG_UNIT_TYPES.has(type.code);

      if (!type?.isActive && !canReactivateWithInactiveType) {
        throw new ConflictException('Activate this organization type first.');
      }

      if (unit.parentOrgUnitId) {
        const parent = await this.prisma.orgUnit.findUnique({
          where: { id: unit.parentOrgUnitId },
          select: { isActive: true },
        });

        if (!parent?.isActive) {
          throw new ConflictException('Activate the parent unit first.');
        }
      }
    }

    const orgUnit = await this.prisma.orgUnit.update({
      where: { id: unitId },
      data: {
        isActive: dto.isActive,
      },
    });

    this.synchronizeOfficialGroupsAfterUnitStatus(user.accountId, dto.isActive);

    return {
      message: dto.isActive
        ? 'Unit activated successfully.'
        : 'Unit deactivated successfully.',
      orgUnit,
    };
  }

  async deleteOrgUnit(
    user: AuthenticatedUser,
    officeId: string,
    unitId: string,
  ) {
    await this.authority.assertOfficeHead(user, officeId);

    const deletionContext = await this.getOrgUnitDeletionContext(
      officeId,
      unitId,
    );

    if (deletionContext.blockers.length > 0) {
      throw new ConflictException(
        `This unit cannot be deleted because it still has ${deletionContext.blockers.join(
          ', ',
        )}. Move or close those records, or deactivate the unit instead.`,
      );
    }

    try {
      await this.prisma.orgUnit.delete({
        where: { id: unitId },
      });
    } catch (error) {
      if (this.isForeignKeyConstraintError(error)) {
        throw new ConflictException(
          'This unit cannot be deleted because another record started using it. Refresh the page and try again.',
        );
      }

      throw error;
    }

    await this.conversationsService?.synchronizeAllOfficialGroupsSafely(
      user.accountId,
      'ORG_UNIT_DELETED',
    );

    return {
      message: 'Unit deleted successfully.',
      deletedOrgUnit: {
        id: deletionContext.unit.id,
        code: deletionContext.unit.code,
        name: deletionContext.unit.name,
      },
    };
  }

  private async getOrgUnitDeactivationBlockers(unitId: string): Promise<{
    activeChildUnits: number;
    activeMemberships: number;
    activeLeadershipAssignments: number;
  }> {
    const now = new Date();
    const [activeChildUnits, activeMemberships, activeLeadershipAssignments] =
      await Promise.all([
        this.prisma.orgUnit.count({
          where: {
            parentOrgUnitId: unitId,
            isActive: true,
          },
        }),
        this.prisma.orgMembership.count({
          where: {
            orgUnitId: unitId,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            employee: {
              is: {
                status: EmployeeStatus.ACTIVE,
                employmentStatus: EmploymentStatus.ACTIVE,
                archivedAt: null,
              },
            },
          },
        }),
        this.prisma.orgLeadershipAssignment.count({
          where: {
            orgUnitId: unitId,
            effectiveFrom: { lte: now },
            OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
          },
        }),
      ]);

    return {
      activeChildUnits,
      activeMemberships,
      activeLeadershipAssignments,
    };
  }

  private synchronizeOfficialGroupsAfterUnitStatus(
    actorAccountId: string,
    isActive: boolean,
  ): void {
    // Unit status is authoritative once persisted. Official-group synchronization
    // is best-effort and must not hold the HTTP response open. This also makes an
    // idempotent retry re-trigger synchronization if the first response was lost.
    void this.conversationsService?.synchronizeAllOfficialGroupsSafely(
      actorAccountId,
      isActive ? 'ORG_UNIT_ACTIVATED' : 'ORG_UNIT_DEACTIVATED',
    );
  }

  private async getUnitForOffice(officeId: string, unitId: string) {
    const unit = await this.prisma.orgUnit.findFirst({
      where: {
        id: unitId,
        officeId,
      },
    });

    if (!unit) {
      throw new NotFoundException('Unit was not found.');
    }

    return unit;
  }
}
