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
  WorkFinalClosureMode,
  WorkRuntimeStatus,
  WorkStageActivationMode,
  WorkStageApprovalDecision,
  WorkStageApprovalMode,
  WorkStageAssignmentMode,
  WorkStageAssignmentRole,
  WorkStageAssignmentTargetType,
  WorkStageStatus,
} from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import type {
  AssignWorkRuntimeV3StageDto,
  ApproveWorkRuntimeV3StageDto,
  BlockWorkRuntimeV3StageDto,
  CancelWorkRuntimeV3Dto,
  CompleteWorkRuntimeV3Dto,
  ReopenWorkRuntimeV3Dto,
  ReturnWorkRuntimeV3StageDto,
  SubmitWorkRuntimeV3StageDto,
  WorkRuntimeV3StageMutationDto,
} from './dto/work-runtime-v3-stage.dto';
import {
  assertRuntimeIdentityFieldValues,
  validateRuntimeStageFields,
} from './work-runtime-v3-field-validator';
import { stableJson } from './work-runtime-v3.service';

const MUTABLE_STAGE_STATUSES = [
  WorkStageStatus.READY,
  WorkStageStatus.IN_PROGRESS,
  WorkStageStatus.BLOCKED,
  WorkStageStatus.RETURNED,
] as const;

