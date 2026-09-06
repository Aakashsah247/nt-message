import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import {
  AccountRole,
  EmployeeStatus,
  EmploymentStatus,
  OrgLeadershipType,
  OrgMembershipType,
  WorkEventType,
  WorkFieldType,
  WorkItemStatus,
  WorkParticipantRole,
  WorkRuntimeStatus,
  WorkSlaBasis,
  WorkStageActivationMode,
  WorkStageResponsibleOrgUnitRule,
  WorkStageStatus,
  WorkTypeCreatorCategory,
  WorkTypeCreatorScope,
  WorkTypeVersionStatus,
} from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import type { CreateWorkRuntimeV3Dto } from './dto/create-work-runtime-v3.dto';
import {
  normalizeReferenceValue,
  validateRuntimeIntakeFields,
  type NormalizedRuntimeFieldValue,
} from './work-runtime-v3-field-validator';

const WORK_TYPE_RUNTIME_SELECT = {
  id: true,
  version: true,
  status: true,
  name: true,
  primaryOwnerOrgUnitId: true,
  creatorCategories: true,
  creatorScope: true,
  finalClosureMode: true,
  slaBasis: true,
  overallSlaMinutes: true,
  workTypeDefinition: {
    select: {
      id: true,
      officeId: true,
      code: true,
      isActive: true,
    },
  },
  primaryOwnerOrgUnit: {
    select: {
      id: true,
      officeId: true,
      code: true,
      name: true,
      isActive: true,
    },
  },
  creatorOrgUnits: {
    select: {
      orgUnitId: true,
      includeDescendants: true,
    },
  },
  creatorAccounts: {
    select: {
      accountId: true,
    },
  },
  fields: {
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      fieldType: true,
      isRequired: true,
      stageDefinitionId: true,
      config: true,
    },
  },
  stages: {
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      sortOrder: true,
      isRequired: true,
      responsibleOrgUnitRule: true,
      responsibleOrgUnitId: true,
      assignmentMode: true,
      approvalMode: true,
      approvalLeadershipType: true,
      activationMode: true,
      activationFieldDefinitionId: true,
      activationExpectedValue: true,
      slaMinutes: true,
      responsibleOrgUnit: {
        select: {
          id: true,
          officeId: true,
          isActive: true,
        },
      },
    },
  },
  stageDependencies: {
    select: {
      stageDefinitionId: true,
      prerequisiteStageId: true,
    },
  },
} satisfies Prisma.WorkTypeVersionSelect;

const CREATED_WORK_SELECT = {
  id: true,
  ticketNumber: true,
  title: true,
  description: true,
  officeId: true,
  workTypeVersionId: true,
  primaryOwnerOrgUnitId: true,
  runtimeStatus: true,
  openedAt: true,
  plannedStartAt: true,
  dueAt: true,
  version: true,
  createdByAccountId: true,
  createdAt: true,
  updatedAt: true,
  workTypeVersion: {
    select: {
      id: true,
      version: true,
      name: true,
      workTypeDefinition: {
        select: {
          id: true,
          code: true,
        },
      },
    },
  },
  primaryOwnerOrgUnit: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  orgUnitParticipants: {
    where: { endedAt: null },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      orgUnitId: true,
      role: true,
      startedAt: true,
    },
  },
  runtimeStages: {
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      stageDefinitionId: true,
      responsibleOrgUnitId: true,
      code: true,
      name: true,
      sortOrder: true,
      isRequired: true,
      assignmentMode: true,
      approvalMode: true,
      activationMode: true,
      status: true,
      version: true,
      dueAt: true,
      readyAt: true,
    },
  },
  fieldValues: {
    where: { workStageId: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      fieldDefinitionId: true,
      value: true,
      version: true,
      fieldDefinition: {
        select: {
          code: true,
          label: true,
          fieldType: true,
        },
      },
    },
  },
  references: {
    orderBy: [{ referenceType: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      referenceType: true,
      value: true,
      normalizedValue: true,
      sourceFieldDefinitionId: true,
    },
  },
  events: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      workStageId: true,
      actorAccountId: true,
      eventType: true,
      fromWorkStatus: true,
      toWorkStatus: true,
      fromStageStatus: true,
      toStageStatus: true,
      details: true,
      createdAt: true,
    },
  },
} satisfies Prisma.WorkItemSelect;

