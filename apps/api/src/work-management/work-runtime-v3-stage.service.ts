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
  WorkEventType,
  WorkRuntimeStatus,
  WorkStageAssignmentMode,
  WorkStageAssignmentRole,
  WorkStageAssignmentTargetType,
  WorkStageStatus,
} from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import type {
  AssignWorkRuntimeV3StageDto,
  BlockWorkRuntimeV3StageDto,
  SubmitWorkRuntimeV3StageDto,
  WorkRuntimeV3StageMutationDto,
} from './dto/work-runtime-v3-stage.dto';
import {
  assertRuntimeIdentityFieldValues,
  validateRuntimeStageFields,
} from './work-runtime-v3-field-validator';

const MUTABLE_STAGE_STATUSES = [
  WorkStageStatus.READY,
  WorkStageStatus.IN_PROGRESS,
  WorkStageStatus.BLOCKED,
] as const;

const QUEUE_STAGE_STATUSES = [
  WorkStageStatus.READY,
  WorkStageStatus.IN_PROGRESS,
  WorkStageStatus.BLOCKED,
] as const;

const STAGE_RUNTIME_SELECT = {
  id: true,
  workItemId: true,
  stageDefinitionId: true,
  responsibleOrgUnitId: true,
  code: true,
  name: true,
  sortOrder: true,
  isRequired: true,
  assignmentMode: true,
  approvalMode: true,
  approvalLeadershipType: true,
  status: true,
  version: true,
  blockedFromStatus: true,
  blockerReason: true,
  dueAt: true,
  readyAt: true,
  startedAt: true,
  submittedAt: true,
  completedAt: true,
  blockedAt: true,
  workItem: {
    select: {
      id: true,
      officeId: true,
      ticketNumber: true,
      title: true,
      runtimeStatus: true,
      version: true,
      createdByAccountId: true,
      workTypeVersionId: true,
    },
  },
  responsibleOrgUnit: {
    select: {
      id: true,
      code: true,
      name: true,
      officeId: true,
      isActive: true,
    },
  },
  stageDefinition: {
    select: {
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
    },
  },
  assignments: {
    where: {
      endsAt: null,
      assignmentRole: WorkStageAssignmentRole.PRIMARY,
    },
    orderBy: { startsAt: 'desc' },
    take: 1,
    select: {
      id: true,
      targetType: true,
      targetOrgUnitId: true,
      targetAccountId: true,
      assignmentRole: true,
      assignmentReason: true,
      startsAt: true,
      targetOrgUnit: {
        select: {
          id: true,
          code: true,
          name: true,
        },
      },
      targetAccount: {
        select: {
          id: true,
          employee: {
            select: {
              empId: true,
              empName: true,
            },
          },
        },
      },
    },
  },
  submissions: {
    orderBy: { submissionNumber: 'desc' },
    take: 1,
    select: {
      id: true,
      submissionNumber: true,
      submittedByAccountId: true,
      stageVersion: true,
      note: true,
      createdAt: true,
    },
  },
} satisfies Prisma.WorkStageSelect;

type RuntimeStage = Prisma.WorkStageGetPayload<{
  select: typeof STAGE_RUNTIME_SELECT;
}>;

type PrimaryAssignment = RuntimeStage['assignments'][number];

type AssignmentTarget = {
  targetType: WorkStageAssignmentTargetType;
  targetOrgUnitId: string | null;
  targetAccountId: string | null;
};