const QUEUE_STAGE_STATUSES = [
  WorkStageStatus.READY,
  WorkStageStatus.IN_PROGRESS,
  WorkStageStatus.BLOCKED,
  WorkStageStatus.SUBMITTED,
  WorkStageStatus.RETURNED,
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

      if (
        stage.status !== WorkStageStatus.BLOCKED &&
        stage.status !== WorkStageStatus.RETURNED
      ) {
        throw new ConflictException(
          'Only a BLOCKED or RETURNED stage can be resumed.',
        );
      }
      if (
        stage.status === WorkStageStatus.BLOCKED &&
        stage.blockedFromStatus !== WorkStageStatus.READY &&
        stage.blockedFromStatus !== WorkStageStatus.IN_PROGRESS
      ) {
        throw new ConflictException('The blocked stage has no valid resume state.');
      }
      if (!(await this.canExecuteStage(user, stage))) {
        throw new ForbiddenException('You are not authorized to resume this stage.');
      }

      await this.lockWork(tx, stage.workItemId);
      const fromStatus = stage.status;
      const resumeStatus =
        stage.status === WorkStageStatus.RETURNED
          ? WorkStageStatus.IN_PROGRESS
          : stage.blockedFromStatus!;
      await this.claimStageVersion(tx, stage, dto.expectedStageVersion, {
        status: resumeStatus,
        blockedFromStatus: null,
        blockerReason: null,
        blockedAt: null,
        submittedAt:
          stage.status === WorkStageStatus.RETURNED
            ? null
            : stage.submittedAt,
      });

      await tx.workEvent.create({
        data: {
          workItemId: stage.workItemId,
          workStageId: stage.id,
          actorAccountId: user.accountId,
          eventType:
            fromStatus === WorkStageStatus.RETURNED
              ? WorkEventType.STAGE_STARTED
              : WorkEventType.STAGE_UNBLOCKED,
          fromStageStatus: fromStatus,
          toStageStatus: resumeStatus,
          details:
            fromStatus === WorkStageStatus.RETURNED
              ? { resumedAfterReturn: true }
              : undefined,
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

      if (stage.approvalMode === WorkStageApprovalMode.NONE) {
        const completionClaim = await tx.workStage.updateMany({
          where: {
            id: stage.id,
            version: nextVersion,
            status: WorkStageStatus.SUBMITTED,
          },
          data: {
            status: WorkStageStatus.COMPLETED,
            completedAt: now,
            version: { increment: 1 },
          },
        });
        if (completionClaim.count !== 1) {
          throw new ConflictException(
            'Stage changed while automatic completion was being applied. Refresh and try again.',
          );
        }

        await tx.workEvent.create({
          data: {
            workItemId: stage.workItemId,
            workStageId: stage.id,
            actorAccountId: user.accountId,
            eventType: WorkEventType.STAGE_COMPLETED,
            fromStageStatus: WorkStageStatus.SUBMITTED,
            toStageStatus: WorkStageStatus.COMPLETED,
            details: {
              submissionId: submission.id,
              submissionNumber,
              automatic: true,
            },
          },
        });

        await this.releaseDependentStages(
          tx,
          stage.workItemId,
          stage.stageDefinitionId,
          user.accountId,
          now,
        );
      }

      await this.recalculateWorkStatus(tx, stage.workItemId, user.accountId);
    });

    return this.getStage(user, officeId, stageId);
  }

  async approve(
    user: AuthenticatedUser,
    officeId: string,
    stageId: string,
    dto: ApproveWorkRuntimeV3StageDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const stage = await this.requireStage(tx, officeId, stageId);
      await this.authorization.assertCan(
        user,
        CAPABILITIES.WORK_APPROVE_STAGE,
        officeId,
        stage.responsibleOrgUnitId,
      );
      this.assertWorkOperational(stage);
      this.assertExpectedVersion(stage, dto.expectedStageVersion);
      this.assertStageCanBeReviewed(stage);
      await this.assertApprovalAuthority(tx, user, stage, new Date());

      const submission = stage.submissions[0];
      if (!submission) {
        throw new ConflictException('The submitted stage has no submission record.');
      }

      await this.lockWork(tx, stage.workItemId);
      const now = new Date();
      await tx.workStageApproval.create({
        data: {
          workStageId: stage.id,
          submissionId: submission.id,
          decidedByAccountId: user.accountId,
          decision: WorkStageApprovalDecision.APPROVED,
          reason: dto.note?.trim() || null,
        },
      });
      await this.claimStageVersion(tx, stage, dto.expectedStageVersion, {
        status: WorkStageStatus.COMPLETED,
        completedAt: now,
      });
      await tx.workEvent.create({
        data: {
          workItemId: stage.workItemId,
          workStageId: stage.id,
          actorAccountId: user.accountId,
          eventType: WorkEventType.STAGE_APPROVED,
          fromStageStatus: WorkStageStatus.SUBMITTED,
          toStageStatus: WorkStageStatus.COMPLETED,
          details: {
            submissionId: submission.id,
            submissionNumber: submission.submissionNumber,
            note: dto.note?.trim() || null,
          },
        },
      });

      await this.releaseDependentStages(
        tx,
        stage.workItemId,
        stage.stageDefinitionId,
        user.accountId,
        now,
      );

      await this.recalculateWorkStatus(tx, stage.workItemId, user.accountId);
    });

    return this.getStage(user, officeId, stageId);
  }

  async returnStage(
    user: AuthenticatedUser,
    officeId: string,
    stageId: string,
    dto: ReturnWorkRuntimeV3StageDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const stage = await this.requireStage(tx, officeId, stageId);
      await this.authorization.assertCan(
        user,
        CAPABILITIES.WORK_RETURN_STAGE,
        officeId,
        stage.responsibleOrgUnitId,
      );
      this.assertWorkOperational(stage);
      this.assertExpectedVersion(stage, dto.expectedStageVersion);
      this.assertStageCanBeReviewed(stage);
      await this.assertApprovalAuthority(tx, user, stage, new Date());

      const submission = stage.submissions[0];
      if (!submission) {
        throw new ConflictException('The submitted stage has no submission record.');
      }

      await this.lockWork(tx, stage.workItemId);
      await tx.workStageApproval.create({
        data: {
          workStageId: stage.id,
          submissionId: submission.id,
          decidedByAccountId: user.accountId,
          decision: WorkStageApprovalDecision.RETURNED,
          reason: dto.reason,
        },
      });
      await this.claimStageVersion(tx, stage, dto.expectedStageVersion, {
        status: WorkStageStatus.RETURNED,
        completedAt: null,
      });
      await tx.workEvent.create({
        data: {
          workItemId: stage.workItemId,
          workStageId: stage.id,
          actorAccountId: user.accountId,
          eventType: WorkEventType.STAGE_RETURNED,
          fromStageStatus: WorkStageStatus.SUBMITTED,
          toStageStatus: WorkStageStatus.RETURNED,
          details: {
            submissionId: submission.id,
            submissionNumber: submission.submissionNumber,
            reason: dto.reason,
          },
        },
      });

      await this.recalculateWorkStatus(tx, stage.workItemId, user.accountId);
    });

    return this.getStage(user, officeId, stageId);
  }

  async completeWork(
    user: AuthenticatedUser,
    officeId: string,
    workItemId: string,
    dto: CompleteWorkRuntimeV3Dto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const work = await tx.workItem.findFirst({
        where: { id: workItemId, officeId },
        select: {
          id: true,
          officeId: true,
          primaryOwnerOrgUnitId: true,
          runtimeStatus: true,
          version: true,
          workTypeVersion: {
            select: {
              finalClosureMode: true,
              finalClosureLeadershipType: true,
            },
          },
        },
      });
      if (!work?.runtimeStatus || !work.workTypeVersion) {
        throw new NotFoundException('Native V3 Work was not found.');
      }
      await this.authorization.assertCan(
        user,
        CAPABILITIES.WORK_APPROVE_STAGE,
        officeId,
        work.primaryOwnerOrgUnitId,
      );
      if (work.version !== dto.expectedWorkVersion) {
        throw new ConflictException(
          `Work changed from version ${dto.expectedWorkVersion} to ${work.version}. Refresh and try again.`,
        );
      }
      if (work.runtimeStatus === WorkRuntimeStatus.COMPLETED) {
        throw new ConflictException('Work is already completed.');
      }
      if (work.runtimeStatus === WorkRuntimeStatus.CANCELLED) {
        throw new ConflictException('Cancelled Work cannot be completed.');
      }
      if (
        work.workTypeVersion.finalClosureMode ===
        WorkFinalClosureMode.AUTO_AFTER_REQUIRED_STAGES
      ) {
        throw new ConflictException(
          'This Work completes automatically after all required stages are settled.',
        );
      }

      const requiredStages = await tx.workStage.findMany({
        where: { workItemId, isRequired: true },
        select: { status: true },
      });
      if (
        !requiredStages.every(
          (stage) =>
            stage.status === WorkStageStatus.COMPLETED ||
            stage.status === WorkStageStatus.SKIPPED,
        )
      ) {
        throw new ConflictException(
          'All required stages must be completed or skipped before final closure.',
        );
      }

      await this.assertFinalClosureAuthority(tx, user, work, new Date());
      await this.lockWork(tx, workItemId);

      const now = new Date();
      const completion = await tx.workItem.updateMany({
        where: {
          id: workItemId,
          version: dto.expectedWorkVersion,
          runtimeStatus: work.runtimeStatus,
        },
        data: {
          runtimeStatus: WorkRuntimeStatus.COMPLETED,
          completedAt: now,
          closedAt: now,
          cancelledAt: null,
          version: { increment: 1 },
        },
      });
      if (completion.count !== 1) {
        throw new ConflictException(
          'Work changed while final closure was being applied. Refresh and try again.',
        );
      }

      await tx.workEvent.create({
        data: {
          workItemId,
          actorAccountId: user.accountId,
          eventType: WorkEventType.WORK_COMPLETED,
          fromWorkStatus: work.runtimeStatus,
          toWorkStatus: WorkRuntimeStatus.COMPLETED,
          details: {
            automatic: false,
            finalClosureMode: work.workTypeVersion.finalClosureMode,
            note: dto.note?.trim() || null,
          },
        },
      });
    });

    return this.prisma.workItem.findFirst({
      where: { id: workItemId, officeId },
      select: {
        id: true,
        ticketNumber: true,
        runtimeStatus: true,
        version: true,
        completedAt: true,
        closedAt: true,
      },
    });
  }

  async cancelWork(
    user: AuthenticatedUser,
    officeId: string,
    workItemId: string,
    dto: CancelWorkRuntimeV3Dto,
  ) {
    await this.authorization.assertCan(user, CAPABILITIES.WORK_CANCEL, officeId);

    await this.prisma.$transaction(async (tx) => {
      const work = await tx.workItem.findFirst({
        where: { id: workItemId, officeId },
        select: {
          id: true,
          officeId: true,
          runtimeStatus: true,
          version: true,
        },
      });
      if (!work?.runtimeStatus) {
        throw new NotFoundException('Native V3 Work was not found.');
      }
      if (work.version !== dto.expectedWorkVersion) {
        throw new ConflictException(
          `Work changed from version ${dto.expectedWorkVersion} to ${work.version}. Refresh and try again.`,
        );
      }
      if (work.runtimeStatus === WorkRuntimeStatus.COMPLETED) {
        throw new ConflictException('Completed Work cannot be cancelled. Reopen it first if correction is required.');
      }
      if (work.runtimeStatus === WorkRuntimeStatus.CANCELLED) {
        throw new ConflictException('Work is already cancelled.');
      }

      const now = new Date();
      await this.assertCurrentOfficeHead(tx, user, officeId, now, 'cancel');
      await this.lockWork(tx, workItemId);

      const stages = await tx.workStage.findMany({
        where: {
          workItemId,
          status: {
            notIn: [
              WorkStageStatus.COMPLETED,
              WorkStageStatus.SKIPPED,
              WorkStageStatus.CANCELLED,
            ],
          },
        },
        select: {
          id: true,
          status: true,
          version: true,
        },
      });

      for (const stage of stages) {
        const cancelled = await tx.workStage.updateMany({
          where: {
            id: stage.id,
            version: stage.version,
            status: stage.status,
          },
          data: {
            status: WorkStageStatus.CANCELLED,
            blockedFromStatus: null,
            blockerReason: null,
            blockedAt: null,
            cancelledAt: now,
            version: { increment: 1 },
          },
        });
        if (cancelled.count !== 1) {
          throw new ConflictException(
            'A Work stage changed while cancellation was being applied. Refresh and try again.',
          );
        }

        await tx.workStageAssignment.updateMany({
          where: {
            workStageId: stage.id,
            endsAt: null,
          },
          data: {
            endedByAccountId: user.accountId,
            endsAt: now,
            endReason: dto.reason,
          },
        });

        await tx.workEvent.create({
          data: {
            workItemId,
            workStageId: stage.id,
            actorAccountId: user.accountId,
            eventType: WorkEventType.STAGE_CANCELLED,
            fromStageStatus: stage.status,
            toStageStatus: WorkStageStatus.CANCELLED,
            details: { reason: dto.reason },
          },
        });
      }

      const cancelled = await tx.workItem.updateMany({
        where: {
          id: workItemId,
          version: dto.expectedWorkVersion,
          runtimeStatus: work.runtimeStatus,
        },
        data: {
          runtimeStatus: WorkRuntimeStatus.CANCELLED,
          completedAt: null,
          closedAt: now,
          cancelledAt: now,
          version: { increment: 1 },
        },
      });
      if (cancelled.count !== 1) {
        throw new ConflictException(
          'Work changed while cancellation was being applied. Refresh and try again.',
        );
      }

      await tx.workEvent.create({
        data: {
          workItemId,
          actorAccountId: user.accountId,
          eventType: WorkEventType.WORK_CANCELLED,
          fromWorkStatus: work.runtimeStatus,
          toWorkStatus: WorkRuntimeStatus.CANCELLED,
          details: {
            reason: dto.reason,
            cancelledStageCount: stages.length,
          },
        },
      });
    });

    return this.prisma.workItem.findFirst({
      where: { id: workItemId, officeId },
      select: {
        id: true,
        ticketNumber: true,
        runtimeStatus: true,
        version: true,
        cancelledAt: true,
        closedAt: true,
      },
    });
  }

  async reopenWork(
    user: AuthenticatedUser,
    officeId: string,
    workItemId: string,
    dto: ReopenWorkRuntimeV3Dto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const work = await tx.workItem.findFirst({
        where: { id: workItemId, officeId },
        select: {
          id: true,
          officeId: true,
          primaryOwnerOrgUnitId: true,
          runtimeStatus: true,
          version: true,
          workTypeVersion: {
            select: {
              finalClosureMode: true,
              finalClosureLeadershipType: true,
            },
          },
        },
      });
      if (!work?.runtimeStatus || !work.workTypeVersion) {
        throw new NotFoundException('Native V3 Work was not found.');
      }
      await this.authorization.assertCan(
        user,
        CAPABILITIES.WORK_REOPEN,
        officeId,
        work.primaryOwnerOrgUnitId,
      );
      if (work.version !== dto.expectedWorkVersion) {
        throw new ConflictException(
          `Work changed from version ${dto.expectedWorkVersion} to ${work.version}. Refresh and try again.`,
        );
      }
      if (work.runtimeStatus !== WorkRuntimeStatus.COMPLETED) {
        throw new ConflictException('Only completed Work can be reopened.');
      }

      const stage = await tx.workStage.findFirst({
        where: {
          id: dto.stageId,
          workItemId,
        },
        select: {
          id: true,
          status: true,
          version: true,
          slaMinutes: true,
        },
      });
      if (!stage) {
        throw new NotFoundException('The Work stage selected for reopening was not found.');
      }
      if (stage.status !== WorkStageStatus.COMPLETED) {
        throw new ConflictException('Only a completed stage can be reopened.');
      }

      const now = new Date();
      if (
        work.workTypeVersion.finalClosureMode ===
        WorkFinalClosureMode.AUTO_AFTER_REQUIRED_STAGES
      ) {
        await this.assertCurrentOfficeHead(tx, user, officeId, now, 'reopen');
      } else {
        await this.assertFinalClosureAuthority(tx, user, work, now);
      }
      await this.lockWork(tx, workItemId);

      const activeAssignment = await tx.workStageAssignment.findFirst({
        where: {
          workStageId: stage.id,
          assignmentRole: WorkStageAssignmentRole.PRIMARY,
          endsAt: null,
        },
        select: { id: true },
      });
      const nextStageStatus = activeAssignment
        ? WorkStageStatus.IN_PROGRESS
        : WorkStageStatus.READY;
      const dueAt = stage.slaMinutes
        ? new Date(now.getTime() + stage.slaMinutes * 60_000)
        : null;

      const reopenedStage = await tx.workStage.updateMany({
        where: {
          id: stage.id,
          version: stage.version,
          status: WorkStageStatus.COMPLETED,
        },
        data: {
          status: nextStageStatus,
          readyAt: now,
          startedAt:
            nextStageStatus === WorkStageStatus.IN_PROGRESS ? now : null,
          submittedAt: null,
          completedAt: null,
          blockedFromStatus: null,
          blockerReason: null,
          blockedAt: null,
          cancelledAt: null,
          dueAt,
          version: { increment: 1 },
        },
      });
      if (reopenedStage.count !== 1) {
        throw new ConflictException(
          'The selected stage changed while Work reopening was being applied. Refresh and try again.',
        );
      }

      const nextWorkStatus =
        nextStageStatus === WorkStageStatus.IN_PROGRESS
          ? WorkRuntimeStatus.IN_PROGRESS
          : WorkRuntimeStatus.OPEN;
      const reopenedWork = await tx.workItem.updateMany({
        where: {
          id: workItemId,
          version: dto.expectedWorkVersion,
          runtimeStatus: WorkRuntimeStatus.COMPLETED,
        },
        data: {
          runtimeStatus: nextWorkStatus,
          completedAt: null,
          closedAt: null,
          cancelledAt: null,
          version: { increment: 1 },
        },
      });
      if (reopenedWork.count !== 1) {
        throw new ConflictException(
          'Work changed while reopening was being applied. Refresh and try again.',
        );
      }

      await tx.workEvent.create({
        data: {
          workItemId,
          workStageId: stage.id,
          actorAccountId: user.accountId,
          eventType: WorkEventType.WORK_REOPENED,
          fromWorkStatus: WorkRuntimeStatus.COMPLETED,
          toWorkStatus: nextWorkStatus,
          fromStageStatus: WorkStageStatus.COMPLETED,
          toStageStatus: nextStageStatus,
          details: {
            reason: dto.reason,
            preservedHistory: true,
          },
        },
      });
    });

    return this.prisma.workItem.findFirst({
      where: { id: workItemId, officeId },
      select: {
        id: true,
        ticketNumber: true,
        runtimeStatus: true,
        version: true,
        completedAt: true,
        closedAt: true,
      },
    });
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

  private assertStageCanBeReviewed(stage: RuntimeStage): void {
    if (stage.status !== WorkStageStatus.SUBMITTED) {
      throw new ConflictException('Only a SUBMITTED stage can be reviewed.');
    }
    if (stage.approvalMode === WorkStageApprovalMode.NONE) {
      throw new ConflictException('This stage does not require approval.');
    }
  }

  private async assertApprovalAuthority(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    stage: RuntimeStage,
    at: Date,
  ): Promise<void> {
    if (user.role === AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException('System administrators cannot review Work stages.');
    }

    const employee = await tx.account.findFirst({
      where: {
        id: user.accountId,
        isEnabled: true,
        role: { not: AccountRole.SUPER_ADMIN },
        employee: {
          is: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
          },
        },
      },
      select: { employee: { select: { id: true } } },
    });
    const employeeId = employee?.employee?.id;
    if (!employeeId) {
      throw new ForbiddenException('Only an active Office employee can review this stage.');
    }

    let leadershipType: OrgLeadershipType;
    let orgUnitId: string | null;

    if (stage.approvalMode === WorkStageApprovalMode.OFFICE_HEAD) {
      leadershipType = OrgLeadershipType.OFFICE_HEAD;
      orgUnitId = null;
    } else if (
      stage.approvalMode === WorkStageApprovalMode.RESPONSIBLE_ORG_UNIT_HEAD
    ) {
      leadershipType = OrgLeadershipType.ORG_UNIT_HEAD;
      orgUnitId = stage.responsibleOrgUnitId;
    } else if (stage.approvalMode === WorkStageApprovalMode.TEAM_LEAD) {
      const teamAssignment = stage.assignments[0];
      if (
        teamAssignment?.targetType !== WorkStageAssignmentTargetType.TEAM ||
        !teamAssignment.targetOrgUnitId
      ) {
        throw new ConflictException(
          'TEAM_LEAD approval requires the stage to be assigned to a Team.',
        );
      }
      leadershipType = OrgLeadershipType.TEAM_LEAD;
      orgUnitId = teamAssignment.targetOrgUnitId;
    } else {
      if (!stage.approvalLeadershipType) {
        throw new ConflictException(
          'The configured approval leadership type is missing.',
        );
      }
      leadershipType = stage.approvalLeadershipType;
      orgUnitId =
        leadershipType === OrgLeadershipType.OFFICE_HEAD
          ? null
          : stage.responsibleOrgUnitId;
    }

    const assignment = await tx.orgLeadershipAssignment.findFirst({
      where: {
        employeeId,
        officeId: stage.workItem.officeId!,
        orgUnitId,
        leadershipType,
        effectiveFrom: { lte: at },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
      },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException(
        'You are not the configured current approver for this stage.',
      );
    }
  }

  private async assertFinalClosureAuthority(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    work: {
      officeId: string | null;
      primaryOwnerOrgUnitId: string | null;
      workTypeVersion: {
        finalClosureMode: WorkFinalClosureMode;
        finalClosureLeadershipType: OrgLeadershipType | null;
      } | null;
    },
    at: Date,
  ): Promise<void> {
    if (user.role === AccountRole.SUPER_ADMIN || !work.officeId) {
      throw new ForbiddenException(
        'System administrators cannot perform operational Work closure.',
      );
    }
    if (!work.workTypeVersion) {
      throw new ConflictException(
        'The Work Type Version configuration is missing for final closure.',
      );
    }

    const account = await tx.account.findFirst({
      where: {
        id: user.accountId,
        isEnabled: true,
        role: { not: AccountRole.SUPER_ADMIN },
        employee: {
          is: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
          },
        },
      },
      select: { employee: { select: { id: true } } },
    });
    const employeeId = account?.employee?.id;
    if (!employeeId) {
      throw new ForbiddenException(
        'Only an active Office employee can perform final Work closure.',
      );
    }

    let leadershipType: OrgLeadershipType;
    let orgUnitId: string | null;
    const mode = work.workTypeVersion.finalClosureMode;

    if (mode === WorkFinalClosureMode.OFFICE_HEAD) {
      leadershipType = OrgLeadershipType.OFFICE_HEAD;
      orgUnitId = null;
    } else if (mode === WorkFinalClosureMode.PRIMARY_OWNER_HEAD) {
      if (!work.primaryOwnerOrgUnitId) {
        throw new ConflictException('The Work primary owner is missing.');
      }
      leadershipType = OrgLeadershipType.ORG_UNIT_HEAD;
      orgUnitId = work.primaryOwnerOrgUnitId;
    } else {
      const configured = work.workTypeVersion.finalClosureLeadershipType;
      if (!configured) {
        throw new ConflictException(
          'The configured final-closure leadership type is missing.',
        );
      }
      leadershipType = configured;
      if (configured === OrgLeadershipType.OFFICE_HEAD) {
        orgUnitId = null;
      } else {
        if (!work.primaryOwnerOrgUnitId) {
          throw new ConflictException('The Work primary owner is missing.');
        }
        orgUnitId = work.primaryOwnerOrgUnitId;
      }
    }

    const assignment = await tx.orgLeadershipAssignment.findFirst({
      where: {
        employeeId,
        officeId: work.officeId,
        orgUnitId,
        leadershipType,
        effectiveFrom: { lte: at },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException(
        'You are not the configured current final-closure authority for this Work.',
      );
    }
  }

  private async assertCurrentOfficeHead(
    tx: Prisma.TransactionClient,
    user: AuthenticatedUser,
    officeId: string,
    at: Date,
    action: 'cancel' | 'reopen',
  ): Promise<void> {
    if (user.role === AccountRole.SUPER_ADMIN) {
      throw new ForbiddenException(
        `System administrators cannot ${action} operational Work.`,
      );
    }

    const account = await tx.account.findFirst({
      where: {
        id: user.accountId,
        isEnabled: true,
        role: { not: AccountRole.SUPER_ADMIN },
        employee: {
          is: {
            status: EmployeeStatus.ACTIVE,
            employmentStatus: EmploymentStatus.ACTIVE,
            archivedAt: null,
          },
        },
      },
      select: { employee: { select: { id: true } } },
    });
    const employeeId = account?.employee?.id;
    if (!employeeId) {
      throw new ForbiddenException(
        `Only the current Office Head can ${action} this Work.`,
      );
    }

    const leadership = await tx.orgLeadershipAssignment.findFirst({
      where: {
        employeeId,
        officeId,
        orgUnitId: null,
        leadershipType: OrgLeadershipType.OFFICE_HEAD,
        effectiveFrom: { lte: at },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: at } }],
      },
      select: { id: true },
    });
    if (!leadership) {
      throw new ForbiddenException(
        `Only the current Office Head can ${action} this Work.`,
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
    if (canExecute && stage.status === WorkStageStatus.RETURNED) {
      actions.push('RESUME');
    }
    if (
      stage.status === WorkStageStatus.SUBMITTED &&
      stage.approvalMode !== WorkStageApprovalMode.NONE &&
      (await this.canReviewStage(user, stage))
    ) {
      actions.push('APPROVE', 'RETURN');
    }
    return actions;
  }

  private async canReviewStage(
    user: AuthenticatedUser,
    stage: RuntimeStage,
  ): Promise<boolean> {
    if (
      user.role === AccountRole.SUPER_ADMIN ||
      stage.status !== WorkStageStatus.SUBMITTED ||
      stage.approvalMode === WorkStageApprovalMode.NONE
    ) {
      return false;
    }

    if (
      !(await this.authorization.can(
        user,
        CAPABILITIES.WORK_APPROVE_STAGE,
        stage.workItem.officeId!,
        stage.responsibleOrgUnitId,
      ))
    ) {
      return false;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.assertApprovalAuthority(tx, user, stage, new Date());
      });
      return true;
    } catch (error) {
      if (
        error instanceof ForbiddenException ||
        error instanceof ConflictException
      ) {
        return false;
      }
      throw error;
    }
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
      select: {
        runtimeStatus: true,
        version: true,
        workTypeVersion: { select: { finalClosureMode: true } },
      },
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
      select: { status: true, isRequired: true },
    });
    const statuses = stages.map((stage) => stage.status);

    const allRequiredStagesSettled = stages
      .filter((stage) => stage.isRequired)
      .every(
        (stage) =>
          stage.status === WorkStageStatus.COMPLETED ||
          stage.status === WorkStageStatus.SKIPPED,
      );
    if (
      allRequiredStagesSettled &&
      work.workTypeVersion?.finalClosureMode ===
        WorkFinalClosureMode.AUTO_AFTER_REQUIRED_STAGES
    ) {
      const now = new Date();
      const completion = await tx.workItem.updateMany({
        where: {
          id: workItemId,
          version: work.version,
          runtimeStatus: work.runtimeStatus,
        },
        data: {
          runtimeStatus: WorkRuntimeStatus.COMPLETED,
          completedAt: now,
          closedAt: now,
          cancelledAt: null,
          version: { increment: 1 },
        },
      });
      if (completion.count !== 1) {
        throw new ConflictException(
          'Work changed while automatic completion was being applied. Refresh and try again.',
        );
      }
      await tx.workEvent.create({
        data: {
          workItemId,
          actorAccountId,
          eventType: WorkEventType.WORK_COMPLETED,
          fromWorkStatus: work.runtimeStatus,
          toWorkStatus: WorkRuntimeStatus.COMPLETED,
          details: { automatic: true },
        },
      });
      return;
    }

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

  private async releaseDependentStages(
    tx: Prisma.TransactionClient,
    workItemId: string,
    settledStageDefinitionId: string,
    actorAccountId: string,
    at: Date,
  ): Promise<void> {
    const queue = [settledStageDefinitionId];

    while (queue.length > 0) {
      const prerequisiteStageId = queue.shift()!;
      const dependents = await tx.workStageDependency.findMany({
        where: { prerequisiteStageId },
        select: { stageDefinitionId: true },
      });

      for (const dependent of dependents) {
        const stage = await tx.workStage.findFirst({
          where: {
            workItemId,
            stageDefinitionId: dependent.stageDefinitionId,
          },
          select: {
            id: true,
            stageDefinitionId: true,
            status: true,
            version: true,
            activationMode: true,
            activationFieldCode: true,
            activationExpectedValue: true,
            slaMinutes: true,
          },
        });
        if (!stage || stage.status !== WorkStageStatus.PENDING) {
          continue;
        }

        const dependencies = await tx.workStageDependency.findMany({
          where: { stageDefinitionId: stage.stageDefinitionId },
          select: { prerequisiteStageId: true },
        });
        const prerequisiteIds = dependencies.map(
          (dependency) => dependency.prerequisiteStageId,
        );
        const prerequisiteStages = await tx.workStage.findMany({
          where: {
            workItemId,
            stageDefinitionId: { in: prerequisiteIds },
          },
          select: { stageDefinitionId: true, status: true },
        });
        if (prerequisiteStages.length !== prerequisiteIds.length) {
          throw new ConflictException(
            'The Work runtime dependency graph is incomplete.',
          );
        }
        if (
          !prerequisiteStages.every(
            (prerequisite) =>
              prerequisite.status === WorkStageStatus.COMPLETED ||
              prerequisite.status === WorkStageStatus.SKIPPED,
          )
        ) {
          continue;
        }

        const activation = await this.resolveDependentActivation(
          tx,
          workItemId,
          stage.activationMode,
          stage.activationFieldCode,
          stage.activationExpectedValue,
        );
        if (activation === 'DEFERRED') {
          continue;
        }

        const nextStatus =
          activation === 'READY'
            ? WorkStageStatus.READY
            : WorkStageStatus.SKIPPED;
        const readyAt = nextStatus === WorkStageStatus.READY ? at : null;
        const dueAt =
          readyAt && stage.slaMinutes
            ? new Date(readyAt.getTime() + stage.slaMinutes * 60_000)
            : null;
        const claim = await tx.workStage.updateMany({
          where: {
            id: stage.id,
            version: stage.version,
            status: WorkStageStatus.PENDING,
          },
          data: {
            status: nextStatus,
            readyAt,
            dueAt,
            version: { increment: 1 },
          },
        });
        if (claim.count !== 1) {
          throw new ConflictException(
            'A dependent stage changed while dependencies were being released. Refresh and try again.',
          );
        }

        await tx.workEvent.create({
          data: {
            workItemId,
            workStageId: stage.id,
            actorAccountId,
            eventType:
              nextStatus === WorkStageStatus.READY
                ? WorkEventType.STAGE_READY
                : WorkEventType.STAGE_SKIPPED,
            fromStageStatus: WorkStageStatus.PENDING,
            toStageStatus: nextStatus,
            details: { releasedByStageDefinitionId: prerequisiteStageId },
          },
        });

        if (nextStatus === WorkStageStatus.SKIPPED) {
          queue.push(stage.stageDefinitionId);
        }
      }
    }
  }

  private async resolveDependentActivation(
    tx: Prisma.TransactionClient,
    workItemId: string,
    activationMode: WorkStageActivationMode,
    activationFieldCode: string | null,
    activationExpectedValue: Prisma.JsonValue | null,
  ): Promise<'READY' | 'SKIPPED' | 'DEFERRED'> {
    if (activationMode === WorkStageActivationMode.ALWAYS) {
      return 'READY';
    }
    if (activationMode === WorkStageActivationMode.MANUAL_WHEN_REQUIRED) {
      return 'DEFERRED';
    }
    if (!activationFieldCode) {
      throw new ConflictException(
        'A conditional runtime stage is missing its activation field.',
      );
    }

    const fieldValue = await tx.workFieldValue.findFirst({
      where: {
        workItemId,
        fieldDefinition: { code: activationFieldCode },
      },
      select: { value: true },
    });
    if (!fieldValue) {
      return 'DEFERRED';
    }

    if (activationMode === WorkStageActivationMode.FIELD_TRUE) {
      return fieldValue.value === true ? 'READY' : 'SKIPPED';
    }

    return stableJson(fieldValue.value) === stableJson(activationExpectedValue)
      ? 'READY'
      : 'SKIPPED';
  }

  private normalizeTake(take: number): number {
    return Math.min(Math.max(Math.trunc(take || 50), 1), 100);
  }
}
