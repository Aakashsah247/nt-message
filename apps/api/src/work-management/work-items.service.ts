import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  OrgMembershipType,
  WorkActivityAction,
  WorkAssignmentRole,
  WorkItemStatus,
  WorkSalesCoordinationStatus,
  WorkServiceType,
  WorkTypeVersionStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CreateWorkItemDto } from './dto/create-work-item.dto';
import { UpdateWorkItemDto } from './dto/update-work-item.dto';
import {
  ListWorkItemsQueryDto,
  WorkQueueView,
} from './dto/list-work-items-query.dto';
import { WorkNotificationsService } from './work-notifications.service';
import { WorkScopeService, type WorkActorContext } from './work-scope.service';
import { WorkStatusTransitionService } from './work-status-transition.service';
import {
  assertWorkIdentityFieldValues,
  isWorkFieldCollectedAtCreation,
  normalizeReferenceValue,
  validateWorkIntakeFields,
} from './work-field-validator';
import { WorkTypeTemplate } from './fixed-work-type-template';
import {
  isWorkSystemControlledFieldCode,
  WORK_SYSTEM_CONTROLLED_FIELD_CODES,
} from './work-foundation.constants';

const accountSummarySelect = {
  id: true,
  username: true,
  accountClass: true,
  employee: {
    select: {
      id: true,
      empId: true,
      empName: true,
      designation: true,
      orgMemberships: {
        where: { membershipType: OrgMembershipType.PRIMARY, endsAt: null },
        orderBy: { startsAt: 'desc' as const },
        take: 1,
        select: {
          officeId: true,
          orgUnitId: true,
          orgUnit: { select: { id: true, code: true, name: true } },
        },
      },
    },
  },
} satisfies Prisma.AccountSelect;

type AccountSummary = Prisma.AccountGetPayload<{
  select: typeof accountSummarySelect;
}>;

const workListSelect = {
  id: true,
  ticketNumber: true,
  title: true,
  description: true,
  status: true,
  officeId: true,
  workTypeVersionId: true,
  primaryOwnerOrgUnitId: true,
  assignedOperationalTeamId: true,
  responsibleReviewerAccountId: true,
  salesMemberAccountId: true,
  salesCoordinationStatus: true,
  registeredAt: true,
  plannedStartAt: true,
  dueAt: true,
  completedAt: true,
  closedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  workTypeVersion: {
    select: {
      id: true,
      version: true,
      name: true,
      workTypeDefinition: { select: { id: true, code: true } },
    },
  },
  primaryOwnerOrgUnit: { select: { id: true, code: true, name: true } },
  assignedOperationalTeam: {
    select: {
      id: true,
      code: true,
      name: true,
      orgUnitId: true,
      orgUnit: { select: { id: true, code: true, name: true } },
      members: {
        where: { endsAt: null },
        orderBy: [
          { employee: { empName: 'asc' as const } },
          { startsAt: 'asc' as const },
        ],
        select: {
          id: true,
          startsAt: true,
          employee: {
            select: {
              id: true,
              empId: true,
              empName: true,
              designation: true,
              account: {
                select: {
                  id: true,
                  username: true,
                  accountClass: true,
                },
              },
            },
          },
        },
      },
      leadAssignments: {
        where: { effectiveUntil: null },
        orderBy: [
          { isActing: 'desc' as const },
          { effectiveFrom: 'desc' as const },
        ],
        take: 1,
        select: { employeeId: true },
      },
    },
  },
  createdBy: { select: accountSummarySelect },
  responsibleReviewer: { select: accountSummarySelect },
  salesMember: { select: accountSummarySelect },
  assignments: {
    where: { endedAt: null },
    orderBy: [
      { assignmentRole: 'asc' as const },
      { createdAt: 'asc' as const },
    ],
    select: {
      id: true,
      assignmentRole: true,
      acknowledgedAt: true,
      startedAt: true,
      createdAt: true,
      assignee: { select: accountSummarySelect },
      assignedBy: { select: accountSummarySelect },
    },
  },
};

const workDetailSelect = {
  ...workListSelect,
  helpRequests: {
    orderBy: { createdAt: 'desc' as const },
    take: 50,
    select: {
      id: true,
      workItemId: true,
      reason: true,
      materialType: true,
      note: true,
      status: true,
      previousStatus: true,
      responseNote: true,
      respondedAt: true,
      createdAt: true,
      updatedAt: true,
      requestedBy: { select: accountSummarySelect },
      requestedHelper: { select: accountSummarySelect },
      respondedBy: { select: accountSummarySelect },
      coordinatedBy: { select: accountSummarySelect },
      coordinatedAt: true,
    },
  },
  workTypeVersion: {
    select: {
      id: true,
      version: true,
      name: true,
      template: true,
      salesDisplayLabel: true,
      workTypeDefinition: { select: { id: true, code: true } },
      fields: {
        where: { code: { notIn: [...WORK_SYSTEM_CONTROLLED_FIELD_CODES] } },
        orderBy: { sortOrder: 'asc' as const },
        select: {
          id: true,
          code: true,
          label: true,
          fieldType: true,
          isRequired: true,
          sortOrder: true,
          stageDefinitionId: true,
          config: true,
        },
      },
    },
  },
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
  locationText: true,
  salesDocumentsSentAt: true,
  salesCompletedAt: true,
  salesCompletionNote: true,
  fieldValues: {
    where: { workStageId: null },
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      value: true,
      fieldDefinition: {
        select: {
          id: true,
          code: true,
          label: true,
          fieldType: true,
          isRequired: true,
          sortOrder: true,
          config: true,
        },
      },
    },
  },
  completionReports: {
    orderBy: { createdAt: 'desc' as const },
    select: {
      id: true,
      result: true,
      summary: true,
      customerId: true,
      rxLevelDbm: true,
      moreWorkRequired: true,
      fieldValuesSnapshot: true,
      reviewStatus: true,
      managerNote: true,
      reviewedAt: true,
      createdAt: true,
      submittedBy: { select: accountSummarySelect },
      reviewedBy: { select: accountSummarySelect },
      evidence: {
        orderBy: { createdAt: 'asc' as const },
        select: {
          id: true,
          originalFileName: true,
          mimeType: true,
          fileSizeBytes: true,
          expiresAt: true,
          expiredAt: true,
          purgedAt: true,
          createdAt: true,
        },
      },
    },
  },
  activities: {
    orderBy: { createdAt: 'asc' as const },
    take: 300,
    select: {
      id: true,
      action: true,
      fromStatus: true,
      toStatus: true,
      details: true,
      createdAt: true,
      actor: { select: accountSummarySelect },
    },
  },
};