type RuntimeVersion = Prisma.WorkTypeVersionGetPayload<{
  select: typeof WORK_TYPE_RUNTIME_SELECT;
}>;

type InitialStagePlan = {
  definition: RuntimeVersion['stages'][number];
  responsibleOrgUnitId: string;
  status: WorkStageStatus;
  readyAt: Date | null;
  dueAt: Date | null;
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

@Injectable()
export class WorkRuntimeV3Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
  ) {}

  async create(
    user: AuthenticatedUser,
    officeId: string,
    dto: CreateWorkRuntimeV3Dto,
  ) {
    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_CREATE,
      officeId,
      null,
    );

    const fingerprint = this.createRequestFingerprint(officeId, dto);

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${user.accountId}:${dto.clientRequestId}`}, 0)
        )
      `;

      const existing = await tx.workItem.findFirst({
        where: {
          createdByAccountId: user.accountId,
          creationRequestId: dto.clientRequestId,
        },
        select: {
          id: true,
          creationRequestFingerprint: true,
        },
      });

      if (existing) {
        if (existing.creationRequestFingerprint !== fingerprint) {
          throw new ConflictException(
            'This creation request ID was already used with different Work data.',
          );
        }
        return this.getCreatedWork(tx, existing.id);
      }

      const office = await tx.office.findUnique({
        where: { id: officeId },
        select: { id: true, code: true, name: true, isActive: true },
      });
      if (!office || !office.isActive) {
        throw new NotFoundException('An active Office was not found.');
      }

      const now = new Date();
      const version = await tx.workTypeVersion.findFirst({
        where: {
          id: dto.workTypeVersionId,
          workTypeDefinition: { officeId },
        },
        select: WORK_TYPE_RUNTIME_SELECT,
      });

      if (!version) {
        throw new NotFoundException('Work Type Version was not found in this Office.');
      }
      if (
        version.status !== WorkTypeVersionStatus.PUBLISHED ||
        !version.workTypeDefinition.isActive
      ) {
        throw new BadRequestException(
          'Only an active published Work Type Version can create new Work.',
        );
      }
      if (
        !version.primaryOwnerOrgUnitId ||
        !version.primaryOwnerOrgUnit ||
        !version.primaryOwnerOrgUnit.isActive ||
        version.primaryOwnerOrgUnit.officeId !== officeId
      ) {
        throw new ConflictException(
          'The published Work Type does not have an active Primary Owner in this Office.',
        );
      }

      const actorContext = await this.getActorContext(tx, user.accountId, officeId, now);
      await this.assertCreatorPolicy(tx, version, actorContext);

      const validatedFields = validateRuntimeIntakeFields(version.fields, dto.fields);
      await this.assertIdentityFieldValues(
        tx,
        officeId,
        now,
        validatedFields.identityValues,
      );

      const plannedStartAt = dto.plannedStartAt
        ? this.parseDate(dto.plannedStartAt, 'Planned start')
        : null;
      const dueAt = this.resolveOverallDueAt(version, dto, now);
      if (plannedStartAt && plannedStartAt.getTime() >= dueAt.getTime()) {
        throw new BadRequestException('Due time must be later than the planned start time.');
      }

      const stagePlans = await this.buildInitialStagePlans(
        tx,
        version,
        officeId,
        validatedFields.valuesByCode,
        now,
      );
      const runtimeStatus = stagePlans.some(
        (stage) => stage.status === WorkStageStatus.READY,
      )
        ? WorkRuntimeStatus.OPEN
        : WorkRuntimeStatus.WAITING;

      const participantRoles = this.buildParticipantRoles(
        version.primaryOwnerOrgUnitId,
        stagePlans,
      );
      const ticketNumber = await this.createTicketNumber(
        tx,
        office.code,
        version.primaryOwnerOrgUnit.code,
        now.getUTCFullYear(),
      );

      const work = await tx.workItem.create({
        data: {
          ticketNumber,
          type: null,
          title: dto.title.trim(),
          description: dto.description?.trim() ?? '',
          category: null,
          status: WorkItemStatus.V3_RUNTIME,
          officeId,
          workTypeVersionId: version.id,
          primaryOwnerOrgUnitId: version.primaryOwnerOrgUnitId,
          runtimeStatus,
          openedAt: now,
          creationRequestId: dto.clientRequestId,
          creationRequestFingerprint: fingerprint,
          divisionId: null,
          departmentId: null,
          parentWorkItemId: null,
          assignedTeamId: null,
          salesMemberAccountId: null,
          salesCoordinationStatus: null,
          registeredAt: null,
          plannedStartAt,
          dueAt,
          createdByAccountId: user.accountId,
          responsibleManagerAccountId: null,
          orgUnitParticipants: {
            create: [...participantRoles.entries()].map(([orgUnitId, role]) => ({
              orgUnitId,
              role,
              addedByAccountId: user.accountId,
              startedAt: now,
            })),
          },
          fieldValues: {
            create: validatedFields.values.map((field) => ({
              fieldDefinitionId: field.fieldDefinitionId,
              workStageId: null,
              value: field.value,
              updatedByAccountId: user.accountId,
            })),
          },
          references: {
            create: this.buildReferences(validatedFields.values, user.accountId),
          },
        },
        select: { id: true },
      });

      if (stagePlans.length > 0) {
        await tx.workStage.createMany({
          data: stagePlans.map((stage) => ({
            workItemId: work.id,
            stageDefinitionId: stage.definition.id,
            responsibleOrgUnitId: stage.responsibleOrgUnitId,
            code: stage.definition.code,
            name: stage.definition.name,
            sortOrder: stage.definition.sortOrder,
            isRequired: stage.definition.isRequired,
            assignmentMode: stage.definition.assignmentMode,
            approvalMode: stage.definition.approvalMode,
            approvalLeadershipType: stage.definition.approvalLeadershipType,
            activationMode: stage.definition.activationMode,
            activationFieldCode:
              version.fields.find(
                (field) => field.id === stage.definition.activationFieldDefinitionId,
              )?.code ?? null,
            activationExpectedValue: stage.definition.activationExpectedValue ?? undefined,
            slaMinutes: stage.definition.slaMinutes,
            status: stage.status,
            readyAt: stage.readyAt,
            dueAt: stage.dueAt,
          })),
        });
      }

      const runtimeStages = await tx.workStage.findMany({
        where: { workItemId: work.id },
        select: { id: true, code: true, status: true },
      });
      const stageByCode = new Map(runtimeStages.map((stage) => [stage.code, stage]));

      await tx.workEvent.create({
        data: {
          workItemId: work.id,
          actorAccountId: user.accountId,
          eventType: WorkEventType.WORK_CREATED,
          toWorkStatus: runtimeStatus,
          details: {
            workTypeVersionId: version.id,
            workTypeCode: version.workTypeDefinition.code,
            workTypeVersion: version.version,
            primaryOwnerOrgUnitId: version.primaryOwnerOrgUnitId,
            creationRequestId: dto.clientRequestId,
          },
        },
      });

      const stageEvents: Prisma.WorkEventCreateManyInput[] = [];
      for (const plan of stagePlans) {
        const runtimeStage = stageByCode.get(plan.definition.code);
        if (!runtimeStage) continue;
        if (plan.status === WorkStageStatus.READY) {
          stageEvents.push({
            workItemId: work.id,
            workStageId: runtimeStage.id,
            actorAccountId: user.accountId,
            eventType: WorkEventType.STAGE_READY,
            fromStageStatus: WorkStageStatus.PENDING,
            toStageStatus: WorkStageStatus.READY,
            details: { reason: 'INITIAL_DEPENDENCIES_SATISFIED' },
          });
          continue;
        }
        if (plan.status === WorkStageStatus.SKIPPED) {
          stageEvents.push({
            workItemId: work.id,
            workStageId: runtimeStage.id,
            actorAccountId: user.accountId,
            eventType: WorkEventType.STAGE_SKIPPED,
            fromStageStatus: WorkStageStatus.PENDING,
            toStageStatus: WorkStageStatus.SKIPPED,
            details: { reason: 'INITIAL_ACTIVATION_CONDITION_FALSE' },
          });
        }
      }

      if (stageEvents.length > 0) {
        await tx.workEvent.createMany({ data: stageEvents });
      }

      return this.getCreatedWork(tx, work.id);
    });
  }

  private async getCreatedWork(tx: Prisma.TransactionClient, workItemId: string) {
    const work = await tx.workItem.findUnique({
      where: { id: workItemId },
      select: CREATED_WORK_SELECT,
    });
    if (!work || !work.officeId || !work.workTypeVersionId || !work.runtimeStatus) {
      throw new ConflictException('The V3 Work runtime record is incomplete.');
    }
    return work;
  }

  private async getActorContext(
    tx: Prisma.TransactionClient,
    accountId: string,
    officeId: string,
    at: Date,
  ) {
    const account = await tx.account.findUnique({
      where: { id: accountId },
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
                startsAt: { lte: at },
                OR: [{ endsAt: null }, { endsAt: { gt: at } }],
              },
              select: { orgUnitId: true },
              take: 2,
            },
            orgLeadershipAssignments: {
              where: {
                officeId,
                effectiveFrom: { lte: at },
                OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
              },
              select: { leadershipType: true, orgUnitId: true },
            },
          },
        },
      },
    });

    if (
      !account ||
      !account.isEnabled ||
      account.role === AccountRole.SUPER_ADMIN ||
      !account.employee ||
      account.employee.status !== EmployeeStatus.ACTIVE ||
      account.employee.employmentStatus !== EmploymentStatus.ACTIVE ||
      account.employee.archivedAt !== null
    ) {
      throw new ForbiddenException('Only an active Office member can create operational Work.');
    }

    if (account.employee.orgMemberships.length !== 1) {
      throw new ConflictException(
        'Work creation requires exactly one active primary Office membership.',
      );
    }
    const primaryOrgUnitId = account.employee.orgMemberships[0]?.orgUnitId;
    if (!primaryOrgUnitId) {
      throw new ConflictException(
        'Work creation requires a primary OrgUnit placement in this Office.',
      );
    }

    return {
      accountId: account.id,
      primaryOrgUnitId,
      leadership: account.employee.orgLeadershipAssignments,
    };
  }

  private async assertCreatorPolicy(
    tx: Prisma.TransactionClient,
    version: RuntimeVersion,
    actor: Awaited<ReturnType<WorkRuntimeV3Service['getActorContext']>>,
  ): Promise<void> {
    if (version.creatorAccounts.some((item) => item.accountId === actor.accountId)) {
      return;
    }

    const candidateOrgUnits: string[] = [];
    const categorySet = new Set(version.creatorCategories);
    let isOfficeHead = false;

    if (categorySet.has(WorkTypeCreatorCategory.EMPLOYEE)) {
      candidateOrgUnits.push(actor.primaryOrgUnitId);
    }

    for (const assignment of actor.leadership) {
      if (
        assignment.leadershipType === OrgLeadershipType.OFFICE_HEAD &&
        categorySet.has(WorkTypeCreatorCategory.OFFICE_HEAD)
      ) {
        isOfficeHead = true;
      }
      if (
        assignment.leadershipType === OrgLeadershipType.ORG_UNIT_HEAD &&
        categorySet.has(WorkTypeCreatorCategory.ORG_UNIT_HEAD) &&
        assignment.orgUnitId
      ) {
        candidateOrgUnits.push(assignment.orgUnitId);
      }
      if (
        assignment.leadershipType === OrgLeadershipType.TEAM_LEAD &&
        categorySet.has(WorkTypeCreatorCategory.TEAM_LEAD) &&
        assignment.orgUnitId
      ) {
        candidateOrgUnits.push(assignment.orgUnitId);
      }
    }

    if (isOfficeHead) return;
    if (candidateOrgUnits.length === 0) {
      throw new ForbiddenException('This Work Type does not allow your creator category.');
    }

    if (version.creatorScope === WorkTypeCreatorScope.OFFICE_WIDE) {
      return;
    }

    if (version.creatorScope === WorkTypeCreatorScope.PRIMARY_OWNER_SUBTREE) {
      if (
        await this.anyOrgUnitInsideScope(
          tx,
          version.primaryOwnerOrgUnitId!,
          candidateOrgUnits,
        )
      ) {
        return;
      }
      throw new ForbiddenException(
        'This Work Type can only be created inside the Primary Owner organizational scope.',
      );
    }

    for (const rule of version.creatorOrgUnits) {
      if (rule.includeDescendants) {
        if (await this.anyOrgUnitInsideScope(tx, rule.orgUnitId, candidateOrgUnits)) {
          return;
        }
      } else if (candidateOrgUnits.includes(rule.orgUnitId)) {
        return;
      }
    }

    throw new ForbiddenException('This Work Type does not allow creation from your OrgUnit scope.');
  }

  private async anyOrgUnitInsideScope(
    tx: Prisma.TransactionClient,
    ancestorOrgUnitId: string,
    candidateOrgUnitIds: string[],
  ): Promise<boolean> {
    if (candidateOrgUnitIds.includes(ancestorOrgUnitId)) return true;
    const count = await tx.orgUnitClosure.count({
      where: {
        ancestorOrgUnitId,
        descendantOrgUnitId: { in: [...new Set(candidateOrgUnitIds)] },
      },
    });
    return count > 0;
  }

  private async assertIdentityFieldValues(
    tx: Prisma.TransactionClient,
    officeId: string,
    at: Date,
    identityValues: ReturnType<typeof validateRuntimeIntakeFields>['identityValues'],
  ): Promise<void> {
    const orgUnitIds = [
      ...new Set(
        identityValues
          .filter((item) => item.fieldType === WorkFieldType.ORG_UNIT)
          .map((item) => item.id),
      ),
    ];
    if (orgUnitIds.length > 0) {
      const count = await tx.orgUnit.count({
        where: { id: { in: orgUnitIds }, officeId, isActive: true },
      });
      if (count !== orgUnitIds.length) {
        throw new BadRequestException(
          'One or more OrgUnit field values are not active in this Office.',
        );
      }
    }

    const accountIds = [
      ...new Set(
        identityValues
          .filter((item) => item.fieldType === WorkFieldType.USER)
          .map((item) => item.id),
      ),
    ];
    if (accountIds.length > 0) {
      const count = await tx.account.count({
        where: {
          id: { in: accountIds },
          isEnabled: true,
          role: { not: AccountRole.SUPER_ADMIN },
          employee: {
            is: {
              status: EmployeeStatus.ACTIVE,
              employmentStatus: EmploymentStatus.ACTIVE,
              archivedAt: null,
              orgMemberships: {
                some: {
                  officeId,
                  membershipType: OrgMembershipType.PRIMARY,
                  startsAt: { lte: at },
                  OR: [{ endsAt: null }, { endsAt: { gt: at } }],
                },
              },
            },
          },
        },
      });
      if (count !== accountIds.length) {
        throw new BadRequestException(
          'One or more user field values are not active members of this Office.',
        );
      }
    }
  }

  private resolveOverallDueAt(
    version: RuntimeVersion,
    dto: CreateWorkRuntimeV3Dto,
    now: Date,
  ): Date {
    if (version.slaBasis === WorkSlaBasis.OFFICE_WORKING_DURATION) {
      throw new ConflictException(
        'Office-working-duration SLA cannot run until the Office calendar engine is enabled.',
      );
    }

    const dueAt = version.overallSlaMinutes
      ? new Date(now.getTime() + version.overallSlaMinutes * 60_000)
      : dto.dueAt
        ? this.parseDate(dto.dueAt, 'Due time')
        : null;

    if (!dueAt) {
      throw new BadRequestException(
        'Due time is required when the Work Type does not define an overall SLA.',
      );
    }
    if (dueAt.getTime() <= now.getTime()) {
      throw new BadRequestException('Due time must be in the future.');
    }
    return dueAt;
  }

  private async buildInitialStagePlans(
    tx: Prisma.TransactionClient,
    version: RuntimeVersion,
    officeId: string,
    valuesByCode: Map<string, string | number | boolean | (string | number | boolean)[]>,
    now: Date,
  ): Promise<InitialStagePlan[]> {
    if (version.stages.length === 0) {
      throw new ConflictException('The published Work Type has no runtime stages.');
    }

    const activationFieldById = new Map(
      version.fields.map((field) => [field.id, field]),
    );
    const prerequisiteIds = new Map<string, string[]>();
    for (const dependency of version.stageDependencies) {
      const list = prerequisiteIds.get(dependency.stageDefinitionId) ?? [];
      list.push(dependency.prerequisiteStageId);
      prerequisiteIds.set(dependency.stageDefinitionId, list);
    }

    const resolvedOrgUnitIds = new Map<string, string>();
    for (const stage of version.stages) {
      if (
        stage.responsibleOrgUnitRule ===
        WorkStageResponsibleOrgUnitRule.RUNTIME_REQUESTED_PARTICIPANT
      ) {
        throw new BadRequestException(
          `Stage ${stage.code} requires runtime-requested participation, which belongs to the cross-OrgUnit collaboration milestone.`,
        );
      }
      const responsibleOrgUnitId =
        stage.responsibleOrgUnitRule === WorkStageResponsibleOrgUnitRule.PRIMARY_OWNER
          ? version.primaryOwnerOrgUnitId!
          : stage.responsibleOrgUnitId;
      if (!responsibleOrgUnitId) {
        throw new ConflictException(`Stage ${stage.code} has no responsible OrgUnit.`);
      }
      resolvedOrgUnitIds.set(stage.id, responsibleOrgUnitId);
    }

    const specificIds = [
      ...new Set(
        [...resolvedOrgUnitIds.values()].filter(
          (id) => id !== version.primaryOwnerOrgUnitId,
        ),
      ),
    ];
    if (specificIds.length > 0) {
      const count = await tx.orgUnit.count({
        where: { id: { in: specificIds }, officeId, isActive: true },
      });
      if (count !== specificIds.length) {
        throw new ConflictException(
          'A configured stage references an inactive or out-of-Office OrgUnit.',
        );
      }
    }

    type Activation = 'ACTIVE' | 'INACTIVE' | 'DEFERRED';
    const activationByStageId = new Map<string, Activation>();
    for (const stage of version.stages) {
      let activation: Activation = 'ACTIVE';
      if (stage.activationMode === WorkStageActivationMode.MANUAL_WHEN_REQUIRED) {
        activation = 'DEFERRED';
      } else if (
        stage.activationMode === WorkStageActivationMode.FIELD_TRUE ||
        stage.activationMode === WorkStageActivationMode.FIELD_EQUALS
      ) {
        const field = stage.activationFieldDefinitionId
          ? activationFieldById.get(stage.activationFieldDefinitionId)
          : null;
        if (!field) {
          throw new ConflictException(`Stage ${stage.code} has an invalid activation field.`);
        }
        if (!valuesByCode.has(field.code)) {
          activation = field.stageDefinitionId ? 'DEFERRED' : 'INACTIVE';
        } else {
          const value = valuesByCode.get(field.code);
          activation =
            stage.activationMode === WorkStageActivationMode.FIELD_TRUE
              ? value === true
                ? 'ACTIVE'
                : 'INACTIVE'
              : stableJson(value) === stableJson(stage.activationExpectedValue)
                ? 'ACTIVE'
                : 'INACTIVE';
        }
      }
      activationByStageId.set(stage.id, activation);
    }

    const statusByStageId = new Map<string, WorkStageStatus>();
    const resolving = new Set<string>();
    const stageById = new Map(version.stages.map((stage) => [stage.id, stage]));

    const resolveStatus = (stageId: string): WorkStageStatus => {
      const existing = statusByStageId.get(stageId);
      if (existing) return existing;
      if (resolving.has(stageId)) {
        throw new ConflictException('Published Work Type stage dependencies contain a cycle.');
      }
      const stage = stageById.get(stageId);
      if (!stage) throw new ConflictException('Published Work Type has an invalid dependency.');
      resolving.add(stageId);

      const activation = activationByStageId.get(stageId) ?? 'DEFERRED';
      let status: WorkStageStatus;
      if (activation === 'INACTIVE') {
        status = WorkStageStatus.SKIPPED;
      } else if (activation === 'DEFERRED') {
        status = WorkStageStatus.PENDING;
      } else {
        const prerequisites = prerequisiteIds.get(stageId) ?? [];
        const allSatisfied = prerequisites.every(
          (prerequisiteId) => resolveStatus(prerequisiteId) === WorkStageStatus.SKIPPED,
        );
        status = allSatisfied ? WorkStageStatus.READY : WorkStageStatus.PENDING;
      }

      resolving.delete(stageId);
      statusByStageId.set(stageId, status);
      return status;
    };

    return version.stages.map((stage) => {
      const status = resolveStatus(stage.id);
      const readyAt = status === WorkStageStatus.READY ? now : null;
      const dueAt =
        readyAt && stage.slaMinutes
          ? new Date(readyAt.getTime() + stage.slaMinutes * 60_000)
          : null;
      return {
        definition: stage,
        responsibleOrgUnitId: resolvedOrgUnitIds.get(stage.id)!,
        status,
        readyAt,
        dueAt,
      };
    });
  }

  private buildParticipantRoles(
    primaryOwnerOrgUnitId: string,
    stages: InitialStagePlan[],
  ): Map<string, WorkParticipantRole> {
    const roles = new Map<string, WorkParticipantRole>([
      [primaryOwnerOrgUnitId, WorkParticipantRole.PRIMARY_OWNER],
    ]);

    for (const stage of stages) {
      if (stage.responsibleOrgUnitId === primaryOwnerOrgUnitId) continue;
      const nextRole = stage.definition.isRequired
        ? WorkParticipantRole.REQUIRED_PARTICIPANT
        : WorkParticipantRole.CONDITIONAL_PARTICIPANT;
      const currentRole = roles.get(stage.responsibleOrgUnitId);
      if (
        currentRole !== WorkParticipantRole.REQUIRED_PARTICIPANT ||
        nextRole === WorkParticipantRole.REQUIRED_PARTICIPANT
      ) {
        roles.set(stage.responsibleOrgUnitId, nextRole);
      }
    }
    return roles;
  }

  private buildReferences(
    fields: NormalizedRuntimeFieldValue[],
    actorAccountId: string,
  ) {
    return fields.flatMap((field) => {
      if (field.fieldType !== WorkFieldType.REFERENCE || typeof field.value !== 'string') {
        return [];
      }
      return [
        {
          referenceType: field.code,
          value: field.value,
          normalizedValue: normalizeReferenceValue(field.value),
          sourceFieldDefinitionId: field.fieldDefinitionId,
          createdByAccountId: actorAccountId,
        },
      ];
    });
  }

  private async createTicketNumber(
    tx: Prisma.TransactionClient,
    officeCode: string,
    ownerCode: string,
    year: number,
  ): Promise<string> {
    const rows = await tx.$queryRaw<Array<{ nextValue: bigint | number | string }>>`
      SELECT nextval('work_ticket_sequence') AS "nextValue"
    `;
    const nextValue = rows[0]?.nextValue;
    if (nextValue === undefined) {
      throw new ConflictException('Unable to generate a Work ticket number.');
    }
    const clean = (value: string, fallback: string) =>
      value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || fallback;
    return `NT-${clean(officeCode, 'OFFICE')}-${clean(ownerCode, 'UNIT')}-${year}-${String(
      nextValue,
    ).padStart(6, '0')}`;
  }

  private createRequestFingerprint(
    officeId: string,
    dto: CreateWorkRuntimeV3Dto,
  ): string {
    const normalized = {
      officeId,
      workTypeVersionId: dto.workTypeVersionId,
      title: dto.title.trim(),
      description: dto.description?.trim() ?? '',
      plannedStartAt: dto.plannedStartAt ?? null,
      dueAt: dto.dueAt ?? null,
      fields: [...dto.fields]
        .map((field) => ({
          code: field.code,
          value: this.normalizeFingerprintValue(field.value),
        }))
        .sort((left, right) => left.code.localeCompare(right.code)),
    };
    return createHash('sha256').update(stableJson(normalized)).digest('hex');
  }

  private normalizeFingerprintValue(value: unknown): unknown {
    if (typeof value === 'string') {
      return value.trim();
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.normalizeFingerprintValue(item));
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, this.normalizeFingerprintValue(item)]),
      );
    }
    return value;
  }

  private parseDate(value: string, label: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${label} is invalid.`);
    }
    return parsed;
  }
}
