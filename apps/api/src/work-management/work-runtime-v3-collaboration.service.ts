import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../database/prisma.service';
import {
  WorkCollaborationStatus,
  WorkEventType,
  WorkItemStatus,
  WorkParticipantRole,
  WorkRuntimeStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import type {
  CancelWorkRuntimeV3CollaborationDto,
  CreateWorkRuntimeV3CollaborationRequestDto,
  DeclineWorkRuntimeV3CollaborationDto,
  WorkRuntimeV3CollaborationMutationDto,
} from './dto/work-runtime-v3-collaboration.dto';
import { WorkRuntimeV3Service } from './work-runtime-v3.service';

const ACTIVE_COLLABORATION_STATUSES = [
  WorkCollaborationStatus.REQUESTED,
  WorkCollaborationStatus.ACCEPTED,
  WorkCollaborationStatus.IN_PROGRESS,
] as const;

const COLLABORATION_SELECT = {
  id: true,
  workItemId: true,
  workStageId: true,
  participantId: true,
  sourceOrgUnitId: true,
  requestedOrgUnitId: true,
  requestedByAccountId: true,
  respondedByAccountId: true,
  cancelledByAccountId: true,
  status: true,
  purpose: true,
  neededBy: true,
  responseReason: true,
  cancellationReason: true,
  respondedAt: true,
  startedAt: true,
  completedAt: true,
  cancelledAt: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  sourceOrgUnit: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  requestedOrgUnit: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  requestedBy: {
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
  respondedBy: {
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
  cancelledBy: {
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
  workItem: {
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      runtimeStatus: true,
      primaryOwnerOrgUnitId: true,
      dueAt: true,
    },
  },
  workStage: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
    },
  },
} satisfies Prisma.WorkCollaborationRequestSelect;

type CollaborationRequest = Prisma.WorkCollaborationRequestGetPayload<{
  select: typeof COLLABORATION_SELECT;
}>;

@Injectable()
export class WorkRuntimeV3CollaborationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
    private readonly workRuntime: WorkRuntimeV3Service,
  ) {}

  async request(
    user: AuthenticatedUser,
    officeId: string,
    workItemId: string,
    dto: CreateWorkRuntimeV3CollaborationRequestDto,
  ) {
    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_REQUEST_PARTICIPANT,
      officeId,
      dto.sourceOrgUnitId,
    );

    const requestId = await this.prisma.$transaction(async (tx) => {
      await this.lockWork(tx, officeId, workItemId);
      const work = await this.requireOperationalWork(tx, officeId, workItemId);

      if (dto.sourceOrgUnitId === dto.requestedOrgUnitId) {
        throw new BadRequestException(
          'Source and requested OrgUnits must be different.',
        );
      }

      const sourceParticipant = await tx.workOrgUnitParticipant.findFirst({
        where: {
          workItemId,
          orgUnitId: dto.sourceOrgUnitId,
          endedAt: null,
          role: { not: WorkParticipantRole.OBSERVER },
        },
        select: { id: true },
      });
      if (!sourceParticipant) {
        throw new ForbiddenException(
          'Only an active Work participant OrgUnit can request cross-OrgUnit support.',
        );
      }

      const requestedOrgUnit = await tx.orgUnit.findFirst({
        where: {
          id: dto.requestedOrgUnitId,
          officeId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!requestedOrgUnit) {
        throw new BadRequestException(
          'Requested OrgUnit must be active and belong to this Office.',
        );
      }

      const existingParticipant = await tx.workOrgUnitParticipant.findFirst({
        where: {
          workItemId,
          orgUnitId: dto.requestedOrgUnitId,
          endedAt: null,
        },
        select: { id: true },
      });
      if (existingParticipant) {
        throw new ConflictException(
          'Requested OrgUnit is already an active participant in this Work.',
        );
      }

      const existingRequest = await tx.workCollaborationRequest.findFirst({
        where: {
          workItemId,
          requestedOrgUnitId: dto.requestedOrgUnitId,
          status: { in: [...ACTIVE_COLLABORATION_STATUSES] },
        },
        select: { id: true },
      });
      if (existingRequest) {
        throw new ConflictException(
          'An active collaboration request already exists for this OrgUnit.',
        );
      }

      const now = new Date();
      const neededBy = dto.neededBy
        ? this.parseFutureDate(dto.neededBy, now, 'Needed by')
        : null;
      const purpose = dto.purpose.trim();
      if (purpose.length < 2) {
        throw new BadRequestException('Collaboration purpose is required.');
      }

      const request = await tx.workCollaborationRequest.create({
        data: {
          workItemId,
          sourceOrgUnitId: dto.sourceOrgUnitId,
          requestedOrgUnitId: dto.requestedOrgUnitId,
          requestedByAccountId: user.accountId,
          status: WorkCollaborationStatus.REQUESTED,
          purpose,
          neededBy,
        },
        select: { id: true },
      });

      await tx.workEvent.create({
        data: {
          workItemId,
          actorAccountId: user.accountId,
          eventType: WorkEventType.COLLABORATION_REQUESTED,
          details: {
            collaborationRequestId: request.id,
            sourceOrgUnitId: dto.sourceOrgUnitId,
            requestedOrgUnitId: dto.requestedOrgUnitId,
            purpose,
            neededBy: neededBy?.toISOString() ?? null,
            workRuntimeStatus: work.runtimeStatus,
          },
        },
      });

      return request.id;
    });

    return this.getDecoratedRequest(user, officeId, requestId);
  }

  async accept(
    user: AuthenticatedUser,
    officeId: string,
    requestId: string,
    dto: WorkRuntimeV3CollaborationMutationDto,
  ) {
    const authorizationTarget = await this.requireAuthorizationTarget(
      officeId,
      requestId,
    );
    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_ACCEPT_PARTICIPANT,
      officeId,
      authorizationTarget.requestedOrgUnitId,
    );

    await this.prisma.$transaction(async (tx) => {
      const request = await this.requireRequest(tx, officeId, requestId);
      this.assertExpectedVersion(request, dto.expectedVersion);
      if (request.status !== WorkCollaborationStatus.REQUESTED) {
        throw new ConflictException(
          `Only a REQUESTED collaboration can be accepted; it is ${request.status}.`,
        );
      }

      await this.lockWork(tx, officeId, request.workItemId);
      await this.requireOperationalWork(tx, officeId, request.workItemId);
      await this.assertSourceParticipantStillActive(tx, request);

      const requestedOrgUnit = await tx.orgUnit.findFirst({
        where: {
          id: request.requestedOrgUnitId,
          officeId,
          isActive: true,
        },
        select: { id: true },
      });
      if (!requestedOrgUnit) {
        throw new ConflictException(
          'The requested OrgUnit is no longer active in this Office.',
        );
      }

      const alreadyParticipating = await tx.workOrgUnitParticipant.findFirst({
        where: {
          workItemId: request.workItemId,
          orgUnitId: request.requestedOrgUnitId,
          endedAt: null,
        },
        select: { id: true },
      });
      if (alreadyParticipating) {
        throw new ConflictException(
          'The requested OrgUnit already participates in this Work.',
        );
      }

      const now = new Date();
      const participant = await tx.workOrgUnitParticipant.create({
        data: {
          workItemId: request.workItemId,
          orgUnitId: request.requestedOrgUnitId,
          role: WorkParticipantRole.SUPPORTING_PARTICIPANT,
          addedByAccountId: user.accountId,
          startedAt: now,
        },
        select: { id: true },
      });

      const claimed = await tx.workCollaborationRequest.updateMany({
        where: {
          id: request.id,
          version: dto.expectedVersion,
          status: WorkCollaborationStatus.REQUESTED,
        },
        data: {
          participantId: participant.id,
          status: WorkCollaborationStatus.ACCEPTED,
          respondedByAccountId: user.accountId,
          respondedAt: now,
          responseReason: null,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'The collaboration request changed while it was being accepted. Refresh and try again.',
        );
      }

      await tx.workEvent.createMany({
        data: [
          {
            workItemId: request.workItemId,
            actorAccountId: user.accountId,
            eventType: WorkEventType.COLLABORATION_ACCEPTED,
            details: {
              collaborationRequestId: request.id,
              sourceOrgUnitId: request.sourceOrgUnitId,
              requestedOrgUnitId: request.requestedOrgUnitId,
            },
          },
          {
            workItemId: request.workItemId,
            actorAccountId: user.accountId,
            eventType: WorkEventType.PARTICIPANT_ADDED,
            details: {
              collaborationRequestId: request.id,
              participantId: participant.id,
              orgUnitId: request.requestedOrgUnitId,
              role: WorkParticipantRole.SUPPORTING_PARTICIPANT,
              source: 'COLLABORATION_ACCEPTED',
            },
          },
        ],
      });
    });

    return this.getDecoratedRequest(user, officeId, requestId);
  }

  async decline(
    user: AuthenticatedUser,
    officeId: string,
    requestId: string,
    dto: DeclineWorkRuntimeV3CollaborationDto,
  ) {
    const authorizationTarget = await this.requireAuthorizationTarget(
      officeId,
      requestId,
    );
    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_ACCEPT_PARTICIPANT,
      officeId,
      authorizationTarget.requestedOrgUnitId,
    );

    const reason = dto.reason.trim();
    if (reason.length < 2) {
      throw new BadRequestException('A decline reason is required.');
    }

    await this.prisma.$transaction(async (tx) => {
      const request = await this.requireRequest(tx, officeId, requestId);
      this.assertExpectedVersion(request, dto.expectedVersion);
      if (request.status !== WorkCollaborationStatus.REQUESTED) {
        throw new ConflictException(
          `Only a REQUESTED collaboration can be declined; it is ${request.status}.`,
        );
      }

      await this.lockWork(tx, officeId, request.workItemId);
      await this.requireOperationalWork(tx, officeId, request.workItemId);
      await this.assertSourceParticipantStillActive(tx, request);

      const now = new Date();
      const claimed = await tx.workCollaborationRequest.updateMany({
        where: {
          id: request.id,
          version: dto.expectedVersion,
          status: WorkCollaborationStatus.REQUESTED,
        },
        data: {
          status: WorkCollaborationStatus.DECLINED,
          respondedByAccountId: user.accountId,
          respondedAt: now,
          responseReason: reason,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'The collaboration request changed while it was being declined. Refresh and try again.',
        );
      }

      await tx.workEvent.create({
        data: {
          workItemId: request.workItemId,
          actorAccountId: user.accountId,
          eventType: WorkEventType.COLLABORATION_DECLINED,
          details: {
            collaborationRequestId: request.id,
            sourceOrgUnitId: request.sourceOrgUnitId,
            requestedOrgUnitId: request.requestedOrgUnitId,
            reason,
          },
        },
      });
    });

    return this.getDecoratedRequest(user, officeId, requestId);
  }

  async cancel(
    user: AuthenticatedUser,
    officeId: string,
    requestId: string,
    dto: CancelWorkRuntimeV3CollaborationDto,
  ) {
    const authorizationTarget = await this.requireAuthorizationTarget(
      officeId,
      requestId,
    );
    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_REQUEST_PARTICIPANT,
      officeId,
      authorizationTarget.sourceOrgUnitId,
    );

    const reason = dto.reason.trim();
    if (reason.length < 2) {
      throw new BadRequestException('A cancellation reason is required.');
    }

    await this.prisma.$transaction(async (tx) => {
      const request = await this.requireRequest(tx, officeId, requestId);
      this.assertExpectedVersion(request, dto.expectedVersion);
      if (request.status !== WorkCollaborationStatus.REQUESTED) {
        throw new ConflictException(
          `Only a REQUESTED collaboration can be cancelled here; it is ${request.status}.`,
        );
      }

      await this.lockWork(tx, officeId, request.workItemId);
      await this.requireOperationalWork(tx, officeId, request.workItemId);
      await this.assertSourceParticipantStillActive(tx, request);

      const now = new Date();
      const claimed = await tx.workCollaborationRequest.updateMany({
        where: {
          id: request.id,
          version: dto.expectedVersion,
          status: WorkCollaborationStatus.REQUESTED,
        },
        data: {
          status: WorkCollaborationStatus.CANCELLED,
          cancelledByAccountId: user.accountId,
          cancellationReason: reason,
          cancelledAt: now,
          version: { increment: 1 },
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictException(
          'The collaboration request changed while it was being cancelled. Refresh and try again.',
        );
      }

      await tx.workEvent.create({
        data: {
          workItemId: request.workItemId,
          actorAccountId: user.accountId,
          eventType: WorkEventType.COLLABORATION_CANCELLED,
          details: {
            collaborationRequestId: request.id,
            sourceOrgUnitId: request.sourceOrgUnitId,
            requestedOrgUnitId: request.requestedOrgUnitId,
            reason,
          },
        },
      });
    });

    return this.getDecoratedRequest(user, officeId, requestId);
  }

  async listForWork(
    user: AuthenticatedUser,
    officeId: string,
    workItemId: string,
  ) {
    await this.workRuntime.getWork(user, officeId, workItemId);

    const requests = await this.prisma.workCollaborationRequest.findMany({
      where: {
        workItemId,
        workItem: {
          officeId,
          status: WorkItemStatus.V3_RUNTIME,
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: COLLABORATION_SELECT,
    });

    return Promise.all(
      requests.map((request) =>
        this.decorateAvailableActions(user, officeId, request),
      ),
    );
  }

  async listIncoming(
    user: AuthenticatedUser,
    officeId: string,
    take = 50,
  ) {
    const visibleOrgUnitIds = await this.authorization.visibleOrgUnitIds(
      user,
      CAPABILITIES.WORK_ACCEPT_PARTICIPANT,
      officeId,
    );
    if (visibleOrgUnitIds.length === 0) {
      return [];
    }

    const requests = await this.prisma.workCollaborationRequest.findMany({
      where: {
        requestedOrgUnitId: { in: visibleOrgUnitIds },
        status: { in: [...ACTIVE_COLLABORATION_STATUSES] },
        workItem: {
          officeId,
          status: WorkItemStatus.V3_RUNTIME,
          runtimeStatus: {
            notIn: [WorkRuntimeStatus.COMPLETED, WorkRuntimeStatus.CANCELLED],
          },
        },
      },
      orderBy: [{ neededBy: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      take: this.normalizeTake(take),
      select: COLLABORATION_SELECT,
    });

    return Promise.all(
      requests.map((request) =>
        this.decorateAvailableActions(user, officeId, request),
      ),
    );
  }

  private async getDecoratedRequest(
    user: AuthenticatedUser,
    officeId: string,
    requestId: string,
  ) {
    const request = await this.prisma.workCollaborationRequest.findFirst({
      where: {
        id: requestId,
        workItem: {
          officeId,
          status: WorkItemStatus.V3_RUNTIME,
        },
      },
      select: COLLABORATION_SELECT,
    });
    if (!request) {
      throw new NotFoundException('Work collaboration request was not found.');
    }

    return this.decorateAvailableActions(user, officeId, request);
  }

  private async decorateAvailableActions(
    user: AuthenticatedUser,
    officeId: string,
    request: CollaborationRequest,
  ) {
    const availableActions: string[] = [];

    if (request.status === WorkCollaborationStatus.REQUESTED) {
      if (
        await this.authorization.can(
          user,
          CAPABILITIES.WORK_ACCEPT_PARTICIPANT,
          officeId,
          request.requestedOrgUnitId,
        )
      ) {
        availableActions.push('ACCEPT', 'DECLINE');
      }
      if (
        await this.authorization.can(
          user,
          CAPABILITIES.WORK_REQUEST_PARTICIPANT,
          officeId,
          request.sourceOrgUnitId,
        )
      ) {
        availableActions.push('CANCEL');
      }
    }

    return {
      ...request,
      availableActions,
    };
  }

  private async requireAuthorizationTarget(
    officeId: string,
    requestId: string,
  ) {
    const request = await this.prisma.workCollaborationRequest.findFirst({
      where: {
        id: requestId,
        workItem: {
          officeId,
          status: WorkItemStatus.V3_RUNTIME,
        },
      },
      select: {
        sourceOrgUnitId: true,
        requestedOrgUnitId: true,
      },
    });
    if (!request) {
      throw new NotFoundException('Work collaboration request was not found.');
    }
    return request;
  }

  private async requireRequest(
    tx: Prisma.TransactionClient,
    officeId: string,
    requestId: string,
  ) {
    const request = await tx.workCollaborationRequest.findFirst({
      where: {
        id: requestId,
        workItem: {
          officeId,
          status: WorkItemStatus.V3_RUNTIME,
        },
      },
      select: {
        id: true,
        workItemId: true,
        workStageId: true,
        participantId: true,
        sourceOrgUnitId: true,
        requestedOrgUnitId: true,
        status: true,
        version: true,
      },
    });
    if (!request) {
      throw new NotFoundException('Work collaboration request was not found.');
    }
    return request;
  }

  private async requireOperationalWork(
    tx: Prisma.TransactionClient,
    officeId: string,
    workItemId: string,
  ) {
    const work = await tx.workItem.findFirst({
      where: {
        id: workItemId,
        officeId,
        status: WorkItemStatus.V3_RUNTIME,
      },
      select: {
        id: true,
        runtimeStatus: true,
      },
    });
    if (!work?.runtimeStatus) {
      throw new NotFoundException('Native V3 Work was not found.');
    }
    if (
      work.runtimeStatus === WorkRuntimeStatus.COMPLETED ||
      work.runtimeStatus === WorkRuntimeStatus.CANCELLED
    ) {
      throw new ConflictException(
        'Completed or cancelled Work cannot start or change collaboration here.',
      );
    }
    return work;
  }

  private async assertSourceParticipantStillActive(
    tx: Prisma.TransactionClient,
    request: {
      workItemId: string;
      sourceOrgUnitId: string;
    },
  ): Promise<void> {
    const participant = await tx.workOrgUnitParticipant.findFirst({
      where: {
        workItemId: request.workItemId,
        orgUnitId: request.sourceOrgUnitId,
        endedAt: null,
        role: { not: WorkParticipantRole.OBSERVER },
      },
      select: { id: true },
    });
    if (!participant) {
      throw new ConflictException(
        'The requesting OrgUnit is no longer an active operational participant in this Work.',
      );
    }
  }

  private assertExpectedVersion(
    request: { version: number },
    expectedVersion: number,
  ): void {
    if (request.version !== expectedVersion) {
      throw new ConflictException(
        `Collaboration request changed from version ${expectedVersion} to ${request.version}. Refresh and try again.`,
      );
    }
  }

  private async lockWork(
    tx: Prisma.TransactionClient,
    officeId: string,
    workItemId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "work_items"
      WHERE "id" = CAST(${workItemId} AS uuid)
        AND "office_id" = CAST(${officeId} AS uuid)
        AND "status" = 'V3_RUNTIME'
      FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new NotFoundException('Native V3 Work was not found.');
    }
  }

  private parseFutureDate(value: string, now: Date, label: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${label} must be a valid date and time.`);
    }
    if (parsed.getTime() <= now.getTime()) {
      throw new BadRequestException(`${label} must be in the future.`);
    }
    return parsed;
  }

  private normalizeTake(take: number): number {
    if (!Number.isFinite(take)) return 50;
    return Math.max(1, Math.min(Math.trunc(take), 100));
  }
}