@Injectable()
export class WorkItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workScopeService: WorkScopeService,
    private readonly statusTransitions: WorkStatusTransitionService,
    private readonly workNotifications: WorkNotificationsService,
  ) {}

  private async resolveWorkTypeCreationScope(
    actor: WorkActorContext,
    officeId: string,
  ): Promise<{ officeHead: boolean; ancestorOrgUnitIds: Set<string> }> {
    const account = await this.prisma.account.findUnique({
      where: { id: actor.accountId },
      select: { employeeId: true },
    });
    if (!account?.employeeId) {
      return { officeHead: false, ancestorOrgUnitIds: new Set<string>() };
    }

    const now = new Date();
    const [officeHeadAssignment, ancestors] = await Promise.all([
      this.prisma.orgLeadershipAssignment.findFirst({
        where: {
          employeeId: account.employeeId,
          officeId,
          leadershipType: OrgLeadershipType.OFFICE_HEAD,
          effectiveFrom: { lte: now },
          OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        },
        select: { id: true },
      }),
      actor.primaryOrgUnitId
        ? this.prisma.orgUnitClosure.findMany({
            where: { descendantOrgUnitId: actor.primaryOrgUnitId },
            select: { ancestorOrgUnitId: true },
          })
        : Promise.resolve([] as Array<{ ancestorOrgUnitId: string }>),
    ]);

    return {
      officeHead: Boolean(officeHeadAssignment),
      ancestorOrgUnitIds: new Set([
        ...(actor.primaryOrgUnitId ? [actor.primaryOrgUnitId] : []),
        ...ancestors.map((item) => item.ancestorOrgUnitId),
      ]),
    };
  }

  private canCreateWorkTypeVersion(
    creatorOrgUnits: Array<{ orgUnitId: string; includeDescendants: boolean }>,
    scope: { officeHead: boolean; ancestorOrgUnitIds: Set<string> },
    primaryOrgUnitId?: string | null,
  ): boolean {
    if (scope.officeHead) return true;
    if (!primaryOrgUnitId || creatorOrgUnits.length === 0) return false;
    return creatorOrgUnits.some(
      (owner) =>
        owner.orgUnitId === primaryOrgUnitId ||
        (owner.includeDescendants &&
          scope.ancestorOrgUnitIds.has(owner.orgUnitId)),
    );
  }

  async getCreateContext(user: AuthenticatedUser, officeId: string) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.assertActorOffice(actor, officeId);
    this.workScopeService.assertCanCreateWork(actor);
    const now = new Date();

    const [office, versions, supportAccounts, orgUnits] = await Promise.all([
      this.prisma.office.findFirst({
        where: { id: officeId, isActive: true },
        select: { id: true, code: true, name: true, isActive: true },
      }),
      this.prisma.workTypeVersion.findMany({
        where: {
          status: WorkTypeVersionStatus.PUBLISHED,
          workTypeDefinition: { officeId, isActive: true },
        },
        orderBy: [
          { workTypeDefinition: { sortOrder: 'asc' } },
          { version: 'desc' },
        ],
        select: {
          id: true,
          version: true,
          name: true,
          template: true,
          salesDisplayLabel: true,
          primaryOwnerOrgUnitId: true,
          slaBasis: true,
          overallSlaMinutes: true,
          primaryOwnerOrgUnit: { select: { id: true, code: true, name: true } },
          creatorOrgUnits: {
            select: { orgUnitId: true, includeDescendants: true },
          },
          workTypeDefinition: { select: { id: true, code: true } },
          fields: {
            where: { code: { notIn: [...WORK_SYSTEM_CONTROLLED_FIELD_CODES] } },
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              code: true,
              label: true,
              fieldType: true,
              isRequired: true,
              stageDefinitionId: true,
              config: true,
            },
          },
        },
      }),
      this.prisma.account.findMany({
        where: {
          isEnabled: true,
          accountClass: AccountClass.OFFICE_USER,
          employee: {
            is: {
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              archivedAt: null,
              orgMemberships: {
                some: {
                  officeId,
                  membershipType: OrgMembershipType.PRIMARY,
                  startsAt: { lte: now },
                  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                },
              },
            },
          },
        },
        orderBy: { employee: { empName: 'asc' } },
        select: accountSummarySelect,
      }),
      this.prisma.orgUnit.findMany({
        where: { officeId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { id: true, code: true, name: true, parentOrgUnitId: true },
      }),
    ]);

    if (!office) throw new NotFoundException('An active Office was not found.');

    const allMainTeams = await this.prisma.operationalTeam.findMany({
      where: {
        isActive: true,
        archivedAt: null,
        orgUnit: { officeId, isActive: true },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        orgUnitId: true,
        orgUnit: { select: { id: true, code: true, name: true } },
        members: {
          where: {
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
          select: {
            employee: { select: { account: { select: { id: true } } } },
          },
        },
      },
    });

    const reviewerScopes = await Promise.all(
      orgUnits.map(async (orgUnit) => ({
        orgUnitId: orgUnit.id,
        candidates: await this.listReviewerCandidates(
          officeId,
          orgUnit.id,
          now,
        ),
      })),
    );
    type ReviewerCandidate =
      (typeof reviewerScopes)[number]['candidates'][number] & {
        eligibleOwnerOrgUnitIds: string[];
      };
    const reviewerByAccount = new Map<string, ReviewerCandidate>();
    for (const scope of reviewerScopes) {
      for (const candidate of scope.candidates) {
        const existing = reviewerByAccount.get(candidate.accountId);
        reviewerByAccount.set(candidate.accountId, {
          ...candidate,
          eligibleOwnerOrgUnitIds: [
            ...new Set([
              ...(existing?.eligibleOwnerOrgUnitIds ?? []),
              scope.orgUnitId,
            ]),
          ],
        });
      }
    }
    const allReviewerCandidates = [...reviewerByAccount.values()];

    const creationScope = await this.resolveWorkTypeCreationScope(
      actor,
      officeId,
    );
    const seen = new Set<string>();
    const workTypes = [];
    for (const version of versions) {
      if (seen.has(version.workTypeDefinition.id)) continue;
      seen.add(version.workTypeDefinition.id);
      if (!version.primaryOwnerOrgUnitId) continue;
      if (
        !this.canCreateWorkTypeVersion(
          version.creatorOrgUnits,
          creationScope,
          actor.primaryOrgUnitId,
        )
      ) {
        continue;
      }

      const template = version.template as WorkTypeTemplate;
      const registeredAtDefinition = version.fields.find(
        (field) =>
          field.code === 'REGISTERED_AT' &&
          isWorkFieldCollectedAtCreation(field),
      );
      const runtimeFields = version.fields.filter(
        (field) =>
          field.code !== 'REGISTERED_AT' &&
          isWorkFieldCollectedAtCreation(field),
      );

      const reviewerCandidates = allReviewerCandidates;
      const mainAssigneeCandidates =
        template === WorkTypeTemplate.ADMINISTRATIVE ? supportAccounts : [];

      workTypes.push({
        workTypeDefinitionId: version.workTypeDefinition.id,
        code: version.workTypeDefinition.code,
        workTypeVersionId: version.id,
        version: version.version,
        name: version.name,
        primaryOwnerOrgUnit: version.primaryOwnerOrgUnit!,
        slaBasis: version.slaBasis,
        overallSlaMinutes: version.overallSlaMinutes,
        template,
        executionAssignmentMode:
          template === WorkTypeTemplate.ADMINISTRATIVE
            ? 'TEAM_OR_USER'
            : 'TEAM',
        requiresSalesParticipant: template === WorkTypeTemplate.TEAM_SALES,
        salesDisplayLabel:
          template === WorkTypeTemplate.TEAM_SALES
            ? version.salesDisplayLabel?.trim() || 'Sales'
            : null,
        registeredAtEnabled: Boolean(registeredAtDefinition),
        reviewerCandidates,
        mainTeams: allMainTeams
          .map((team) => {
            const memberAccountIds = team.members.flatMap((member) =>
              member.employee.account?.id ? [member.employee.account.id] : [],
            );
            const eligibleReviewers = reviewerCandidates.filter(
              (reviewer) =>
                reviewer.eligibleOwnerOrgUnitIds.includes(team.orgUnitId) &&
                !memberAccountIds.includes(reviewer.accountId),
            );
            return {
              id: team.id,
              code: team.code,
              name: team.name,
              memberAccountIds,
              orgUnit: team.orgUnit,
              reviewerCandidates: eligibleReviewers,
            };
          })
          .filter(
            (team) =>
              !team.memberAccountIds.includes(actor.accountId) ||
              team.reviewerCandidates.length > 0,
          ),
        mainAssigneeCandidates: mainAssigneeCandidates
          .map((account) => {
            const candidate = this.serializeCandidate(account);
            return {
              ...candidate,
              reviewerCandidates: reviewerCandidates.filter(
                (reviewer) => reviewer.accountId !== candidate.accountId,
              ),
            };
          })
          .filter(
            (candidate) =>
              candidate.accountId !== actor.accountId ||
              candidate.reviewerCandidates.length > 0,
          ),
        fields: runtimeFields,
      });
    }

    return {
      office,
      orgUnits,
      workTypes,
      myBranchOrgUnitIds: actor.visibleOrgUnitIds ?? [],
      supportMemberCandidates: supportAccounts.map((account) =>
        this.serializeCandidate(account),
      ),
    };
  }

  async create(
    user: AuthenticatedUser,
    officeId: string,
    dto: CreateWorkItemDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.assertActorOffice(actor, officeId);
    this.workScopeService.assertCanCreateWork(actor);

    const duplicate = await this.prisma.workItem.findFirst({
      where: {
        createdByAccountId: actor.accountId,
        creationRequestId: dto.clientRequestId,
      },
      select: { id: true, creationRequestFingerprint: true },
    });
    const fingerprint = this.fingerprint(dto);
    if (duplicate) {
      if (duplicate.creationRequestFingerprint !== fingerprint) {
        throw new ConflictException(
          'This creation request ID was already used with different Work data.',
        );
      }
      return this.getById(user, duplicate.id);
    }

    const version = await this.prisma.workTypeVersion.findFirst({
      where: {
        id: dto.workTypeVersionId,
        workTypeDefinition: { officeId, isActive: true },
      },
      select: {
        id: true,
        version: true,
        status: true,
        name: true,
        template: true,
        primaryOwnerOrgUnitId: true,
        creatorOrgUnits: {
          select: { orgUnitId: true, includeDescendants: true },
        },
        workTypeDefinition: { select: { id: true, code: true } },
        fields: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            code: true,
            fieldType: true,
            isRequired: true,
            stageDefinitionId: true,
            config: true,
          },
        },
      },
    });
    if (!version) {
      throw new BadRequestException(
        'Choose a Work Type version from the current Create Work catalog.',
      );
    }

    const currentPublishedVersion = await this.prisma.workTypeVersion.findFirst(
      {
        where: {
          workTypeDefinitionId: version.workTypeDefinition.id,
          status: WorkTypeVersionStatus.PUBLISHED,
        },
        orderBy: { version: 'desc' },
        select: { id: true, version: true },
      },
    );
    if (
      version.status !== WorkTypeVersionStatus.PUBLISHED ||
      currentPublishedVersion?.id !== version.id
    ) {
      throw new ConflictException(
        'This Work Type changed after this form was opened. Refresh Create Work and review the latest published version before submitting.',
      );
    }
    if (!version.primaryOwnerOrgUnitId) {
      throw new BadRequestException(
        'Choose a published Work Type with a suggested Owner OrgUnit.',
      );
    }

    const creationScope = await this.resolveWorkTypeCreationScope(
      actor,
      officeId,
    );
    if (
      !this.canCreateWorkTypeVersion(
        version.creatorOrgUnits,
        creationScope,
        actor.primaryOrgUnitId,
      )
    ) {
      throw new ForbiddenException(
        'This Work Type is not owned by your Division and cannot be created from your organization branch.',
      );
    }

    const primaryExecutionOrgUnit = await this.prisma.orgUnit.findFirst({
      where: {
        id: dto.primaryExecutionOrgUnitId,
        officeId,
        isActive: true,
      },
      select: { id: true, code: true, name: true },
    });
    if (!primaryExecutionOrgUnit) {
      throw new BadRequestException(
        'Choose an active Primary Execution OrgUnit in this Office.',
      );
    }

    const template = version.template as WorkTypeTemplate;
    const registeredAtDefinition = version.fields.find(
      (field) =>
        field.code === 'REGISTERED_AT' && isWorkFieldCollectedAtCreation(field),
    );
    const runtimeFields = version.fields.filter(
      (field) =>
        field.code !== 'REGISTERED_AT' &&
        !isWorkSystemControlledFieldCode(field.code) &&
        isWorkFieldCollectedAtCreation(field),
    );
    const now = new Date();

    const isAdministrative = template === WorkTypeTemplate.ADMINISTRATIVE;
    const needsSales = template === WorkTypeTemplate.TEAM_SALES;
    const hasTeam = Boolean(dto.mainOperationalTeamId);
    const hasIndividual = Boolean(dto.mainAssigneeAccountId);
    if (
      isAdministrative ? hasTeam === hasIndividual : !hasTeam || hasIndividual
    ) {
      throw new BadRequestException(
        isAdministrative
          ? 'Administrative Work must be assigned to exactly one Main Team or one individual.'
          : 'Operational Work must be assigned to one Main Team.',
      );
    }

    const mainTeam = dto.mainOperationalTeamId
      ? await this.prisma.operationalTeam.findFirst({
          where: {
            id: dto.mainOperationalTeamId,
            isActive: true,
            archivedAt: null,
            orgUnit: { officeId, isActive: true },
          },
          select: {
            id: true,
            name: true,
            orgUnitId: true,
            members: {
              where: {
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
              },
              select: {
                employee: { select: { account: { select: { id: true } } } },
              },
            },
          },
        })
      : null;
    if (dto.mainOperationalTeamId && !mainTeam) {
      throw new BadRequestException(
        'Choose an active Main Team in this Office.',
      );
    }
    if (mainTeam && mainTeam.orgUnitId !== primaryExecutionOrgUnit.id) {
      const teamScope = await this.prisma.orgUnitClosure.findFirst({
        where: {
          ancestorOrgUnitId: primaryExecutionOrgUnit.id,
          descendantOrgUnitId: mainTeam.orgUnitId,
        },
        select: { depth: true },
      });
      if (!teamScope) {
        throw new BadRequestException(
          'Choose a Main Team from the selected Primary Execution OrgUnit or one of its child units.',
        );
      }
    }

    const mainAssignee = dto.mainAssigneeAccountId
      ? await this.resolveOfficeAccount(officeId, dto.mainAssigneeAccountId)
      : null;
    if (mainAssignee) {
      const mainAssigneeOrgUnitId =
        mainAssignee.employee?.orgMemberships[0]?.orgUnitId;
      if (!mainAssigneeOrgUnitId) {
        throw new BadRequestException(
          'The individual assignee must have an active Primary OrgUnit.',
        );
      }
      const mainAssigneeScope =
        mainAssigneeOrgUnitId === primaryExecutionOrgUnit.id
          ? { depth: 0 }
          : await this.prisma.orgUnitClosure.findFirst({
              where: {
                ancestorOrgUnitId: primaryExecutionOrgUnit.id,
                descendantOrgUnitId: mainAssigneeOrgUnitId,
              },
              select: { depth: true },
            });
      if (!mainAssigneeScope) {
        throw new BadRequestException(
          'The individual assignee must belong to the selected Primary Execution OrgUnit or one of its child units.',
        );
      }
    }

    const mainExecutorAccountIds = new Set<string>([
      ...(mainAssignee ? [mainAssignee.id] : []),
      ...(mainTeam?.members.flatMap((member) =>
        member.employee.account?.id ? [member.employee.account.id] : [],
      ) ?? []),
    ]);

    if (
      isAdministrative &&
      hasIndividual &&
      dto.responsibleReviewerAccountId &&
      dto.responsibleReviewerAccountId !== actor.accountId
    ) {
      throw new BadRequestException(
        'Individual Administrative Work is reviewed by the Head who created the Work.',
      );
    }

    const reviewer = await this.resolveReviewer(
      officeId,
      primaryExecutionOrgUnit.id,
      isAdministrative && hasIndividual
        ? undefined
        : dto.responsibleReviewerAccountId,
      actor.accountId,
    );
    if (mainExecutorAccountIds.has(reviewer.id)) {
      throw new BadRequestException(
        'The Responsible Reviewer cannot also perform this Work as the Main Assignee or Main Team member.',
      );
    }

    let salesMember: Awaited<
      ReturnType<WorkItemsService['resolveOfficeAccount']>
    > | null = null;
    if (needsSales) {
      if (!dto.salesOrgUnitId || !dto.salesMemberAccountId) {
        throw new BadRequestException(
          'Choose a Sales OrgUnit and Sales Member for this Work Type.',
        );
      }
      const salesUnit = await this.prisma.orgUnit.findFirst({
        where: { id: dto.salesOrgUnitId, officeId, isActive: true },
        select: { id: true },
      });
      if (!salesUnit)
        throw new BadRequestException('Choose an active Sales OrgUnit.');
      salesMember = await this.resolveOfficeAccount(
        officeId,
        dto.salesMemberAccountId,
      );
      const salesMemberOrgUnitId =
        salesMember.employee?.orgMemberships[0]?.orgUnitId;
      if (!salesMemberOrgUnitId) {
        throw new BadRequestException(
          'The Sales Member must have an active Primary OrgUnit.',
        );
      }
      const salesScope =
        salesMemberOrgUnitId === dto.salesOrgUnitId
          ? { depth: 0 }
          : await this.prisma.orgUnitClosure.findFirst({
              where: {
                ancestorOrgUnitId: dto.salesOrgUnitId,
                descendantOrgUnitId: salesMemberOrgUnitId,
              },
              select: { depth: true },
            });
      if (!salesScope) {
        throw new BadRequestException(
          'The Sales Member must belong to the selected Sales OrgUnit or one of its child units.',
        );
      }
      if (
        salesMember.id === reviewer.id ||
        mainExecutorAccountIds.has(salesMember.id)
      ) {
        throw new BadRequestException(
          'The Sales Member must be different from the Main executor and Responsible Reviewer.',
        );
      }
    } else if (dto.salesMemberAccountId || dto.salesOrgUnitId) {
      throw new BadRequestException(
        'Sales selection applies only to Team + Sales Work Types.',
      );
    }

    const supportIds = [...new Set(dto.supportMemberAccountIds ?? [])];
    let supportOrgUnit: { id: string } | null = null;
    if (supportIds.length > 0) {
      if (!dto.supportOrgUnitId) {
        throw new BadRequestException(
          'Choose a Supporting Staff OrgUnit before selecting Supporting Staff.',
        );
      }
      supportOrgUnit = await this.prisma.orgUnit.findFirst({
        where: { id: dto.supportOrgUnitId, officeId, isActive: true },
        select: { id: true },
      });
      if (!supportOrgUnit) {
        throw new BadRequestException(
          'Choose an active Supporting Staff OrgUnit.',
        );
      }
    } else if (dto.supportOrgUnitId) {
      throw new BadRequestException(
        'Supporting Staff OrgUnit applies only when Supporting Staff are selected.',
      );
    }

    const supports = await Promise.all(
      supportIds.map((accountId) =>
        this.resolveOfficeAccount(officeId, accountId),
      ),
    );
    if (supportOrgUnit) {
      for (const support of supports) {
        const supportMemberOrgUnitId =
          support.employee?.orgMemberships[0]?.orgUnitId;
        if (!supportMemberOrgUnitId) {
          throw new BadRequestException(
            'Supporting Staff must have an active Primary OrgUnit.',
          );
        }
        const supportScope =
          supportMemberOrgUnitId === supportOrgUnit.id
            ? { depth: 0 }
            : await this.prisma.orgUnitClosure.findFirst({
                where: {
                  ancestorOrgUnitId: supportOrgUnit.id,
                  descendantOrgUnitId: supportMemberOrgUnitId,
                },
                select: { depth: true },
              });
        if (!supportScope) {
          throw new BadRequestException(
            'Supporting Staff must belong to the selected Supporting Staff OrgUnit or one of its child units.',
          );
        }
      }
    }

    const reserved = new Set<string>([
      ...mainExecutorAccountIds,
      reviewer.id,
      ...(salesMember ? [salesMember.id] : []),
    ]);
    for (const support of supports) {
      if (reserved.has(support.id)) {
        throw new BadRequestException(
          'Supporting Staff must be different from the Main executor, Responsible Reviewer and Sales Member.',
        );
      }
    }

    const fieldInputs = dto.fields.map((field) => ({
      code: field.code,
      value: field.value,
    }));
    const validatedFields = validateWorkIntakeFields(
      runtimeFields,
      fieldInputs,
    );
    const validatedFieldMap = new Map(
      validatedFields.values.map((item) => [item.code, item.value]),
    );
    const contactTypeValue = validatedFieldMap.get('CUSTOMER_CONTACT_TYPE');
    const contactNumberValue = validatedFieldMap.get('CUSTOMER_CONTACT_NUMBER');
    if (
      typeof contactTypeValue === 'string' &&
      contactNumberValue !== undefined &&
      contactNumberValue !== null
    ) {
      const contactNumber = String(contactNumberValue).trim();
      if (contactTypeValue === 'MOBILE' && !/^\d{10}$/.test(contactNumber)) {
        throw new BadRequestException(
          'Mobile number must contain exactly 10 digits.',
        );
      }
      if (contactTypeValue === 'TELEPHONE') {
        const telephoneDigits = contactNumber.replace(/\D/g, '').length;
        if (!/^[0-9][0-9 -]*[0-9]$/.test(contactNumber)) {
          throw new BadRequestException(
            'Telephone number may contain only digits, spaces and hyphens.',
          );
        }
        if (telephoneDigits < 6 || telephoneDigits > 12) {
          throw new BadRequestException(
            'Telephone number must contain between 6 and 12 digits.',
          );
        }
      }
    }

    const dueAt = new Date(dto.dueAt);
    if (Number.isNaN(dueAt.getTime()) || dueAt <= now) {
      throw new BadRequestException('Due time must be in the future.');
    }
    const plannedStartAt = dto.plannedStartAt
      ? new Date(dto.plannedStartAt)
      : now;
    if (Number.isNaN(plannedStartAt.getTime())) {
      throw new BadRequestException(
        'Choose a valid planned start date and time.',
      );
    }
    const registeredAt = dto.registeredAt ? new Date(dto.registeredAt) : null;
    if (
      registeredAtDefinition?.isRequired &&
      (!registeredAt || Number.isNaN(registeredAt.getTime()))
    ) {
      throw new BadRequestException(
        'Registered date and time is required for this Work Type.',
      );
    }
    if (!registeredAtDefinition && registeredAt) {
      throw new BadRequestException(
        'Registered date and time is not collected by this Work Type version.',
      );
    }
    if (registeredAt && registeredAt > now) {
      throw new BadRequestException(
        'Registered date and time cannot be in the future.',
      );
    }
    if (registeredAt && plannedStartAt < registeredAt) {
      throw new BadRequestException(
        'Planned start cannot be earlier than the registered date and time.',
      );
    }
    if (dueAt <= plannedStartAt) {
      throw new BadRequestException(
        'Due time must be later than the planned start time.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await assertWorkIdentityFieldValues(
        tx,
        officeId,
        now,
        validatedFields.identityValues,
      );
      const ticketNumber = `NT-W-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
      const fieldMap = new Map(
        validatedFields.values.map((item) => [item.code, item.value]),
      );
      const stringField = (code: string) => {
        const value = fieldMap.get(code);
        return typeof value === 'string' ? value : null;
      };
      const listField = (code: string) => {
        const value = fieldMap.get(code);
        return Array.isArray(value)
          ? value.filter((item): item is string => typeof item === 'string')
          : [];
      };
      const contactType = stringField('CUSTOMER_CONTACT_TYPE');
      const configuredServiceTypes = listField('SERVICE_TYPES');
      const legacyServiceTypeSet = new Set<WorkServiceType>();
      const customServiceTypes: string[] = [];
      for (const serviceType of configuredServiceTypes) {
        if (
          Object.values(WorkServiceType).includes(
            serviceType as WorkServiceType,
          )
        ) {
          legacyServiceTypeSet.add(serviceType as WorkServiceType);
        } else {
          customServiceTypes.push(serviceType);
          legacyServiceTypeSet.add(WorkServiceType.OTHER);
        }
      }
      const legacyServiceTypes = [...legacyServiceTypeSet];
      const legacyOtherServiceText =
        stringField('OTHER_SERVICE_TEXT') ??
        (customServiceTypes.length > 0 ? customServiceTypes.join(', ') : null);
      const workItem = await tx.workItem.create({
        data: {
          ticketNumber,
          title: dto.title.trim(),
          description: dto.description?.trim() ?? '',
          status: WorkItemStatus.ASSIGNED,
          officeId,
          workTypeVersionId: version.id,
          primaryOwnerOrgUnitId: primaryExecutionOrgUnit.id,
          assignedOperationalTeamId: mainTeam?.id ?? null,
          openedAt: now,
          creationRequestId: dto.clientRequestId,
          creationRequestFingerprint: fingerprint,
          responsibleReviewerAccountId: reviewer.id,
          salesMemberAccountId: salesMember?.id ?? null,
          salesCoordinationStatus: salesMember
            ? WorkSalesCoordinationStatus.WAITING_FOR_DOCUMENTS
            : null,
          customerName: stringField('CUSTOMER_NAME'),
          customerContactType:
            contactType === 'MOBILE' || contactType === 'TELEPHONE'
              ? contactType
              : null,
          customerContactNumber: stringField('CUSTOMER_CONTACT_NUMBER'),
          serviceTypes: legacyServiceTypes,
          otherServiceText: legacyOtherServiceText,
          requestNumber: stringField('TOKEN_NUMBER'),
          cpcSerial: stringField('CPC_SERIAL'),
          serviceNumber: stringField('SERVICE_NUMBER'),
          olt: stringField('OLT'),
          fdcName: stringField('FDC_NAME'),
          fapName: stringField('FAP_NAME'),
          locationText: stringField('LOCATION'),
          registeredAt,
          plannedStartAt,
          dueAt,
          createdByAccountId: actor.accountId,
          assignments: {
            create: [
              ...(mainAssignee
                ? [
                    {
                      assigneeAccountId: mainAssignee.id,
                      assignmentRole: WorkAssignmentRole.PRIMARY,
                      assignedByAccountId: actor.accountId,
                    },
                  ]
                : []),
              ...supports.map((support) => ({
                assigneeAccountId: support.id,
                assignmentRole: WorkAssignmentRole.SUPPORTING,
                assignedByAccountId: actor.accountId,
              })),
            ],
          },
          fieldValues: {
            create: validatedFields.values.map((field) => ({
              fieldDefinitionId: field.fieldDefinitionId,
              value: field.value,
              updatedByAccountId: actor.accountId,
            })),
          },
        },
        select: workDetailSelect,
      });

      const references = validatedFields.values
        .filter(
          (field) =>
            field.fieldType === 'REFERENCE' && typeof field.value === 'string',
        )
        .map((field) => ({
          workItemId: workItem.id,
          referenceType: field.code,
          value: field.value as string,
          normalizedValue: normalizeReferenceValue(field.value as string),
          sourceFieldDefinitionId: field.fieldDefinitionId,
          createdByAccountId: actor.accountId,
        }));
      if (references.length > 0)
        await tx.workReference.createMany({
          data: references,
          skipDuplicates: true,
        });

      await tx.workActivity.create({
        data: {
          workItemId: workItem.id,
          actorAccountId: actor.accountId,
          action: WorkActivityAction.CREATED,
          toStatus: WorkItemStatus.ASSIGNED,
          details: {
            template,
            primaryExecutionOrgUnitId: primaryExecutionOrgUnit.id,
            mainOperationalTeamId: mainTeam?.id ?? null,
            mainAssigneeAccountId: mainAssignee?.id ?? null,
            responsibleReviewerAccountId: reviewer.id,
            salesMemberAccountId: salesMember?.id ?? null,
            supportMemberAccountIds: supports.map((support) => support.id),
          },
        },
      });
      return workItem;
    });

    const assignmentNotificationRecipients = [
      ...mainExecutorAccountIds,
      ...supports.map((support) => support.id),
    ];
    await this.workNotifications.publishWorkUpdate({
      workItem: created,
      action: 'CREATED',
      actorAccountId: actor.accountId,
      recipientAccountIds: assignmentNotificationRecipients,
      notificationRecipientAccountIds: assignmentNotificationRecipients,
      title: 'New Work assigned',
      body: `${created.ticketNumber}: ${created.title}`,
    });

    return { message: 'Work assigned successfully.', workItem: created };
  }

  async list(user: AuthenticatedUser, query: ListWorkItemsQueryDto) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const filters: Prisma.WorkItemWhereInput[] = [
      this.buildVisibleWhere(actor),
    ];
    filters.push(
      query.view === WorkQueueView.HISTORY
        ? { status: { in: [WorkItemStatus.CLOSED, WorkItemStatus.CANCELLED] } }
        : {
            status: {
              notIn: [WorkItemStatus.CLOSED, WorkItemStatus.CANCELLED],
            },
          },
    );
    if (query.status) filters.push({ status: query.status });
    if (query.workTypeVersionId)
      filters.push({ workTypeVersionId: query.workTypeVersionId });
    if (query.orgUnitId)
      filters.push({ primaryOwnerOrgUnitId: query.orgUnitId });
    if (query.operationalTeamId)
      filters.push({ assignedOperationalTeamId: query.operationalTeamId });
    if (query.assigneeAccountId) {
      filters.push({
        assignments: {
          some: { assigneeAccountId: query.assigneeAccountId, endedAt: null },
        },
      });
    }
    const search = query.search?.trim();
    if (search) {
      filters.push({
        OR: [
          { ticketNumber: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
          {
            workTypeVersion: {
              name: { contains: search, mode: 'insensitive' },
            },
          },
          {
            primaryOwnerOrgUnit: {
              name: { contains: search, mode: 'insensitive' },
            },
          },
          {
            assignedOperationalTeam: {
              name: { contains: search, mode: 'insensitive' },
            },
          },
        ],
      });
    }
    const where: Prisma.WorkItemWhereInput = { AND: filters };
    const [data, total] = await Promise.all([
      this.prisma.workItem.findMany({
        where,
        orderBy:
          query.view === WorkQueueView.HISTORY
            ? [{ updatedAt: 'desc' }, { ticketNumber: 'desc' }]
            : [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: workListSelect,
      }),
      this.prisma.workItem.count({ where }),
    ]);
    return {
      data,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.max(Math.ceil(total / query.limit), 1),
      },
    };
  }

  async getById(user: AuthenticatedUser, workItemId: string) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const workItem = await this.prisma.workItem.findFirst({
      where: { AND: [{ id: workItemId }, this.buildVisibleWhere(actor)] },
      select: workDetailSelect,
    });
    if (!workItem) throw new NotFoundException('Work item was not found.');
    return workItem;
  }

  async updateDetails(
    user: AuthenticatedUser,
    workItemId: string,
    dto: UpdateWorkItemDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    this.workScopeService.assertCanManageWork(actor);

    const current = await this.prisma.workItem.findFirst({
      where: { AND: [{ id: workItemId }, this.buildVisibleWhere(actor)] },
      select: {
        id: true,
        status: true,
        primaryOwnerOrgUnitId: true,
        registeredAt: true,
        plannedStartAt: true,
        dueAt: true,
        locationText: true,
      },
    });
    if (!current) throw new NotFoundException('Work item was not found.');
    if (
      !current.primaryOwnerOrgUnitId ||
      !(actor.assignableOrgUnitIds ?? []).includes(
        current.primaryOwnerOrgUnitId,
      )
    ) {
      throw new ForbiddenException(
        'This Work is outside your V3 management scope.',
      );
    }
    if (
      current.status === WorkItemStatus.CLOSED ||
      current.status === WorkItemStatus.CANCELLED
    ) {
      throw new ConflictException('Closed or cancelled Work cannot be edited.');
    }

    const registeredAt =
      dto.registeredAt === undefined
        ? current.registeredAt
        : new Date(dto.registeredAt);
    const plannedStartAt =
      dto.plannedStartAt === undefined
        ? current.plannedStartAt
        : new Date(dto.plannedStartAt);
    const dueAt = dto.dueAt === undefined ? current.dueAt : new Date(dto.dueAt);

    if (registeredAt && Number.isNaN(registeredAt.getTime())) {
      throw new BadRequestException('Choose a valid registered date and time.');
    }
    if (plannedStartAt && Number.isNaN(plannedStartAt.getTime())) {
      throw new BadRequestException(
        'Choose a valid planned start date and time.',
      );
    }
    if (Number.isNaN(dueAt.getTime())) {
      throw new BadRequestException('Choose a valid due date and time.');
    }
    if (registeredAt && plannedStartAt && plannedStartAt < registeredAt) {
      throw new BadRequestException(
        'Planned start cannot be earlier than the registered date and time.',
      );
    }
    if (plannedStartAt && dueAt <= plannedStartAt) {
      throw new BadRequestException(
        'Due time must be later than the planned start time.',
      );
    }
    if (!plannedStartAt && registeredAt && dueAt <= registeredAt) {
      throw new BadRequestException(
        'Due time must be later than the registered date and time.',
      );
    }

    const changedDueAt =
      dto.dueAt !== undefined && dueAt.getTime() !== current.dueAt.getTime();
    const changed =
      dto.registeredAt !== undefined ||
      dto.plannedStartAt !== undefined ||
      dto.dueAt !== undefined ||
      dto.locationText !== undefined;
    if (!changed) {
      return {
        message: 'No Work details changed.',
        workItem: await this.getById(user, workItemId),
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.workItem.update({
        where: { id: workItemId },
        data: {
          ...(dto.registeredAt !== undefined ? { registeredAt } : {}),
          ...(dto.plannedStartAt !== undefined ? { plannedStartAt } : {}),
          ...(dto.dueAt !== undefined ? { dueAt } : {}),
          ...(dto.locationText !== undefined
            ? { locationText: dto.locationText.trim() }
            : {}),
          version: { increment: 1 },
        },
      });
      await tx.workActivity.create({
        data: {
          workItemId,
          actorAccountId: actor.accountId,
          action: changedDueAt
            ? WorkActivityAction.DUE_DATE_CHANGED
            : WorkActivityAction.DETAILS_UPDATED,
          fromStatus: current.status,
          toStatus: current.status,
          details: {
            registeredAt: dto.registeredAt ?? undefined,
            plannedStartAt: dto.plannedStartAt ?? undefined,
            dueAt: dto.dueAt ?? undefined,
            locationText: dto.locationText ?? undefined,
          },
        },
      });
    });

    const workItem = await this.getById(user, workItemId);
    await this.workNotifications.publishWorkUpdate({
      workItem,
      action: 'DETAILS_UPDATED',
      actorAccountId: actor.accountId,
      recipientAccountIds: [actor.accountId],
      notificationRecipientAccountIds: [],
      title: 'Work details updated',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
    });
    return { message: 'Work details updated.', workItem };
  }

  async acknowledge(user: AuthenticatedUser, workItemId: string) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const current = await this.getMutableWork(actor, workItemId);
    let assignment = current.assignments.find(
      (item) =>
        item.assigneeAccountId === actor.accountId && item.endedAt === null,
    );

    if (!assignment && current.assignedOperationalTeamId) {
      const now = new Date();
      const member = await this.prisma.operationalTeamMember.findFirst({
        where: {
          teamId: current.assignedOperationalTeamId,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          employee: {
            account: { is: { id: actor.accountId, isEnabled: true } },
          },
        },
        select: { id: true },
      });
      if (!member) {
        throw new ForbiddenException(
          'Only a Main Team member can claim this Work when their membership is current.',
        );
      }
      const existingPrimary = current.assignments.find(
        (item) =>
          item.assignmentRole === WorkAssignmentRole.PRIMARY &&
          item.endedAt === null,
      );
      if (existingPrimary) {
        throw new ConflictException(
          'This shared Main Team Work has already been claimed by another team member.',
        );
      }
      assignment = await this.prisma.workAssignment.create({
        data: {
          workItemId,
          assigneeAccountId: actor.accountId,
          assignmentRole: WorkAssignmentRole.PRIMARY,
          assignedByAccountId: actor.accountId,
          acknowledgedAt: new Date(),
        },
        select: {
          id: true,
          assigneeAccountId: true,
          assignmentRole: true,
          acknowledgedAt: true,
          startedAt: true,
          endedAt: true,
        },
      });
    }
    if (!assignment)
      throw new ForbiddenException('This Work is not assigned to you.');

    const nextStatus = this.statusTransitions.getStatusAfterAcknowledgement(
      current.status,
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.workAssignment.update({
        where: { id: assignment.id },
        data: { acknowledgedAt: assignment.acknowledgedAt ?? new Date() },
      });
      if (nextStatus) {
        await tx.workItem.update({
          where: { id: workItemId },
          data: { status: nextStatus, version: { increment: 1 } },
        });
      }
      await tx.workActivity.create({
        data: {
          workItemId,
          actorAccountId: actor.accountId,
          action: WorkActivityAction.ACKNOWLEDGED,
          fromStatus: current.status,
          toStatus: nextStatus ?? current.status,
        },
      });
    });
    const workItem = await this.getById(user, workItemId);
    await this.workNotifications.publishWorkUpdate({
      workItem,
      action: 'ACKNOWLEDGED',
      actorAccountId: actor.accountId,
      recipientAccountIds: [actor.accountId],
      notificationRecipientAccountIds: [],
      title: 'Work acknowledged',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
    });
    return { message: 'Work acknowledged.', workItem };
  }

  async start(user: AuthenticatedUser, workItemId: string) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const current = await this.getMutableWork(actor, workItemId);

    if (current.assignedOperationalTeamId) {
      const now = new Date();
      const activeTeamMember =
        await this.prisma.operationalTeamMember.findFirst({
          where: {
            teamId: current.assignedOperationalTeamId,
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
            employee: {
              account: {
                is: { id: actor.accountId, isEnabled: true },
              },
            },
          },
          select: { id: true },
        });

      if (!activeTeamMember) {
        throw new ForbiddenException(
          'Only a current Main Team member can start this Work.',
        );
      }

      const actorPrimaryAssignment = current.assignments.find(
        (item) =>
          item.assigneeAccountId === actor.accountId &&
          item.assignmentRole === WorkAssignmentRole.PRIMARY &&
          item.endedAt === null,
      );
      const otherPrimaryAssignmentIds = current.assignments
        .filter(
          (item) =>
            item.assignmentRole === WorkAssignmentRole.PRIMARY &&
            item.endedAt === null &&
            item.assigneeAccountId !== actor.accountId,
        )
        .map((item) => item.id);
      const nextStatus =
        current.status === WorkItemStatus.ASSIGNED
          ? WorkItemStatus.IN_PROGRESS
          : this.statusTransitions.getStatusAfterStart(current.status);

      await this.prisma.$transaction(async (tx) => {
        if (otherPrimaryAssignmentIds.length > 0) {
          await tx.workAssignment.updateMany({
            where: { id: { in: otherPrimaryAssignmentIds } },
            data: {
              endedAt: now,
              endReason:
                'Shared Main Team Work started by another current team member.',
            },
          });
        }

        if (actorPrimaryAssignment) {
          await tx.workAssignment.update({
            where: { id: actorPrimaryAssignment.id },
            data: {
              acknowledgedAt: actorPrimaryAssignment.acknowledgedAt ?? now,
              startedAt: actorPrimaryAssignment.startedAt ?? now,
            },
          });
        } else {
          await tx.workAssignment.create({
            data: {
              workItemId,
              assigneeAccountId: actor.accountId,
              assignmentRole: WorkAssignmentRole.PRIMARY,
              assignedByAccountId: actor.accountId,
              acknowledgedAt: now,
              startedAt: now,
            },
          });
        }

        await tx.workItem.update({
          where: { id: workItemId },
          data: { status: nextStatus, version: { increment: 1 } },
        });
        await tx.workActivity.create({
          data: {
            workItemId,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.STARTED,
            fromStatus: current.status,
            toStatus: nextStatus,
            details: {
              sharedMainTeam: true,
              operationalTeamId: current.assignedOperationalTeamId,
              startedByAccountId: actor.accountId,
            },
          },
        });
      });

      const workItem = await this.getById(user, workItemId);
      await this.workNotifications.publishWorkUpdate({
        workItem,
        action: 'STARTED',
        actorAccountId: actor.accountId,
        recipientAccountIds: [actor.accountId],
        notificationRecipientAccountIds: [],
        title: 'Work started',
        body: `${workItem.ticketNumber}: ${workItem.title}`,
      });
      return { message: 'Work started.', workItem };
    }

    const assignment = current.assignments.find(
      (item) =>
        item.assigneeAccountId === actor.accountId &&
        item.assignmentRole === WorkAssignmentRole.PRIMARY &&
        item.endedAt === null,
    );
    if (!assignment)
      throw new ForbiddenException(
        'Only the active Main Assignee can start this Work.',
      );
    if (!assignment.acknowledgedAt)
      throw new ConflictException('Acknowledge the Work before starting it.');
    const nextStatus = this.statusTransitions.getStatusAfterStart(
      current.status,
    );
    await this.prisma.$transaction([
      this.prisma.workAssignment.update({
        where: { id: assignment.id },
        data: { startedAt: assignment.startedAt ?? new Date() },
      }),
      this.prisma.workItem.update({
        where: { id: workItemId },
        data: { status: nextStatus, version: { increment: 1 } },
      }),
      this.prisma.workActivity.create({
        data: {
          workItemId,
          actorAccountId: actor.accountId,
          action: WorkActivityAction.STARTED,
          fromStatus: current.status,
          toStatus: nextStatus,
        },
      }),
    ]);
    const workItem = await this.getById(user, workItemId);
    await this.workNotifications.publishWorkUpdate({
      workItem,
      action: 'STARTED',
      actorAccountId: actor.accountId,
      recipientAccountIds: [actor.accountId],
      notificationRecipientAccountIds: [],
      title: 'Work started',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
    });
    return { message: 'Work started.', workItem };
  }

  buildVisibleWhere(actor: WorkActorContext): Prisma.WorkItemWhereInput {
    if (actor.accountClass === AccountClass.SUPER_ADMIN) {
      return {};
    }
    const visibleOrgUnitIds = actor.visibleOrgUnitIds ?? [];
    const teamIds = [
      ...new Set([
        ...(actor.operationalTeamLeadIds ?? []),
        ...(actor.operationalTeamMemberIds ?? []),
      ]),
    ];
    return {
      AND: [
        { officeId: actor.officeId ?? '__no_office__' },
        {
          OR: [
            { createdByAccountId: actor.accountId },
            { responsibleReviewerAccountId: actor.accountId },
            { salesMemberAccountId: actor.accountId },
            {
              assignments: {
                some: { assigneeAccountId: actor.accountId, endedAt: null },
              },
            },
            ...(visibleOrgUnitIds.length
              ? [{ primaryOwnerOrgUnitId: { in: visibleOrgUnitIds } }]
              : []),
            ...(teamIds.length
              ? [{ assignedOperationalTeamId: { in: teamIds } }]
              : []),
          ],
        },
      ],
    };
  }

  private async getMutableWork(actor: WorkActorContext, workItemId: string) {
    const current = await this.prisma.workItem.findFirst({
      where: { AND: [{ id: workItemId }, this.buildVisibleWhere(actor)] },
      select: {
        id: true,
        status: true,
        assignedOperationalTeamId: true,
        responsibleReviewerAccountId: true,
        version: true,
        assignments: {
          where: { endedAt: null },
          select: {
            id: true,
            assigneeAccountId: true,
            assignmentRole: true,
            acknowledgedAt: true,
            startedAt: true,
            endedAt: true,
          },
        },
      },
    });
    if (!current) throw new NotFoundException('Work item was not found.');
    if (
      current.status === WorkItemStatus.CLOSED ||
      current.status === WorkItemStatus.CANCELLED
    ) {
      throw new ConflictException('This Work is closed and read-only.');
    }
    return current;
  }

  private assertActorOffice(actor: WorkActorContext, officeId: string): void {
    if (actor.accountClass === AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The Super Admin has read-only operational Work access.',
      );
    }
    if (!actor.officeId || actor.officeId !== officeId) {
      throw new ForbiddenException(
        'The requested Office is outside your active Work scope.',
      );
    }
  }

  private async resolveOfficeAccount(officeId: string, accountId: string) {
    const now = new Date();
    const account = await this.prisma.account.findFirst({
      where: {
        id: accountId,
        isEnabled: true,
        accountClass: AccountClass.OFFICE_USER,
        employee: {
          is: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            orgMemberships: {
              some: {
                officeId,
                membershipType: OrgMembershipType.PRIMARY,
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
              },
            },
          },
        },
      },
      select: accountSummarySelect,
    });
    if (!account)
      throw new BadRequestException('The selected Office user is not active.');
    return account;
  }

  private async resolveReviewer(
    officeId: string,
    orgUnitId: string,
    requestedAccountId: string | undefined,
    creatorAccountId: string,
  ) {
    // Preserve the finalized classic accountability rule in V3: the Head who
    // creates the Work is the Responsible Reviewer unless they explicitly
    // delegate review to another eligible hierarchy Head. Create authority has
    // already been verified for the actor before this method is reached.
    if (!requestedAccountId || requestedAccountId === creatorAccountId) {
      return { id: creatorAccountId };
    }

    const candidates = await this.listReviewerCandidates(
      officeId,
      orgUnitId,
      new Date(),
    );
    const reviewer = candidates.find(
      (candidate) => candidate.accountId === requestedAccountId,
    );
    if (!reviewer) {
      throw new BadRequestException(
        'Choose an authorized Responsible Reviewer for this Work.',
      );
    }
    return { id: reviewer.accountId };
  }

  private async listReviewerCandidates(
    officeId: string,
    orgUnitId: string,
    now: Date,
  ) {
    const ancestors = await this.prisma.orgUnitClosure.findMany({
      where: { descendantOrgUnitId: orgUnitId },
      select: { ancestorOrgUnitId: true },
    });
    const scopeIds = [
      ...new Set([
        orgUnitId,
        ...ancestors.map((item) => item.ancestorOrgUnitId),
      ]),
    ];
    const assignments = await this.prisma.orgLeadershipAssignment.findMany({
      where: {
        officeId,
        leadershipType: {
          in: [OrgLeadershipType.OFFICE_HEAD, OrgLeadershipType.ORG_UNIT_HEAD],
        },
        effectiveFrom: { lte: now },
        AND: [
          { OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }] },
          {
            OR: [
              { leadershipType: OrgLeadershipType.OFFICE_HEAD },
              { orgUnitId: { in: scopeIds } },
            ],
          },
        ],
      },
      orderBy: [{ leadershipType: 'asc' }, { effectiveFrom: 'desc' }],
      select: {
        leadershipType: true,
        isActing: true,
        orgUnit: { select: { id: true, code: true, name: true } },
        office: { select: { name: true } },
        employee: {
          select: {
            account: { select: accountSummarySelect },
          },
        },
      },
    });
    const byAccount = new Map<
      string,
      {
        accountId: string;
        employeeId: string;
        employeeCode: string;
        employeeName: string;
        leadershipType: OrgLeadershipType;
        isActing: boolean;
        scopeName: string;
        orgUnit: { id: string; code: string; name: string } | null;
      }
    >();
    for (const assignment of assignments) {
      const account = assignment.employee.account;
      if (!account?.employee) continue;
      byAccount.set(account.id, {
        accountId: account.id,
        employeeId: account.employee.id,
        employeeCode: account.employee.empId,
        employeeName: account.employee.empName,
        leadershipType: assignment.leadershipType,
        isActing: assignment.isActing,
        scopeName: assignment.orgUnit?.name ?? assignment.office.name,
        orgUnit: assignment.orgUnit ?? null,
      });
    }
    return [...byAccount.values()];
  }

  private serializeCandidate(account: AccountSummary) {
    const membership = account.employee?.orgMemberships?.[0];
    return {
      accountId: account.id,
      employeeId: account.employee?.id ?? null,
      employeeCode: account.employee?.empId ?? '',
      employeeName: account.employee?.empName ?? account.username,
      designation: account.employee?.designation ?? null,
      orgUnit: membership?.orgUnit ?? null,
    };
  }

  private fingerprint(dto: CreateWorkItemDto): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          ...dto,
          supportMemberAccountIds: [
            ...(dto.supportMemberAccountIds ?? []),
          ].sort(),
          fields: [...dto.fields].sort((a, b) => a.code.localeCompare(b.code)),
        }),
      )
      .digest('hex');
  }
}