@Injectable()
export class WorkRuntimeV3StageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
  ) {}

  async assign(
    user: AuthenticatedUser,
    officeId: string,
    stageId: string,
    dto: AssignWorkRuntimeV3StageDto,
  ) {
    await this.assertCanAssign(user, officeId, stageId);

    await this.prisma.$transaction(async (tx) => {
      const stage = await this.requireStage(tx, officeId, stageId);
      this.assertWorkOperational(stage);
      this.assertExpectedVersion(stage, dto.expectedStageVersion);

      if (!MUTABLE_STAGE_STATUSES.includes(stage.status as (typeof MUTABLE_STAGE_STATUSES)[number])) {
        throw new ConflictException(
          `Stage ${stage.code} cannot be assigned while it is ${stage.status}.`,
        );
      }

      await this.lockWork(tx, stage.workItemId);
      const target = await this.resolveAssignmentTarget(tx, stage, dto, new Date());
      const current = stage.assignments[0] ?? null;

      if (current && this.sameAssignment(current, target)) {
        throw new ConflictException('This stage already has the requested active assignment.');
      }

      const reason = dto.reason?.trim() || null;
      if (current && (!reason || reason.length < 2)) {
        throw new BadRequestException('A reassignment reason is required.');
      }

      await this.claimStageVersion(tx, stage, dto.expectedStageVersion, {});
      const now = new Date();

      if (current) {
        await tx.workStageAssignment.update({
          where: { id: current.id },
          data: {
            endsAt: now,
            endedByAccountId: user.accountId,
            endReason: reason,
          },
        });
      }

      const assignment = await tx.workStageAssignment.create({
        data: {
          workStageId: stage.id,
          targetType: target.targetType,
          targetOrgUnitId: target.targetOrgUnitId,
          targetAccountId: target.targetAccountId,
          assignmentRole: WorkStageAssignmentRole.PRIMARY,
          assignedByAccountId: user.accountId,
          assignmentReason: reason,
          startsAt: now,
        },
        select: { id: true },
      });

      await tx.workEvent.create({
        data: {
          workItemId: stage.workItemId,
          workStageId: stage.id,
          actorAccountId: user.accountId,
          eventType: WorkEventType.STAGE_ASSIGNED,
          details: {
            assignmentId: assignment.id,
            previousAssignmentId: current?.id ?? null,
            targetType: target.targetType,
            targetOrgUnitId: target.targetOrgUnitId,
            targetAccountId: target.targetAccountId,
            reason,
          },
        },
      });
    });

    return this.getStage(user, officeId, stageId);
  }

  async start(
    user: AuthenticatedUser,
    officeId: string,
    stageId: string,
    dto: WorkRuntimeV3StageMutationDto,
  ) {
    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_START_STAGE,
      officeId,
    );

    await this.prisma.$transaction(async (tx) => {
      const stage = await this.requireStage(tx, officeId, stageId);
      this.assertWorkOperational(stage);
      this.assertExpectedVersion(stage, dto.expectedStageVersion);
      if (stage.status !== WorkStageStatus.READY) {
        throw new ConflictException('Only a READY stage can be started.');
      }

      if (!(await this.canExecuteStage(user, stage))) {
        throw new ForbiddenException('You are not authorized to start this stage.');
      }

      await this.lockWork(tx, stage.workItemId);
      const now = new Date();
      await this.claimStageVersion(tx, stage, dto.expectedStageVersion, {
        status: WorkStageStatus.IN_PROGRESS,
        startedAt: now,
      });

      await tx.workEvent.create({
        data: {
          workItemId: stage.workItemId,
          workStageId: stage.id,
          actorAccountId: user.accountId,
          eventType: WorkEventType.STAGE_STARTED,
          fromStageStatus: WorkStageStatus.READY,
          toStageStatus: WorkStageStatus.IN_PROGRESS,
        },
      });

      await this.recalculateWorkStatus(tx, stage.workItemId, user.accountId);
    });

    return this.getStage(user, officeId, stageId);
  }

  async block(
    user: AuthenticatedUser,
    officeId: string,
    stageId: string,
    dto: BlockWorkRuntimeV3StageDto,
  ) {
    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_START_STAGE,
      officeId,
    );

    await this.prisma.$transaction(async (tx) => {
      const stage = await this.requireStage(tx, officeId, stageId);
      this.assertWorkOperational(stage);
      this.assertExpectedVersion(stage, dto.expectedStageVersion);

      if (
        stage.status !== WorkStageStatus.READY &&
        stage.status !== WorkStageStatus.IN_PROGRESS
      ) {
        throw new ConflictException('Only a READY or IN_PROGRESS stage can be blocked.');
      }
      if (!(await this.canExecuteStage(user, stage))) {
        throw new ForbiddenException('You are not authorized to block this stage.');
      }

      await this.lockWork(tx, stage.workItemId);
      const now = new Date();
      await this.claimStageVersion(tx, stage, dto.expectedStageVersion, {
        status: WorkStageStatus.BLOCKED,
        blockedFromStatus: stage.status,
        blockerReason: dto.reason,
        blockedAt: now,
      });

      await tx.workEvent.create({
        data: {
          workItemId: stage.workItemId,
          workStageId: stage.id,
          actorAccountId: user.accountId,
          eventType: WorkEventType.STAGE_BLOCKED,
          fromStageStatus: stage.status,
          toStageStatus: WorkStageStatus.BLOCKED,
          details: { reason: dto.reason },
        },
      });

      await this.recalculateWorkStatus(tx, stage.workItemId, user.accountId);
    });

    return this.getStage(user, officeId, stageId);
  }

  async resume(
    user: AuthenticatedUser,
    officeId: string,
    stageId: string,
    dto: WorkRuntimeV3StageMutationDto,
  ) {
    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_START_STAGE,
      officeId,
    );

    await this.prisma.$transaction(async (tx) => {
      const stage = await this.requireStage(tx, officeId, stageId);
      this.assertWorkOperational(stage);
      this.assertExpectedVersion(stage, dto.expectedStageVersion);

      if (stage.status !== WorkStageStatus.BLOCKED) {
        throw new ConflictException('Only a BLOCKED stage can be resumed.');
      }
      if (
        stage.blockedFromStatus !== WorkStageStatus.READY &&
        stage.blockedFromStatus !== WorkStageStatus.IN_PROGRESS
      ) {
        throw new ConflictException('The blocked stage has no valid resume state.');
      }
      if (!(await this.canExecuteStage(user, stage))) {
        throw new ForbiddenException('You are not authorized to resume this stage.');
      }

      await this.lockWork(tx, stage.workItemId);
      const resumeStatus = stage.blockedFromStatus;
      await this.claimStageVersion(tx, stage, dto.expectedStageVersion, {
        status: resumeStatus,
        blockedFromStatus: null,
        blockerReason: null,
        blockedAt: null,
      });

      await tx.workEvent.create({
        data: {
          workItemId: stage.workItemId,
          workStageId: stage.id,
          actorAccountId: user.accountId,
          eventType: WorkEventType.STAGE_UNBLOCKED,
          fromStageStatus: WorkStageStatus.BLOCKED,
          toStageStatus: resumeStatus,
        },
      });

      await this.recalculateWorkStatus(tx, stage.workItemId, user.accountId);
    });

    return this.getStage(user, officeId, stageId);
  }

  async submit(
    user: AuthenticatedUser,
    officeId: string,
    stageId: string,
    dto: SubmitWorkRuntimeV3StageDto,
  ) {
    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_SUBMIT_STAGE,
      officeId,
    );

    await this.prisma.$transaction(async (tx) => {
      const stage = await this.requireStage(tx, officeId, stageId);
      this.assertWorkOperational(stage);
      this.assertExpectedVersion(stage, dto.expectedStageVersion);

      if (stage.status !== WorkStageStatus.IN_PROGRESS) {
        throw new ConflictException('Only an IN_PROGRESS stage can be submitted.');
      }
      if (!(await this.canExecuteStage(user, stage))) {
        throw new ForbiddenException('You are not authorized to submit this stage.');
      }

      const validated = validateRuntimeStageFields(
        stage.stageDefinition.fields,
        stage.stageDefinitionId,
        dto.fields,
      );
      const now = new Date();
      await assertRuntimeIdentityFieldValues(
        tx,
        officeId,
        now,
        validated.identityValues,
      );

      await this.lockWork(tx, stage.workItemId);
      const nextVersion = dto.expectedStageVersion + 1;
      await this.claimStageVersion(tx, stage, dto.expectedStageVersion, {
        status: WorkStageStatus.SUBMITTED,
        submittedAt: now,
      });

      for (const field of validated.values) {
        await tx.workFieldValue.upsert({
          where: {
            workItemId_fieldDefinitionId: {
              workItemId: stage.workItemId,
              fieldDefinitionId: field.fieldDefinitionId,
            },
          },
          create: {
            workItemId: stage.workItemId,
            fieldDefinitionId: field.fieldDefinitionId,
            workStageId: stage.id,
            value: field.value,
            updatedByAccountId: user.accountId,
          },
          update: {
            workStageId: stage.id,
            value: field.value,
            version: { increment: 1 },
            updatedByAccountId: user.accountId,
          },
        });
      }

      const previousSubmissions = await tx.workStageSubmission.count({
        where: { workStageId: stage.id },
      });
      const submissionNumber = previousSubmissions + 1;
      const submission = await tx.workStageSubmission.create({
        data: {
          workStageId: stage.id,
          submittedByAccountId: user.accountId,
          submissionNumber,
          stageVersion: nextVersion,
          valuesSnapshot: {
            fields: validated.values.map((field) => ({
              fieldDefinitionId: field.fieldDefinitionId,
              code: field.code,
              fieldType: field.fieldType,
              value: field.value,
            })),
          },
          note: dto.note?.trim() || null,
        },
        select: { id: true },
      });

      await tx.workEvent.create({
        data: {
          workItemId: stage.workItemId,
          workStageId: stage.id,
          actorAccountId: user.accountId,
          eventType: WorkEventType.STAGE_SUBMITTED,
          fromStageStatus: WorkStageStatus.IN_PROGRESS,
          toStageStatus: WorkStageStatus.SUBMITTED,
          details: {
            submissionId: submission.id,
            submissionNumber,
            stageVersion: nextVersion,
          },
        },
      });

      await this.recalculateWorkStatus(tx, stage.workItemId, user.accountId);
    });

    return this.getStage(user, officeId, stageId);
  }

  async getStage(
    user: AuthenticatedUser,
    officeId: string,
    stageId: string,
  ) {
    const stage = await this.prisma.workStage.findFirst({
      where: {
        id: stageId,
        workItem: { officeId },
      },
      select: STAGE_RUNTIME_SELECT,
    });
    if (!stage) {
      throw new NotFoundException('Work stage was not found.');
    }

    if (!(await this.canViewStage(user, stage))) {
      throw new ForbiddenException('You do not have access to this Work stage.');
    }

    return {
      ...stage,
      availableActions: await this.availableActions(user, stage),
    };
  }

  async listMyStages(
    user: AuthenticatedUser,
    officeId: string,
    take = 50,
  ) {
    await this.assertActiveOfficeMember(user, officeId);
    const stages = await this.prisma.workStage.findMany({
      where: {
        workItem: { officeId },
        status: { in: [...QUEUE_STAGE_STATUSES] },
        assignments: {
          some: {
            endsAt: null,
            assignmentRole: WorkStageAssignmentRole.PRIMARY,
            targetType: WorkStageAssignmentTargetType.ACCOUNT,
            targetAccountId: user.accountId,
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { readyAt: 'asc' }, { id: 'asc' }],
      take: this.normalizeTake(take),
      select: STAGE_RUNTIME_SELECT,
    });

    return Promise.all(
      stages.map(async (stage) => ({
        ...stage,
        availableActions: await this.availableActions(user, stage),
      })),
    );
  }

  async listTeamQueue(
    user: AuthenticatedUser,
    officeId: string,
    take = 50,
  ) {
    const membershipOrgUnitIds = await this.activeMembershipOrgUnitIds(user, officeId);
    if (membershipOrgUnitIds.length === 0) {
      return [];
    }

    const teamIds = (
      await this.prisma.orgUnit.findMany({
        where: {
          id: { in: membershipOrgUnitIds },
          officeId,
          isActive: true,
          orgUnitType: { isTeam: true },
        },
        select: { id: true },
      })
    ).map((item) => item.id);

    if (teamIds.length === 0) {
      return [];
    }

    const stages = await this.prisma.workStage.findMany({
      where: {
        workItem: { officeId },
        status: { in: [...QUEUE_STAGE_STATUSES] },
        assignments: {
          some: {
            endsAt: null,
            assignmentRole: WorkStageAssignmentRole.PRIMARY,
            targetType: WorkStageAssignmentTargetType.TEAM,
            targetOrgUnitId: { in: teamIds },
          },
        },
      },
      orderBy: [{ dueAt: 'asc' }, { readyAt: 'asc' }, { id: 'asc' }],
      take: this.normalizeTake(take),
      select: STAGE_RUNTIME_SELECT,
    });

    return Promise.all(
      stages.map(async (stage) => ({
        ...stage,
        availableActions: await this.availableActions(user, stage),
      })),
    );
  }

  async listOrgUnitQueue(
    user: AuthenticatedUser,
    officeId: string,
    take = 50,
  ) {
    const visibleOrgUnitIds = await this.authorization.visibleOrgUnitIds(
      user,
      CAPABILITIES.WORK_ASSIGN,
      officeId,
    );
    if (visibleOrgUnitIds.length === 0) {
      return [];
    }

    const stages = await this.prisma.workStage.findMany({
      where: {
        workItem: { officeId },
        responsibleOrgUnitId: { in: visibleOrgUnitIds },
        status: { in: [...QUEUE_STAGE_STATUSES] },
        OR: [
          {
            assignments: {
              none: {
                endsAt: null,
                assignmentRole: WorkStageAssignmentRole.PRIMARY,
              },
            },
          },
          {
            assignments: {
              some: {
                endsAt: null,
                assignmentRole: WorkStageAssignmentRole.PRIMARY,
                targetType: WorkStageAssignmentTargetType.ORG_UNIT_QUEUE,
              },
            },
          },
        ],
      },
      orderBy: [{ dueAt: 'asc' }, { readyAt: 'asc' }, { id: 'asc' }],
      take: this.normalizeTake(take),
      select: STAGE_RUNTIME_SELECT,
    });

    return Promise.all(
      stages.map(async (stage) => ({
        ...stage,
        availableActions: await this.availableActions(user, stage),
      })),
    );
  }

  private async assertCanAssign(
    user: AuthenticatedUser,
    officeId: string,
    stageId: string,
  ): Promise<void> {
    const stage = await this.prisma.workStage.findFirst({
      where: { id: stageId, workItem: { officeId } },
      select: { responsibleOrgUnitId: true },
    });
    if (!stage) {
      throw new NotFoundException('Work stage was not found.');
    }
    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_ASSIGN,
      officeId,
      stage.responsibleOrgUnitId,
    );
  }

  private async requireStage(
    tx: Prisma.TransactionClient,
    officeId: string,
    stageId: string,
  ): Promise<RuntimeStage> {
    const stage = await tx.workStage.findFirst({
      where: {
        id: stageId,
        workItem: { officeId },
      },
      select: STAGE_RUNTIME_SELECT,
    });
    if (!stage) {
      throw new NotFoundException('Work stage was not found.');
    }
    return stage;
  }

  private assertWorkOperational(stage: RuntimeStage): void {
    if (!stage.workItem.officeId || !stage.workItem.runtimeStatus) {
      throw new ConflictException('This stage does not belong to a native V3 Work.');
    }
    if (
      stage.workItem.runtimeStatus === WorkRuntimeStatus.COMPLETED ||
      stage.workItem.runtimeStatus === WorkRuntimeStatus.CANCELLED
    ) {
      throw new ConflictException('Completed or cancelled Work cannot be changed here.');
    }
  }

  private assertExpectedVersion(stage: RuntimeStage, expectedVersion: number): void {
    if (stage.version !== expectedVersion) {
      throw new ConflictException(
        `Stage changed from version ${expectedVersion} to ${stage.version}. Refresh and try again.`,
      );
    }
  }

  private async claimStageVersion(
    tx: Prisma.TransactionClient,
    stage: RuntimeStage,
    expectedVersion: number,
    data: Prisma.WorkStageUpdateManyMutationInput,
  ): Promise<void> {
    const result = await tx.workStage.updateMany({
      where: {
        id: stage.id,
        version: expectedVersion,
      },
      data: {
        ...data,
        version: { increment: 1 },
      },
    });

    if (result.count !== 1) {
      throw new ConflictException('Stage changed while you were working. Refresh and try again.');
    }
  }

  private async lockWork(
    tx: Prisma.TransactionClient,
    workItemId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "work_items"
      WHERE "id" = CAST(${workItemId} AS uuid)
      FOR UPDATE
    `;
    if (rows.length !== 1) {
      throw new NotFoundException('Work was not found.');
    }
  }

  private async resolveAssignmentTarget(
    tx: Prisma.TransactionClient,
    stage: RuntimeStage,
    dto: AssignWorkRuntimeV3StageDto,
    at: Date,
  ): Promise<AssignmentTarget> {
    if (stage.assignmentMode === WorkStageAssignmentMode.RESPONSIBLE_ORG_UNIT_HEAD) {
      if (dto.targetType || dto.targetOrgUnitId || dto.targetAccountId) {
        throw new BadRequestException(
          'Responsible OrgUnit Head assignment is resolved by the server; do not supply a target.',
        );
      }
      return {
        targetType: WorkStageAssignmentTargetType.ACCOUNT,
        targetOrgUnitId: null,
        targetAccountId: await this.resolveResponsibleOrgUnitHeadAccountId(
          tx,
          stage,
          at,
        ),
      };
    }

    if (!dto.targetType) {
      throw new BadRequestException('Assignment target type is required.');
    }

    this.assertTargetTypeAllowed(stage.assignmentMode, dto.targetType);

    if (dto.targetType === WorkStageAssignmentTargetType.ORG_UNIT_QUEUE) {
      if (dto.targetAccountId) {
        throw new BadRequestException('OrgUnit queue assignment cannot contain an account target.');
      }
      if (dto.targetOrgUnitId && dto.targetOrgUnitId !== stage.responsibleOrgUnitId) {
        throw new BadRequestException('OrgUnit queue must target the responsible OrgUnit.');
      }
      return {
        targetType: dto.targetType,
        targetOrgUnitId: stage.responsibleOrgUnitId,
        targetAccountId: null,
      };
    }

    if (dto.targetType === WorkStageAssignmentTargetType.TEAM) {
      if (!dto.targetOrgUnitId || dto.targetAccountId) {
        throw new BadRequestException('Team assignment requires only targetOrgUnitId.');
      }
      const team = await tx.orgUnit.findFirst({
        where: {
          id: dto.targetOrgUnitId,
          officeId: stage.workItem.officeId!,
          isActive: true,
          orgUnitType: { isTeam: true },
        },
        select: { id: true },
      });
      if (!team) {
        throw new BadRequestException('Assignment target must be an active Team in this Office.');
      }
      const insideScope = await tx.orgUnitClosure.count({
        where: {
          ancestorOrgUnitId: stage.responsibleOrgUnitId,
          descendantOrgUnitId: team.id,
        },
      });
      if (insideScope === 0) {
        throw new ForbiddenException(
          'The Team must belong to the responsible OrgUnit subtree.',
        );
      }
      return {
        targetType: dto.targetType,
        targetOrgUnitId: team.id,
        targetAccountId: null,
      };
    }

    if (!dto.targetAccountId || dto.targetOrgUnitId) {
      throw new BadRequestException('Individual assignment requires only targetAccountId.');
    }
    await this.assertAccountInsideResponsibleScope(
      tx,
      stage,
      dto.targetAccountId,
      at,
    );
    return {
      targetType: WorkStageAssignmentTargetType.ACCOUNT,
      targetOrgUnitId: null,
      targetAccountId: dto.targetAccountId,
    };
  }

  private assertTargetTypeAllowed(
    mode: WorkStageAssignmentMode,
    targetType: WorkStageAssignmentTargetType,
  ): void {
    const allowed = new Map<WorkStageAssignmentMode, WorkStageAssignmentTargetType[]>([
      [WorkStageAssignmentMode.ORG_UNIT_QUEUE, [WorkStageAssignmentTargetType.ORG_UNIT_QUEUE]],
      [WorkStageAssignmentMode.TEAM, [WorkStageAssignmentTargetType.TEAM]],
      [WorkStageAssignmentMode.INDIVIDUAL, [WorkStageAssignmentTargetType.ACCOUNT]],
      [
        WorkStageAssignmentMode.ORG_UNIT_OR_TEAM,
        [WorkStageAssignmentTargetType.ORG_UNIT_QUEUE, WorkStageAssignmentTargetType.TEAM],
      ],
      [
        WorkStageAssignmentMode.ORG_UNIT_OR_USER,
        [WorkStageAssignmentTargetType.ORG_UNIT_QUEUE, WorkStageAssignmentTargetType.ACCOUNT],
      ],
      [WorkStageAssignmentMode.RESPONSIBLE_ORG_UNIT_HEAD, [WorkStageAssignmentTargetType.ACCOUNT]],
    ]);

    if (!allowed.get(mode)?.includes(targetType)) {
      throw new BadRequestException(
        `Assignment target ${targetType} is not allowed for stage mode ${mode}.`,
      );
    }
  }

  private async assertAccountInsideResponsibleScope(
    tx: Prisma.TransactionClient,
    stage: RuntimeStage,
    accountId: string,
    at: Date,
  ): Promise<void> {
    const account = await tx.account.findFirst({
      where: {
        id: accountId,
        isEnabled: true,
        role: { not: AccountRole.SUPER_ADMIN },
        employee: {
          is: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
            orgMemberships: {
              some: {
                officeId: stage.workItem.officeId!,
                startsAt: { lte: at },
                OR: [{ endsAt: null }, { endsAt: { gt: at } }],
                orgUnit: {
                  ancestorLinks: {
                    some: {
                      ancestorOrgUnitId: stage.responsibleOrgUnitId,
                    },
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
    });

    if (!account) {
      throw new BadRequestException(
        'Assigned user must be an active member inside the responsible OrgUnit scope.',
      );
    }
  }

  private async resolveResponsibleOrgUnitHeadAccountId(
    tx: Prisma.TransactionClient,
    stage: RuntimeStage,
    at: Date,
  ): Promise<string> {
    const assignments = await tx.orgLeadershipAssignment.findMany({
      where: {
        officeId: stage.workItem.officeId!,
        orgUnitId: stage.responsibleOrgUnitId,
        leadershipType: OrgLeadershipType.ORG_UNIT_HEAD,
        effectiveFrom: { lte: at },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
      },
      orderBy: [{ isActing: 'desc' }, { effectiveFrom: 'desc' }],
      select: {
        isActing: true,
        employee: {
          select: {
            status: true,
            employmentStatus: true,
            archivedAt: true,
            account: {
              select: {
                id: true,
                isEnabled: true,
                role: true,
              },
            },
          },
        },
      },
    });

    const active = assignments.find(
      (assignment) =>
        assignment.employee.status === EmployeeStatus.ACTIVE &&
        assignment.employee.employmentStatus === EmploymentStatus.ACTIVE &&
        assignment.employee.archivedAt === null &&
        assignment.employee.account?.isEnabled &&
        assignment.employee.account.role !== AccountRole.SUPER_ADMIN,
    );
    const accountId = active?.employee.account?.id;
    if (!accountId) {
      throw new ConflictException(
        'The responsible OrgUnit has no active current Head available for assignment.',
      );
    }
    return accountId;
  }

  private sameAssignment(
    current: PrimaryAssignment,
    target: AssignmentTarget,
  ): boolean {
    return (
      current.targetType === target.targetType &&
      (current.targetOrgUnitId ?? null) === target.targetOrgUnitId &&
      (current.targetAccountId ?? null) === target.targetAccountId
    );
  }

  private async canExecuteStage(
    user: AuthenticatedUser,
    stage: RuntimeStage,
  ): Promise<boolean> {
    if (user.role === AccountRole.SUPER_ADMIN) {
      return false;
    }

    const assignment = stage.assignments[0] ?? null;
    if (!assignment) {
      if (
        stage.assignmentMode !== WorkStageAssignmentMode.ORG_UNIT_QUEUE &&
        stage.assignmentMode !== WorkStageAssignmentMode.ORG_UNIT_OR_TEAM &&
        stage.assignmentMode !== WorkStageAssignmentMode.ORG_UNIT_OR_USER
      ) {
        return false;
      }
      return this.authorization.can(
        user,
        CAPABILITIES.WORK_ASSIGN,
        stage.workItem.officeId!,
        stage.responsibleOrgUnitId,
      );
    }

    if (assignment.targetType === WorkStageAssignmentTargetType.ACCOUNT) {
      if (assignment.targetAccountId !== user.accountId) {
        return false;
      }
      return this.accountHasMembershipInsideScope(
        user.accountId,
        stage.workItem.officeId!,
        stage.responsibleOrgUnitId,
      );
    }

    if (assignment.targetType === WorkStageAssignmentTargetType.TEAM) {
      return Boolean(
        assignment.targetOrgUnitId &&
          (await this.accountHasExactMembership(
            user.accountId,
            stage.workItem.officeId!,
            assignment.targetOrgUnitId,
          )),
      );
    }

    return this.authorization.can(
      user,
      CAPABILITIES.WORK_ASSIGN,
      stage.workItem.officeId!,
      stage.responsibleOrgUnitId,
    );
  }

  private async canViewStage(
    user: AuthenticatedUser,
    stage: RuntimeStage,
  ): Promise<boolean> {
    if (user.role === AccountRole.SUPER_ADMIN) {
      return true;
    }
    if (stage.workItem.createdByAccountId === user.accountId) {
      return true;
    }
    if (
      await this.authorization.can(
        user,
        CAPABILITIES.WORK_VIEW,
        stage.workItem.officeId!,
        stage.responsibleOrgUnitId,
      )
    ) {
      return true;
    }

    const assignment = stage.assignments[0] ?? null;
    if (assignment?.targetAccountId === user.accountId) {
      return true;
    }
    if (
      assignment?.targetType === WorkStageAssignmentTargetType.TEAM &&
      assignment.targetOrgUnitId
    ) {
      return this.accountHasExactMembership(
        user.accountId,
        stage.workItem.officeId!,
        assignment.targetOrgUnitId,
      );
    }
    if (
      !assignment ||
      assignment.targetType === WorkStageAssignmentTargetType.ORG_UNIT_QUEUE
    ) {
      return this.authorization.can(
        user,
        CAPABILITIES.WORK_ASSIGN,
        stage.workItem.officeId!,
        stage.responsibleOrgUnitId,
      );
    }
    return false;
  }

  private async availableActions(
    user: AuthenticatedUser,
    stage: RuntimeStage,
  ): Promise<string[]> {
    if (user.role === AccountRole.SUPER_ADMIN) {
      return [];
    }

    const actions: string[] = [];
    const officeId = stage.workItem.officeId!;
    const canAssign = await this.authorization.can(
      user,
      CAPABILITIES.WORK_ASSIGN,
      officeId,
      stage.responsibleOrgUnitId,
    );
    if (
      canAssign &&
      MUTABLE_STAGE_STATUSES.includes(stage.status as (typeof MUTABLE_STAGE_STATUSES)[number])
    ) {
      actions.push('ASSIGN');
    }

    const canExecute = await this.canExecuteStage(user, stage);
    if (canExecute && stage.status === WorkStageStatus.READY) {
      actions.push('START', 'BLOCK');
    }
    if (canExecute && stage.status === WorkStageStatus.IN_PROGRESS) {
      actions.push('BLOCK', 'SUBMIT');
    }
    if (canExecute && stage.status === WorkStageStatus.BLOCKED) {
      actions.push('RESUME');
    }
    return actions;
  }

  private async accountHasExactMembership(
    accountId: string,
    officeId: string,
    orgUnitId: string,
  ): Promise<boolean> {
    const now = new Date();
    return Boolean(
      await this.prisma.account.findFirst({
        where: {
          id: accountId,
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
                  orgUnitId,
                  startsAt: { lte: now },
                  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                },
              },
            },
          },
        },
        select: { id: true },
      }),
    );
  }

  private async accountHasMembershipInsideScope(
    accountId: string,
    officeId: string,
    ancestorOrgUnitId: string,
  ): Promise<boolean> {
    const now = new Date();
    return Boolean(
      await this.prisma.account.findFirst({
        where: {
          id: accountId,
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
                  startsAt: { lte: now },
                  OR: [{ endsAt: null }, { endsAt: { gt: now } }],
                  orgUnit: {
                    ancestorLinks: {
                      some: { ancestorOrgUnitId },
                    },
                  },
                },
              },
            },
          },
        },
        select: { id: true },
      }),
    );
  }

  private async assertActiveOfficeMember(
    user: AuthenticatedUser,
    officeId: string,
  ): Promise<void> {
    if (user.role === AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException('System administrators do not have operational Work queues.');
    }
    const orgUnitIds = await this.activeMembershipOrgUnitIds(user, officeId);
    if (orgUnitIds.length === 0) {
      throw new ForbiddenException('You are not an active member of this Office.');
    }
  }

  private async activeMembershipOrgUnitIds(
    user: AuthenticatedUser,
    officeId: string,
  ): Promise<string[]> {
    if (user.role === AccountRole.SUPER_ADMIN) {
      return [];
    }
    const now = new Date();
    const account = await this.prisma.account.findFirst({
      where: {
        id: user.accountId,
        isEnabled: true,
        employee: {
          is: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
          },
        },
      },
      select: {
        employee: {
          select: {
            orgMemberships: {
              where: {
                officeId,
                startsAt: { lte: now },
                OR: [{ endsAt: null }, { endsAt: { gt: now } }],
              },
              select: { orgUnitId: true },
            },
          },
        },
      },
    });
    return [
      ...new Set(
        account?.employee?.orgMemberships
          .map((membership) => membership.orgUnitId)
          .filter((id): id is string => Boolean(id)) ?? [],
      ),
    ];
  }

  private async recalculateWorkStatus(
    tx: Prisma.TransactionClient,
    workItemId: string,
    actorAccountId: string,
  ): Promise<void> {
    const work = await tx.workItem.findUnique({
      where: { id: workItemId },
      select: { runtimeStatus: true },
    });
    if (!work?.runtimeStatus) {
      throw new ConflictException('The V3 Work runtime status is missing.');
    }
    if (
      work.runtimeStatus === WorkRuntimeStatus.COMPLETED ||
      work.runtimeStatus === WorkRuntimeStatus.CANCELLED
    ) {
      return;
    }

    const stages = await tx.workStage.findMany({
      where: { workItemId },
      select: { status: true },
    });
    const statuses = stages.map((stage) => stage.status);

    let nextStatus: WorkRuntimeStatus;
    if (statuses.some((status) => status === WorkStageStatus.BLOCKED)) {
      nextStatus = WorkRuntimeStatus.BLOCKED;
    } else if (
      statuses.some(
        (status) =>
          status === WorkStageStatus.IN_PROGRESS ||
          status === WorkStageStatus.SUBMITTED,
      )
    ) {
      nextStatus = WorkRuntimeStatus.IN_PROGRESS;
    } else if (statuses.some((status) => status === WorkStageStatus.READY)) {
      nextStatus = WorkRuntimeStatus.OPEN;
    } else {
      nextStatus = WorkRuntimeStatus.WAITING;
    }

    if (nextStatus === work.runtimeStatus) {
      return;
    }

    await tx.workItem.update({
      where: { id: workItemId },
      data: {
        runtimeStatus: nextStatus,
        version: { increment: 1 },
      },
    });
    await tx.workEvent.create({
      data: {
        workItemId,
        actorAccountId,
        eventType: WorkEventType.WORK_STATUS_CHANGED,
        fromWorkStatus: work.runtimeStatus,
        toWorkStatus: nextStatus,
      },
    });
  }

  private normalizeTake(take: number): number {
    return Math.min(Math.max(Math.trunc(take || 50), 1), 100);
  }
}
