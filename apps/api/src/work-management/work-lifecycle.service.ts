import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { AttachmentSecurityService } from '../attachments/attachment-security.service';
import { AttachmentStorageService } from '../attachments/attachment-storage.service';
import { assertAttachmentFileMatchesDeclaredType } from '../attachments/attachment-file-validation';

import type { AuthenticatedUser } from '../auth/types/auth.types';
import type { UploadedMessageAttachmentFile } from '../conversations/types/uploaded-message-attachment-file';
import { PrismaService } from '../database/prisma.service';
import {
  AccountClass,
  WorkActivityAction,
  WorkAssignmentRole,
  WorkCompletionReviewStatus,
  WorkHelpReason,
  WorkHelpRequestStatus,
  WorkItemStatus,
  WorkSalesCoordinationStatus,
} from '../generated/prisma/client';
import type { Prisma } from '../generated/prisma/client';
import { CancelWorkItemDto } from './dto/cancel-work-item.dto';
import { CompleteSalesWorkDto } from './dto/complete-sales-work.dto';
import { ManageWorkSupportDto } from './dto/manage-work-support.dto';
import { ReassignWorkDto } from './dto/reassign-work.dto';
import { ReviewWorkCompletionDto } from './dto/review-work-completion.dto';
import { SendWorkToSalesDto } from './dto/send-work-to-sales.dto';
import { SubmitWorkCompletionDto } from './dto/submit-work-completion.dto';
import { RequestWorkHelpDto } from './dto/request-work-help.dto';
import { RespondWorkHelpDto } from './dto/respond-work-help.dto';
import {
  workAccountSummarySelect,
  workCompatibilityDetailSelect,
} from './work-compatibility-selects';
import { DutyAvailabilityService } from './duty-availability.service';
import { WorkNotificationsService } from './work-notifications.service';
import { WorkScopeService, type WorkActorContext } from './work-scope.service';
import { WorkStatusTransitionService } from './work-status-transition.service';
import {
  MAX_WORK_COMPLETION_ATTACHMENT_FILES,
  MAX_WORK_COMPLETION_ATTACHMENT_FILE_BYTES,
  MAX_WORK_COMPLETION_ATTACHMENT_TOTAL_BYTES,
  WORK_COMPLETION_ATTACHMENT_MIME_TYPES,
} from './work-completion-attachment.constants';
import { workAttachmentExpiresAt } from './work-attachment-retention.constants';
import {
  assertWorkIdentityFieldValues,
  normalizeReferenceValue,
  validateWorkCompletionFields,
  type ValidatedWorkCompletionFieldSet,
  type WorkFieldInput,
} from './work-field-validator';
import { isWorkSystemControlledFieldCode } from './work-foundation.constants';

const lifecycleCurrentSelect = {
  id: true,
  ticketNumber: true,
  title: true,
  status: true,
  version: true,
  officeId: true,
  primaryOwnerOrgUnitId: true,
  assignedOperationalTeamId: true,
  responsibleReviewerAccountId: true,
  salesMemberAccountId: true,
  salesCoordinationStatus: true,
  archiveEligibleAt: true,
  workTypeVersion: {
    select: {
      id: true,
      version: true,
      workTypeDefinition: { select: { code: true } },
      fields: {
        orderBy: { sortOrder: 'asc' as const },
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
  },
  fieldValues: {
    where: { workStageId: null },
    select: {
      fieldDefinitionId: true,
      value: true,
      fieldDefinition: { select: { code: true } },
    },
  },
  assignments: {
    where: {
      endedAt: null,
    },
    select: {
      id: true,
      assigneeAccountId: true,
      assignmentRole: true,
      acknowledgedAt: true,
      startedAt: true,
    },
  },
  completionReports: {
    orderBy: {
      createdAt: 'desc',
    },
    take: 1,
    select: {
      id: true,
      reviewStatus: true,
      customerId: true,
      rxLevelDbm: true,
    },
  },
  childWorkItems: {
    where: {
      status: {
        notIn: [WorkItemStatus.CLOSED, WorkItemStatus.CANCELLED],
      },
    },
    orderBy: { dueAt: 'desc' },
    take: 1,
    select: { id: true, dueAt: true },
  },
} satisfies Prisma.WorkItemSelect;

function helpReasonLabel(reason: WorkHelpReason): string {
  switch (reason) {
    case WorkHelpReason.NEED_ANOTHER_EMPLOYEE:
      return 'Need another employee';
    case WorkHelpReason.TECHNICAL_GUIDANCE:
      return 'Need technical guidance';
    case WorkHelpReason.TOOLS_OR_MATERIALS:
      return 'Need tools or materials';
    case WorkHelpReason.FAP_MAINTENANCE:
      return 'FAP maintenance';
    case WorkHelpReason.SAFETY_CONCERN:
      return 'Safety problem';
    case WorkHelpReason.OTHER:
      return 'Other problem';
  }
}

function helpMaterialLabel(
  materialType: RequestWorkHelpDto['materialType'],
): string | null {
  if (materialType === 'STB') return 'STB';
  if (materialType === 'CPE') return 'CPE';
  if (materialType === 'DROP_FIBER') return 'Drop fiber';
  return null;
}

type LifecycleCurrentWorkItemPayload = Prisma.WorkItemGetPayload<{
  select: typeof lifecycleCurrentSelect;
}>;

type LifecycleCurrentWorkItem = LifecycleCurrentWorkItemPayload;

type WorkItemDetailPayload = Prisma.WorkItemGetPayload<{
  select: typeof workCompatibilityDetailSelect;
}>;

type WorkItemDetail = WorkItemDetailPayload;

type WorkDatabaseClient = Pick<Prisma.TransactionClient, 'workItem'>;

const completionReportSelect = {
  id: true,
  result: true,
  summary: true,
  cpcSerial: true,
  serviceNumber: true,
  customerId: true,
  rxLevelDbm: true,
  olt: true,
  fdcName: true,
  fapName: true,
  moreWorkRequired: true,
  fieldValuesSnapshot: true,
  reviewStatus: true,
  managerNote: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
  submittedBy: {
    select: workAccountSummarySelect,
  },
  reviewedBy: {
    select: workAccountSummarySelect,
  },
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
} satisfies Prisma.WorkCompletionReportSelect;

const helpRequestSelect = {
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
  requestedBy: {
    select: workAccountSummarySelect,
  },
  requestedHelper: {
    select: workAccountSummarySelect,
  },
  respondedBy: {
    select: workAccountSummarySelect,
  },
  coordinatedBy: {
    select: workAccountSummarySelect,
  },
  coordinatedAt: true,
  workItem: {
    select: {
      id: true,
      ticketNumber: true,
      title: true,
      status: true,
      dueAt: true,
    },
  },
} satisfies Prisma.WorkHelpRequestSelect;

function parseCompletionFieldInputs(value: unknown): WorkFieldInput[] {
  if (value === undefined || value === null || value === '') return [];

  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      throw new BadRequestException('Completion fields must be valid JSON.');
    }
  }

  if (!Array.isArray(parsed)) {
    throw new BadRequestException('Completion fields must be an array.');
  }

  return parsed.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new BadRequestException(
        'Each completion field must contain a code and value.',
      );
    }
    const code = (item as Record<string, unknown>).code;
    if (typeof code !== 'string' || !code.trim()) {
      throw new BadRequestException(
        'Each completion field must contain a field code.',
      );
    }
    return {
      code: code.trim(),
      value: (item as Record<string, unknown>).value,
    };
  });
}

function completionSnapshotValue(
  values: Array<{ code: string; value: unknown }>,
): Prisma.InputJsonValue {
  return values.map((item) => ({
    code: item.code,
    value: item.value,
  })) as unknown as Prisma.InputJsonValue;
}

@Injectable()
export class WorkLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workScopeService: WorkScopeService,
    private readonly statusTransitions: WorkStatusTransitionService,
    private readonly workNotifications: WorkNotificationsService,
    private readonly dutyAvailability: DutyAvailabilityService,
    private readonly attachmentStorage: AttachmentStorageService,
    private readonly attachmentSecurity: AttachmentSecurityService,
  ) {}

  async requestHelp(
    user: AuthenticatedUser,
    workItemId: string,
    dto: RequestWorkHelpDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const visible = await this.findVisibleCurrent(
      this.prisma,
      actor,
      workItemId,
    );
    const primary = this.getPrimaryAssignmentForActor(visible, actor.accountId);

    if (!primary?.startedAt) {
      throw new ForbiddenException(
        'Only the active primary assignee can request help after starting the work.',
      );
    }

    if (!visible.officeId || !visible.primaryOwnerOrgUnitId) {
      throw new ConflictException(
        'This work item must be reconciled to a V3 Office and OrgUnit before help can be requested.',
      );
    }

    if (dto.reason === WorkHelpReason.SAFETY_CONCERN) {
      throw new BadRequestException(
        'Safety problem is no longer an available Need Help reason.',
      );
    }

    if (dto.reason === WorkHelpReason.TOOLS_OR_MATERIALS && !dto.materialType) {
      throw new BadRequestException(
        'Choose STB, CPE or Drop Fiber for tools or materials help.',
      );
    }

    if (dto.reason !== WorkHelpReason.TOOLS_OR_MATERIALS && dto.materialType) {
      throw new BadRequestException(
        'The tools or materials selection applies only to Need tools or materials.',
      );
    }

    const helper = dto.requestedHelperAccountId
      ? await this.workScopeService.resolveHelpCandidate(
          actor,
          dto.requestedHelperAccountId,
          visible.primaryOwnerOrgUnitId,
        )
      : null;

    if (helper) {
      await this.dutyAvailability.assertCanReceiveDirectHelp(
        helper.id,
        visible.primaryOwnerOrgUnitId,
      );
    }

    if (
      helper &&
      visible.assignments.some(
        (assignment) => assignment.assigneeAccountId === helper.id,
      )
    ) {
      throw new ConflictException(
        'The selected employee is already assigned to this work item.',
      );
    }

    const result = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const current = await this.findVisibleCurrent(
          transaction,
          actor,
          workItemId,
        );
        const currentPrimary = this.getRequiredPrimaryAssignment(
          current,
          actor.accountId,
        );

        if (!currentPrimary.startedAt) {
          throw new ForbiddenException(
            'Only the active primary assignee can request help after starting the work.',
          );
        }

        if (
          helper &&
          current.assignments.some(
            (assignment) => assignment.assigneeAccountId === helper.id,
          )
        ) {
          throw new ConflictException(
            'The selected employee is already assigned to this work item.',
          );
        }

        const duplicatePendingRequest =
          await transaction.workHelpRequest.findFirst({
            where: {
              workItemId: current.id,
              requestedByAccountId: actor.accountId,
              requestedHelperAccountId: helper?.id ?? null,
              status: WorkHelpRequestStatus.PENDING,
            },
            select: { id: true },
          });

        if (duplicatePendingRequest) {
          throw new ConflictException(
            helper
              ? 'A pending help request has already been sent to this employee.'
              : 'Management has already been notified that help is required.',
          );
        }

        const nextStatus = this.statusTransitions.getStatusAfterHelpRequest(
          current.status,
        );
        const note = this.normalizeOptionalText(dto.note);
        const helpRequest = await transaction.workHelpRequest.create({
          data: {
            workItemId: current.id,
            requestedByAccountId: actor.accountId,
            requestedHelperAccountId: helper?.id ?? null,
            reason: dto.reason,
            materialType: dto.materialType ?? null,
            note,
            previousStatus: current.status,
          },
          select: helpRequestSelect,
        });

        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
          },
          data: {
            status: nextStatus,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);

        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.HELP_REQUESTED,
            fromStatus: current.status,
            toStatus: nextStatus,
            details: {
              helpRequestId: helpRequest.id,
              reason: dto.reason,
              materialType: dto.materialType ?? null,
              requestedHelperAccountId: helper?.id ?? null,
              orgUnitId: current.primaryOwnerOrgUnitId,
              note,
            },
          },
        });

        return {
          helpRequest,
          workItem: await this.findDetail(transaction, current.id),
        };
      },
    );

    const reasonLabel = helpReasonLabel(dto.reason);
    const materialLabel = helpMaterialLabel(dto.materialType);
    const purpose = materialLabel
      ? `${reasonLabel} · ${materialLabel}`
      : reasonLabel;

    await this.notify(result.workItem, actor.accountId, 'HELP_REQUESTED', {
      title: 'Help requested for work',
      body: `${result.workItem.ticketNumber}: ${purpose}`,
      extraRecipients: [
        ...(helper ? [helper.id] : []),
        ...(visible.responsibleReviewerAccountId
          ? [visible.responsibleReviewerAccountId]
          : []),
      ],
      metadata: {
        helpRequestId: result.helpRequest.id,
        orgUnitId: visible.primaryOwnerOrgUnitId,
        reason: dto.reason,
        ...(dto.materialType ? { materialType: dto.materialType } : {}),
      },
    });

    return {
      message: helper
        ? 'Help request sent successfully.'
        : 'Your responsible manager has been notified that help is required.',
      ...result,
    };
  }

  async respondToHelpRequest(
    user: AuthenticatedUser,
    helpRequestId: string,
    dto: RespondWorkHelpDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);

    if (dto.accept) {
      const pendingRequest = await this.prisma.workHelpRequest.findUnique({
        where: { id: helpRequestId },
        select: {
          status: true,
          requestedHelperAccountId: true,
          workItem: { select: { primaryOwnerOrgUnitId: true } },
        },
      });

      if (
        pendingRequest?.status === WorkHelpRequestStatus.PENDING &&
        pendingRequest.requestedHelperAccountId === actor.accountId
      ) {
        const orgUnitId = pendingRequest.workItem.primaryOwnerOrgUnitId;
        if (!orgUnitId) {
          throw new ConflictException(
            'This work item must be reconciled to a V3 OrgUnit before direct help can be accepted.',
          );
        }
        await this.dutyAvailability.assertCanReceiveDirectHelp(
          actor.accountId,
          orgUnitId,
        );
      }
    }

    const result = await this.prisma.$transaction(
      async (transaction: Prisma.TransactionClient) => {
        const request = await transaction.workHelpRequest.findUnique({
          where: { id: helpRequestId },
          select: {
            id: true,
            status: true,
            workItemId: true,
            requestedByAccountId: true,
            requestedHelperAccountId: true,
            workItem: {
              select: lifecycleCurrentSelect,
            },
          },
        });

        if (!request) {
          throw new NotFoundException('Help request was not found.');
        }

        if (request.requestedHelperAccountId !== actor.accountId) {
          throw new ForbiddenException(
            'Only the selected supporting employee can respond to this help request.',
          );
        }

        if (request.status !== WorkHelpRequestStatus.PENDING) {
          throw new ConflictException(
            'This help request has already been answered.',
          );
        }

        const current = request.workItem;
        this.statusTransitions.assertCanRespondToHelpRequest(current.status);
        const responseNote = this.normalizeOptionalText(dto.note);
        const respondedAt = new Date();

        if (!dto.accept) {
          await transaction.workHelpRequest.update({
            where: { id: request.id },
            data: {
              status: WorkHelpRequestStatus.DECLINED,
              respondedByAccountId: actor.accountId,
              responseNote,
              respondedAt,
            },
          });
          const update = await transaction.workItem.updateMany({
            where: {
              id: current.id,
              version: current.version,
            },
            data: { version: { increment: 1 } },
          });
          this.assertSingleUpdate(update.count);
          await transaction.workActivity.create({
            data: {
              workItemId: current.id,
              actorAccountId: actor.accountId,
              action: WorkActivityAction.HELP_DECLINED,
              fromStatus: current.status,
              toStatus: current.status,
              details: {
                helpRequestId: request.id,
                responseNote,
              },
            },
          });

          return {
            accepted: false,
            workItem: await this.findDetail(transaction, current.id),
          };
        }

        const nextStatus = this.statusTransitions.getStatusAfterHelpAccepted(
          current.status,
        );
        const alreadyAssigned = current.assignments.some(
          (assignment) => assignment.assigneeAccountId === actor.accountId,
        );

        if (!alreadyAssigned) {
          await transaction.workAssignment.create({
            data: {
              workItemId: current.id,
              assigneeAccountId: actor.accountId,
              assignmentRole: WorkAssignmentRole.SUPPORTING,
              assignedByAccountId: request.requestedByAccountId,
              acknowledgedAt: respondedAt,
            },
          });
        }

        await transaction.workHelpRequest.update({
          where: { id: request.id },
          data: {
            status: WorkHelpRequestStatus.ACCEPTED,
            respondedByAccountId: actor.accountId,
            responseNote,
            respondedAt,
          },
        });
        const update = await transaction.workItem.updateMany({
          where: {
            id: current.id,
            version: current.version,
            status: current.status,
          },
          data: {
            status: nextStatus,
            version: { increment: 1 },
          },
        });
        this.assertSingleUpdate(update.count);

        await transaction.workActivity.createMany({
          data: [
            {
              workItemId: current.id,
              actorAccountId: actor.accountId,
              action: WorkActivityAction.HELP_ACCEPTED,
              fromStatus: current.status,
              toStatus: nextStatus,
              details: {
                helpRequestId: request.id,
                responseNote,
              },
            },
            ...(!alreadyAssigned
              ? [
                  {
                    workItemId: current.id,
                    actorAccountId: actor.accountId,
                    action: WorkActivityAction.SUPPORT_ADDED,
                    fromStatus: current.status,
                    toStatus: nextStatus,
                    details: {
                      assigneeAccountId: actor.accountId,
                      source: 'HELP_REQUEST',
                    },
                  } satisfies Prisma.WorkActivityCreateManyInput,
                ]
              : []),
          ],
        });

        return {
          accepted: true,
          workItem: await this.findDetail(transaction, current.id),
        };
      },
    );

    await this.notify(
      result.workItem,
      actor.accountId,
      result.accepted ? 'HELP_ACCEPTED' : 'HELP_DECLINED',
      {
        title: result.accepted
          ? 'Help request accepted'
          : 'Help request declined',
        body: `${result.workItem.ticketNumber}: ${result.workItem.title}`,
        metadata: { helpRequestId },
      },
    );

    return {
      message: result.accepted
        ? 'You have been added as a supporting employee.'
        : 'Help request declined.',
      workItem: result.workItem,
    };
  }

  async submitCompletion(
    user: AuthenticatedUser,
    workItemId: string,
    dto: SubmitWorkCompletionDto,
    files: UploadedMessageAttachmentFile[] = [],
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const attachments = this.validateCompletionFiles(files);
    const reportId = randomUUID();
    const storedKeys: string[] = [];
    let persisted = false;
    const prepared: Array<{
      id: string;
      storageKey: string;
      originalFileName: string;
      mimeType: string;
      fileSizeBytes: number;
      scanStatus: string;
    }> = [];

    // Scan and stage completion evidence before the database transaction. Any
    // failure below removes these files, so no dangling Work evidence is left.
    try {
      for (const attachment of attachments) {
        const scanStatus = await this.attachmentSecurity.scanValidatedUpload(
          attachment.file,
        );
        const evidenceId = randomUUID();
        const storageKey = `${workItemId}/completion/${reportId}/${evidenceId}-${attachment.originalFileName}`;
        await this.attachmentStorage.writeUploadedFile(
          'work',
          storageKey,
          attachment.file,
        );
        storedKeys.push(storageKey);
        prepared.push({
          id: evidenceId,
          storageKey,
          originalFileName: attachment.originalFileName,
          mimeType: attachment.file.mimetype,
          fileSizeBytes: attachment.file.size,
          scanStatus,
        });
      }

      const result = await this.prisma.$transaction(async (transaction) => {
        const current = await this.findVisibleCurrent(
          transaction,
          actor,
          workItemId,
        );

        if (current.status === WorkItemStatus.COMPLETED_PENDING_REVIEW) {
          const existingReport =
            await transaction.workCompletionReport.findFirst({
              where: {
                workItemId: current.id,
                submittedByAccountId: actor.accountId,
                reviewStatus: WorkCompletionReviewStatus.PENDING_REVIEW,
              },
              orderBy: { createdAt: 'desc' },
              select: completionReportSelect,
            });
          if (existingReport) {
            return {
              report: existingReport,
              workItem: await this.findDetail(transaction, current.id),
              responsibleReviewerAccountId:
                current.responsibleReviewerAccountId,
              alreadySubmitted: true,
            };
          }
        }

        const primary = this.getRequiredPrimaryAssignment(
          current,
          actor.accountId,
        );
        if (!primary.startedAt) {
          throw new ConflictException(
            'Start this Work before submitting completion.',
          );
        }
        if (
          current.salesMemberAccountId &&
          current.salesCoordinationStatus !==
            WorkSalesCoordinationStatus.COMPLETED
        ) {
          throw new ConflictException(
            'Sales coordination must be completed before finishing this Work.',
          );
        }
        this.statusTransitions.assertCanSubmitCompletion(current.status);

        const usesDynamicCompletionFields = dto.fields !== undefined;
        const dynamicCompletionContext = usesDynamicCompletionFields
          ? (() => {
              if (!current.workTypeVersion || !current.officeId) {
                throw new ConflictException(
                  'This historical Work does not have version-bound Information context for dynamic completion.',
                );
              }

              return {
                officeId: current.officeId,
                versionFieldDefinitions: current.workTypeVersion.fields.filter(
                  (field) => !isWorkSystemControlledFieldCode(field.code),
                ),
              };
            })()
          : null;
        const existingValues = current.fieldValues.map((item) => ({
          fieldDefinitionId: item.fieldDefinitionId,
          code: item.fieldDefinition.code,
          value: item.value,
        }));

        const validatedCompletionFields: ValidatedWorkCompletionFieldSet =
          dynamicCompletionContext
            ? validateWorkCompletionFields(
                dynamicCompletionContext.versionFieldDefinitions,
                parseCompletionFieldInputs(dto.fields),
                existingValues,
              )
            : {
                values: [],
                persistedValues: [],
                valuesByCode: new Map<
                  string,
                  ValidatedWorkCompletionFieldSet['values'][number]['value']
                >(),
                identityValues: [],
              };

        if (dynamicCompletionContext) {
          await assertWorkIdentityFieldValues(
            transaction,
            dynamicCompletionContext.officeId,
            new Date(),
            validatedCompletionFields.identityValues,
          );

          for (const field of validatedCompletionFields.persistedValues) {
            await transaction.workFieldValue.upsert({
              where: {
                workItemId_fieldDefinitionId: {
                  workItemId: current.id,
                  fieldDefinitionId: field.fieldDefinitionId,
                },
              },
              create: {
                workItemId: current.id,
                fieldDefinitionId: field.fieldDefinitionId,
                value: field.value,
                updatedByAccountId: actor.accountId,
              },
              update: {
                value: field.value,
                version: { increment: 1 },
                updatedByAccountId: actor.accountId,
              },
            });

            if (
              field.fieldType === 'REFERENCE' &&
              typeof field.value === 'string'
            ) {
              await transaction.workReference.deleteMany({
                where: {
                  workItemId: current.id,
                  sourceFieldDefinitionId: field.fieldDefinitionId,
                },
              });
              await transaction.workReference.create({
                data: {
                  workItemId: current.id,
                  referenceType: field.code,
                  value: field.value,
                  normalizedValue: normalizeReferenceValue(field.value),
                  sourceFieldDefinitionId: field.fieldDefinitionId,
                  createdByAccountId: actor.accountId,
                },
              });
            }
          }
        }

        // Keep the existing completion contract untouched for already-deployed
        // clients and historical Work. Phase B clients always send `fields`
        // (including an empty array), which activates version-bound validation.
        const effectiveCustomerId = usesDynamicCompletionFields
          ? validatedCompletionFields.valuesByCode.get('CUSTOMER_ID')
          : dto.customerId?.trim() || undefined;
        const effectiveRxLevel = usesDynamicCompletionFields
          ? validatedCompletionFields.valuesByCode.get('RX_LEVEL_DBM')
          : dto.rxLevelDbm;
        const snapshotValues = usesDynamicCompletionFields
          ? validatedCompletionFields.values.map((field) => ({
              code: field.code,
              value: field.value,
            }))
          : [
              ...(dto.customerId?.trim()
                ? [{ code: 'CUSTOMER_ID', value: dto.customerId.trim() }]
                : []),
              ...(dto.rxLevelDbm !== undefined
                ? [{ code: 'RX_LEVEL_DBM', value: dto.rxLevelDbm }]
                : []),
            ];

        await transaction.workCompletionReport.create({
          data: {
            id: reportId,
            workItemId: current.id,
            submittedByAccountId: actor.accountId,
            result: dto.result,
            summary: dto.summary.trim(),
            customerId:
              typeof effectiveCustomerId === 'string'
                ? effectiveCustomerId
                : null,
            rxLevelDbm:
              typeof effectiveRxLevel === 'number' ? effectiveRxLevel : null,
            moreWorkRequired: dto.moreWorkRequired,
            fieldValuesSnapshot: completionSnapshotValue(snapshotValues),
          },
          select: { id: true },
        });

        if (prepared.length > 0) {
          await transaction.workEvidence.createMany({
            data: prepared.map((attachment) => ({
              id: attachment.id,
              workItemId: current.id,
              completionReportId: reportId,
              uploadedByAccountId: actor.accountId,
              storageKey: attachment.storageKey,
              originalFileName: attachment.originalFileName,
              mimeType: attachment.mimeType,
              fileSizeBytes: attachment.fileSizeBytes,
              scanStatus: attachment.scanStatus,
            })),
          });
        }

        const report = await transaction.workCompletionReport.findUniqueOrThrow(
          {
            where: { id: reportId },
            select: completionReportSelect,
          },
        );
        const completedAt = new Date();
        await transaction.workItem.update({
          where: { id: current.id },
          data: {
            status: WorkItemStatus.COMPLETED_PENDING_REVIEW,
            completedAt,
            closedAt: null,
            version: { increment: 1 },
          },
        });
        await transaction.workActivity.create({
          data: {
            workItemId: current.id,
            actorAccountId: actor.accountId,
            action: WorkActivityAction.COMPLETION_SUBMITTED,
            fromStatus: current.status,
            toStatus: WorkItemStatus.COMPLETED_PENDING_REVIEW,
            details: {
              completionReportId: report.id,
              evidenceCount: prepared.length,
              completionFieldCodes: snapshotValues.map((field) => field.code),
            },
          },
        });
        return {
          report,
          workItem: await this.findDetail(transaction, current.id),
          responsibleReviewerAccountId: current.responsibleReviewerAccountId,
          alreadySubmitted: false,
        };
      });

      if (result.alreadySubmitted && storedKeys.length > 0) {
        await Promise.all(
          storedKeys.map((storageKey) =>
            this.attachmentStorage.deleteFile('work', storageKey),
          ),
        );
      }

      if (!result.alreadySubmitted) {
        persisted = true;
        await this.notify(
          result.workItem,
          actor.accountId,
          'COMPLETION_SUBMITTED',
          {
            title: 'Work submitted for review',
            body: `${result.workItem.ticketNumber}: ${result.workItem.title}`,
            notificationRecipients: result.responsibleReviewerAccountId
              ? [result.responsibleReviewerAccountId]
              : undefined,
          },
        );
      }
      return {
        message: result.alreadySubmitted
          ? 'Completion is already waiting for Responsible Reviewer approval.'
          : 'Completion submitted to the Responsible Reviewer.',
        report: result.report,
        workItem: result.workItem,
      };
    } catch (error) {
      if (!persisted) {
        await Promise.all(
          storedKeys.map((storageKey) =>
            this.attachmentStorage.deleteFile('work', storageKey),
          ),
        );
      }
      throw error;
    }
  }

  async getCompletionEvidenceDownload(
    user: AuthenticatedUser,
    workItemId: string,
    reportId: string,
    evidenceId: string,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    await this.findVisibleCurrent(this.prisma, actor, workItemId, true);

    const evidence = await this.prisma.workEvidence.findFirst({
      where: {
        id: evidenceId,
        workItemId,
        completionReportId: reportId,
      },
      select: {
        storageKey: true,
        originalFileName: true,
        mimeType: true,
        fileSizeBytes: true,
        scanStatus: true,
        expiresAt: true,
        expiredAt: true,
        purgedAt: true,
      },
    });
    if (!evidence) {
      throw new NotFoundException('Completion evidence was not found.');
    }
    if (
      evidence.purgedAt ||
      evidence.expiredAt ||
      (evidence.expiresAt && evidence.expiresAt.getTime() <= Date.now())
    ) {
      throw new GoneException(
        'This completion evidence expired 90 days after the Work became terminal.',
      );
    }
    if (
      !this.attachmentSecurity.canAccessStoredAttachment(evidence.scanStatus)
    ) {
      throw new ForbiddenException(
        'This completion evidence is not available yet.',
      );
    }
    if (!(await this.attachmentStorage.exists('work', evidence.storageKey))) {
      throw new ServiceUnavailableException(
        'This completion evidence is temporarily unavailable.',
      );
    }
    return {
      originalFileName: evidence.originalFileName,
      mimeType: evidence.mimeType,
      fileSizeBytes: evidence.fileSizeBytes,
      absolutePath: this.attachmentStorage.resolvePath(
        'work',
        evidence.storageKey,
      ),
    };
  }

  async requestMoreInformation(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ReviewWorkCompletionDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const workItem = await this.prisma.$transaction(async (transaction) => {
      const current = await this.findVisibleCurrent(
        transaction,
        actor,
        workItemId,
      );
      this.assertResponsibleReviewer(current, actor.accountId);
      this.statusTransitions.assertCanReviewCompletion(current.status);
      const latest = current.completionReports[0];
      if (!latest)
        throw new ConflictException(
          'No completion report is waiting for review.',
        );
      await transaction.workCompletionReport.update({
        where: { id: latest.id },
        data: {
          reviewStatus: WorkCompletionReviewStatus.INFORMATION_REQUESTED,
          managerNote: dto.note.trim(),
          reviewedByAccountId: actor.accountId,
          reviewedAt: new Date(),
        },
      });
      await transaction.workItem.update({
        where: { id: current.id },
        data: {
          status: WorkItemStatus.REOPENED,
          completedAt: null,
          closedAt: null,
          version: { increment: 1 },
        },
      });
      await transaction.workActivity.create({
        data: {
          workItemId: current.id,
          actorAccountId: actor.accountId,
          action: WorkActivityAction.INFORMATION_REQUESTED,
          fromStatus: current.status,
          toStatus: WorkItemStatus.REOPENED,
          details: { completionReportId: latest.id, note: dto.note.trim() },
        },
      });
      return this.findDetail(transaction, current.id);
    });
    await this.notify(workItem, actor.accountId, 'REOPENED', {
      title: 'Correction requested',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
    });
    return { message: 'Work returned for correction.', workItem };
  }

  async close(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ReviewWorkCompletionDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const workItem = await this.prisma.$transaction(async (transaction) => {
      const current = await this.findVisibleCurrent(
        transaction,
        actor,
        workItemId,
      );
      this.assertResponsibleReviewer(current, actor.accountId);
      this.statusTransitions.assertCanReviewCompletion(current.status);
      const latest = current.completionReports[0];
      if (!latest)
        throw new ConflictException(
          'No completion report is waiting for review.',
        );
      const closedAt = new Date();
      await transaction.workCompletionReport.update({
        where: { id: latest.id },
        data: {
          reviewStatus: WorkCompletionReviewStatus.ACCEPTED,
          managerNote: dto.note.trim(),
          reviewedByAccountId: actor.accountId,
          reviewedAt: closedAt,
        },
      });
      await transaction.workEvidence.updateMany({
        where: {
          workItemId: current.id,
          completionReportId: { not: null },
          purgedAt: null,
        },
        data: {
          expiresAt: workAttachmentExpiresAt(closedAt),
          expiredAt: null,
        },
      });
      await transaction.workItem.update({
        where: { id: current.id },
        data: {
          status: WorkItemStatus.CLOSED,
          closedAt,
          archiveEligibleAt: new Date(
            closedAt.getTime() + 365 * 24 * 60 * 60 * 1000,
          ),
          deletionEligibleAt: new Date(
            closedAt.getTime() + 3 * 365 * 24 * 60 * 60 * 1000,
          ),
          version: { increment: 1 },
        },
      });
      await transaction.workActivity.create({
        data: {
          workItemId: current.id,
          actorAccountId: actor.accountId,
          action: WorkActivityAction.CLOSED,
          fromStatus: current.status,
          toStatus: WorkItemStatus.CLOSED,
          details: { completionReportId: latest.id, note: dto.note.trim() },
        },
      });
      return this.findDetail(transaction, current.id);
    });
    await this.notify(workItem, actor.accountId, 'CLOSED', {
      title: 'Work approved and closed',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
    });
    return { message: 'Work approved and closed.', workItem };
  }

  async reopen(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ReviewWorkCompletionDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const current = await this.findVisibleCurrent(
      this.prisma,
      actor,
      workItemId,
      true,
    );
    this.assertResponsibleReviewer(current, actor.accountId);
    this.statusTransitions.assertCanReopen(current.status);
    await this.prisma.$transaction([
      this.prisma.workItem.update({
        where: { id: current.id },
        data: {
          status: WorkItemStatus.REOPENED,
          completedAt: null,
          closedAt: null,
          cancelledAt: null,
          archiveEligibleAt: null,
          deletionEligibleAt: null,
          version: { increment: 1 },
        },
      }),
      this.prisma.workEvidence.updateMany({
        where: {
          workItemId: current.id,
          completionReportId: { not: null },
          purgedAt: null,
        },
        data: { expiresAt: null, expiredAt: null },
      }),
      this.prisma.workActivity.create({
        data: {
          workItemId: current.id,
          actorAccountId: actor.accountId,
          action: WorkActivityAction.REOPENED,
          fromStatus: current.status,
          toStatus: WorkItemStatus.REOPENED,
          details: { note: dto.note.trim() },
        },
      }),
    ]);
    const workItem = await this.findDetail(this.prisma, current.id);
    await this.notify(workItem, actor.accountId, 'REOPENED', {
      title: 'Work reopened',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
    });
    return { message: 'Work reopened.', workItem };
  }

  async cancel(
    user: AuthenticatedUser,
    workItemId: string,
    dto: CancelWorkItemDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const current = await this.findVisibleCurrent(
      this.prisma,
      actor,
      workItemId,
    );
    this.assertCanManageCurrent(actor, current);
    this.statusTransitions.assertCanCancel(current.status);
    const cancelledAt = new Date();
    await this.prisma.$transaction([
      this.prisma.workItem.update({
        where: { id: current.id },
        data: {
          status: WorkItemStatus.CANCELLED,
          completedAt: null,
          closedAt: null,
          cancelledAt,
          archiveEligibleAt: new Date(
            cancelledAt.getTime() + 365 * 24 * 60 * 60 * 1000,
          ),
          deletionEligibleAt: new Date(
            cancelledAt.getTime() + 3 * 365 * 24 * 60 * 60 * 1000,
          ),
          version: { increment: 1 },
        },
      }),
      this.prisma.workEvidence.updateMany({
        where: {
          workItemId: current.id,
          completionReportId: { not: null },
          purgedAt: null,
        },
        data: {
          expiresAt: workAttachmentExpiresAt(cancelledAt),
          expiredAt: null,
        },
      }),
      this.prisma.workSalesAttachment.updateMany({
        where: {
          message: { is: { workItemId: current.id } },
          purgedAt: null,
          expiresAt: null,
        },
        data: { expiresAt: workAttachmentExpiresAt(cancelledAt) },
      }),
      this.prisma.workActivity.create({
        data: {
          workItemId: current.id,
          actorAccountId: actor.accountId,
          action: WorkActivityAction.CANCELLED,
          fromStatus: current.status,
          toStatus: WorkItemStatus.CANCELLED,
          details: { reason: dto.reason.trim() },
        },
      }),
    ]);
    const workItem = await this.findDetail(this.prisma, current.id);
    await this.notify(workItem, actor.accountId, 'CANCELLED', {
      title: 'Work cancelled',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
    });
    return { message: 'Work cancelled.', workItem };
  }

  async reassign(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ReassignWorkDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const current = await this.findVisibleCurrent(
      this.prisma,
      actor,
      workItemId,
    );
    this.assertCanManageCurrent(actor, current);
    this.statusTransitions.assertCanChangeAssignment(current.status);
    const hasTeam = Boolean(dto.operationalTeamId);
    const hasAssignee = Boolean(dto.assigneeAccountId);
    if (hasTeam === hasAssignee) {
      throw new ConflictException(
        'Choose exactly one replacement Main Team or individual assignee.',
      );
    }

    let newTeamId: string | null = null;
    let newTeamMemberAccountIds: string[] = [];
    if (dto.operationalTeamId) {
      const team = await this.prisma.operationalTeam.findFirst({
        where: {
          id: dto.operationalTeamId,
          orgUnitId: current.primaryOwnerOrgUnitId ?? undefined,
          isActive: true,
          archivedAt: null,
        },
        select: {
          id: true,
          members: {
            where: { endsAt: null },
            select: {
              employee: { select: { account: { select: { id: true } } } },
            },
          },
        },
      });
      if (!team)
        throw new ConflictException(
          'Replacement Main Team is not valid for this Work.',
        );
      newTeamId = team.id;
      newTeamMemberAccountIds = team.members.flatMap((member) =>
        member.employee.account?.id ? [member.employee.account.id] : [],
      );
    }
    const newAssignee = dto.assigneeAccountId
      ? await this.workScopeService.resolveHelpCandidate(
          actor,
          dto.assigneeAccountId,
          current.primaryOwnerOrgUnitId ?? '',
        )
      : null;

    await this.prisma.$transaction(async (transaction) => {
      await transaction.workAssignment.updateMany({
        where: {
          workItemId: current.id,
          assignmentRole: WorkAssignmentRole.PRIMARY,
          endedAt: null,
        },
        data: {
          endedAt: new Date(),
          endReason: dto.reason.trim(),
        },
      });
      if (newAssignee) {
        await transaction.workAssignment.create({
          data: {
            workItemId: current.id,
            assigneeAccountId: newAssignee.id,
            assignmentRole: WorkAssignmentRole.PRIMARY,
            assignedByAccountId: actor.accountId,
          },
        });
      }
      await transaction.workItem.update({
        where: { id: current.id },
        data: {
          assignedOperationalTeamId: newTeamId,
          status: WorkItemStatus.ASSIGNED,
          version: { increment: 1 },
        },
      });
      await transaction.workActivity.create({
        data: {
          workItemId: current.id,
          actorAccountId: actor.accountId,
          action: WorkActivityAction.REASSIGNED,
          fromStatus: current.status,
          toStatus: WorkItemStatus.ASSIGNED,
          details: {
            operationalTeamId: newTeamId,
            assigneeAccountId: newAssignee?.id ?? null,
            reason: dto.reason.trim(),
          },
        },
      });
    });
    const workItem = await this.findDetail(this.prisma, current.id);
    const reassignmentRecipients = newAssignee
      ? [newAssignee.id]
      : newTeamMemberAccountIds;
    await this.notify(workItem, actor.accountId, 'REASSIGNED', {
      title: 'Work reassigned',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
      notificationRecipients: reassignmentRecipients,
    });
    return { message: 'Work reassigned.', workItem };
  }

  async addSupport(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ManageWorkSupportDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const current = await this.findVisibleCurrent(
      this.prisma,
      actor,
      workItemId,
    );
    this.assertCanManageCurrent(actor, current);
    this.statusTransitions.assertCanChangeAssignment(current.status);
    const support = await this.workScopeService.resolveHelpCandidate(
      actor,
      dto.accountId,
      current.primaryOwnerOrgUnitId ?? '',
    );
    if (
      current.assignments.some(
        (assignment) => assignment.assigneeAccountId === support.id,
      )
    ) {
      throw new ConflictException(
        'This employee is already assigned to the Work.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.workAssignment.create({
        data: {
          workItemId: current.id,
          assigneeAccountId: support.id,
          assignmentRole: WorkAssignmentRole.SUPPORTING,
          assignedByAccountId: actor.accountId,
        },
      }),
      this.prisma.workActivity.create({
        data: {
          workItemId: current.id,
          actorAccountId: actor.accountId,
          action: WorkActivityAction.SUPPORT_ADDED,
          fromStatus: current.status,
          toStatus: current.status,
          details: {
            assigneeAccountId: support.id,
            reason: dto.reason?.trim() ?? null,
          },
        },
      }),
    ]);
    const workItem = await this.findDetail(this.prisma, current.id);
    await this.notify(workItem, actor.accountId, 'SUPPORT_ADDED', {
      title: 'Added to Work support',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
      notificationRecipients: [support.id],
    });
    return { message: 'Supporting Staff added.', workItem };
  }

  async removeSupport(
    user: AuthenticatedUser,
    workItemId: string,
    dto: ManageWorkSupportDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const current = await this.findVisibleCurrent(
      this.prisma,
      actor,
      workItemId,
    );
    this.assertCanManageCurrent(actor, current);
    const support = current.assignments.find(
      (assignment) =>
        assignment.assigneeAccountId === dto.accountId &&
        assignment.assignmentRole === WorkAssignmentRole.SUPPORTING,
    );
    if (!support)
      throw new NotFoundException(
        'Active Supporting Staff assignment was not found.',
      );
    await this.prisma.$transaction([
      this.prisma.workAssignment.update({
        where: { id: support.id },
        data: {
          endedAt: new Date(),
          endReason: dto.reason?.trim() ?? 'Removed from Work support.',
        },
      }),
      this.prisma.workActivity.create({
        data: {
          workItemId: current.id,
          actorAccountId: actor.accountId,
          action: WorkActivityAction.SUPPORT_REMOVED,
          fromStatus: current.status,
          toStatus: current.status,
          details: {
            assigneeAccountId: dto.accountId,
            reason: dto.reason?.trim() ?? null,
          },
        },
      }),
    ]);
    const workItem = await this.findDetail(this.prisma, current.id);
    await this.notify(workItem, actor.accountId, 'SUPPORT_REMOVED', {
      title: 'Removed from Work support',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
      extraRecipients: [dto.accountId],
      notificationRecipients: [dto.accountId],
    });
    return { message: 'Supporting Staff removed.', workItem };
  }

  async sendToSales(
    user: AuthenticatedUser,
    workItemId: string,
    dto: SendWorkToSalesDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const current = await this.findVisibleCurrent(
      this.prisma,
      actor,
      workItemId,
    );
    const primary = this.getRequiredPrimaryAssignment(current, actor.accountId);
    if (!primary.startedAt)
      throw new ConflictException('Start the Work before sending it to Sales.');
    if (!current.salesMemberAccountId)
      throw new ConflictException(
        'This Work does not require Sales coordination.',
      );
    await this.prisma.$transaction([
      this.prisma.workItem.update({
        where: { id: current.id },
        data: {
          salesCoordinationStatus: WorkSalesCoordinationStatus.READY_FOR_SALES,
          salesDocumentsSentAt: new Date(),
          version: { increment: 1 },
        },
      }),
      this.prisma.workActivity.create({
        data: {
          workItemId: current.id,
          actorAccountId: actor.accountId,
          action: WorkActivityAction.SALES_DOCUMENTS_SENT,
          fromStatus: current.status,
          toStatus: current.status,
          details: { note: dto.note?.trim() ?? null },
        },
      }),
    ]);
    const workItem = await this.findDetail(this.prisma, current.id);
    await this.notify(workItem, actor.accountId, 'SALES_DOCUMENTS_SENT', {
      title: 'Sales documents received',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
      notificationRecipients: current.salesMemberAccountId
        ? [current.salesMemberAccountId]
        : [],
    });
    return { message: 'Work sent to Sales.', workItem };
  }

  async completeSalesWork(
    user: AuthenticatedUser,
    workItemId: string,
    dto: CompleteSalesWorkDto,
  ) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const current = await this.findVisibleCurrent(
      this.prisma,
      actor,
      workItemId,
    );
    if (current.salesMemberAccountId !== actor.accountId) {
      throw new ForbiddenException(
        'Only the selected Sales Member can complete Sales coordination.',
      );
    }
    if (
      current.salesCoordinationStatus !==
      WorkSalesCoordinationStatus.READY_FOR_SALES
    ) {
      throw new ConflictException(
        'Sales coordination is not ready to be completed.',
      );
    }
    const mainParticipantAccountIds =
      await this.resolveMainParticipantAccountIds(current);
    const salesCompletedAt = new Date();
    await this.prisma.$transaction([
      this.prisma.workItem.update({
        where: { id: current.id },
        data: {
          salesCoordinationStatus: WorkSalesCoordinationStatus.COMPLETED,
          salesCompletedAt,
          salesCompletionNote: dto.note?.trim() || null,
          version: { increment: 1 },
        },
      }),
      this.prisma.workSalesAttachment.updateMany({
        where: {
          message: { is: { workItemId: current.id } },
          purgedAt: null,
        },
        data: {
          expiresAt: workAttachmentExpiresAt(salesCompletedAt),
          expiredAt: null,
        },
      }),
      this.prisma.workActivity.create({
        data: {
          workItemId: current.id,
          actorAccountId: actor.accountId,
          action: WorkActivityAction.SALES_WORK_COMPLETED,
          fromStatus: current.status,
          toStatus: current.status,
          details: { note: dto.note?.trim() ?? null },
        },
      }),
    ]);
    const workItem = await this.findDetail(this.prisma, current.id);
    await this.notify(workItem, actor.accountId, 'SALES_WORK_COMPLETED', {
      title: 'Sales work completed',
      body: `${workItem.ticketNumber}: ${workItem.title}`,
      notificationRecipients: mainParticipantAccountIds,
    });
    return { message: 'Sales coordination completed.', workItem };
  }

  async listCompletionReports(user: AuthenticatedUser, workItemId: string) {
    const actor = await this.workScopeService.resolveActorContext(user);
    await this.findVisibleCurrent(this.prisma, actor, workItemId, true);
    const reports = await this.prisma.workCompletionReport.findMany({
      where: { workItemId },
      orderBy: { createdAt: 'desc' },
      select: completionReportSelect,
    });
    return { data: reports };
  }

  async listHelpRequests(user: AuthenticatedUser, workItemId: string) {
    const actor = await this.workScopeService.resolveActorContext(user);
    await this.findVisibleCurrent(this.prisma, actor, workItemId, true);
    const requests = await this.prisma.workHelpRequest.findMany({
      where: { workItemId },
      orderBy: { createdAt: 'desc' },
      select: helpRequestSelect,
    });
    return { data: requests };
  }

  async listPendingHelpRequests(user: AuthenticatedUser) {
    const actor = await this.workScopeService.resolveActorContext(user);
    const hasScopedOversight =
      actor.accountClass === AccountClass.SUPER_ADMIN ||
      (actor.visibleOrgUnitIds?.length ?? 0) > 0 ||
      (actor.operationalTeamLeadIds?.length ?? 0) > 0;
    const where: Prisma.WorkHelpRequestWhereInput = hasScopedOversight
      ? {
          status: WorkHelpRequestStatus.PENDING,
          workItem: {
            is: this.workScopeService.buildVisibleWorkWhere(actor),
          },
        }
      : {
          requestedHelperAccountId: actor.accountId,
          status: WorkHelpRequestStatus.PENDING,
        };
    const requests = await this.prisma.workHelpRequest.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: helpRequestSelect,
    });
    return { data: requests };
  }

  private validateCompletionFiles(files: UploadedMessageAttachmentFile[]) {
    if (files.length > MAX_WORK_COMPLETION_ATTACHMENT_FILES) {
      throw new BadRequestException(
        `You can add up to ${MAX_WORK_COMPLETION_ATTACHMENT_FILES} completion files at a time.`,
      );
    }
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes > MAX_WORK_COMPLETION_ATTACHMENT_TOTAL_BYTES) {
      throw new BadRequestException(
        'Completion evidence must total 50 MB or smaller.',
      );
    }

    return files.map((file) => {
      if ((!file.buffer && !file.path) || file.size <= 0) {
        throw new BadRequestException('One of the completion files is empty.');
      }
      if (file.size > MAX_WORK_COMPLETION_ATTACHMENT_FILE_BYTES) {
        throw new BadRequestException(
          'Each completion file must be 25 MB or smaller.',
        );
      }
      if (!WORK_COMPLETION_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
        throw new BadRequestException(
          'Completion evidence must be a JPG, PNG, WebP image or PDF.',
        );
      }
      assertAttachmentFileMatchesDeclaredType(file);
      const normalized = file.originalname
        .normalize('NFKC')
        .replace(/[\\/\0]/g, '_')
        .replace(/[\r\n]/g, ' ')
        .trim();
      return {
        file,
        originalFileName: (normalized || 'evidence').slice(0, 180),
      };
    });
  }

  private async findVisibleCurrent(
    client: WorkDatabaseClient,
    actor: WorkActorContext,
    workItemId: string,
    allowArchived = false,
  ): Promise<LifecycleCurrentWorkItem> {
    const current = await client.workItem.findFirst({
      where: {
        AND: [
          { id: workItemId },
          this.workScopeService.buildVisibleWorkWhere(actor),
        ],
      },
      select: lifecycleCurrentSelect,
    });

    if (!current) {
      throw new NotFoundException('Work item was not found.');
    }

    if (
      !allowArchived &&
      current.archiveEligibleAt &&
      current.archiveEligibleAt.getTime() <= Date.now()
    ) {
      throw new ConflictException(
        'Archived work is read-only and cannot be changed.',
      );
    }

    return current;
  }

  private async findDetail(
    client: WorkDatabaseClient,
    workItemId: string,
  ): Promise<WorkItemDetail> {
    const workItem = await client.workItem.findUniqueOrThrow({
      where: { id: workItemId },
      select: workCompatibilityDetailSelect,
    });

    return workItem;
  }

  private getRequiredPrimaryAssignment(
    current: LifecycleCurrentWorkItem,
    accountId: string,
  ) {
    const assignment = this.getPrimaryAssignmentForActor(current, accountId);

    if (!assignment) {
      throw new ForbiddenException(
        'Only the active primary assignee can perform this action.',
      );
    }

    return assignment;
  }

  private getPrimaryAssignmentForActor(
    current: LifecycleCurrentWorkItem,
    accountId: string,
  ) {
    return current.assignments.find(
      (assignment) =>
        assignment.assignmentRole === WorkAssignmentRole.PRIMARY &&
        assignment.assigneeAccountId === accountId,
    );
  }

  private getActivePrimaryAssignment(current: LifecycleCurrentWorkItem) {
    const assignment = current.assignments.find(
      (candidate) => candidate.assignmentRole === WorkAssignmentRole.PRIMARY,
    );

    if (!assignment) {
      throw new ConflictException(
        'The work item does not have an active primary assignee.',
      );
    }

    return assignment;
  }

  private assertResponsibleReviewer(
    current: LifecycleCurrentWorkItem,
    accountId: string,
  ): void {
    if (current.responsibleReviewerAccountId !== accountId) {
      throw new ForbiddenException(
        'Only the Responsible Reviewer can review this Work.',
      );
    }
  }

  private assertCanManageCurrent(
    actor: WorkActorContext,
    current: LifecycleCurrentWorkItem,
  ): void {
    if (actor.accountClass === AccountClass.SUPER_ADMIN) {
      throw new ForbiddenException(
        'The Super Admin has read-only operational Work access.',
      );
    }
    if (current.responsibleReviewerAccountId === actor.accountId) return;
    if (
      current.primaryOwnerOrgUnitId &&
      (actor.assignableOrgUnitIds ?? []).includes(current.primaryOwnerOrgUnitId)
    ) {
      return;
    }
    throw new ForbiddenException(
      'You do not have management authority for this Work.',
    );
  }

  private async resolveMainParticipantAccountIds(
    current: LifecycleCurrentWorkItem,
  ): Promise<string[]> {
    const primaryAssignments = current.assignments
      .filter(
        (assignment) =>
          assignment.assignmentRole === WorkAssignmentRole.PRIMARY,
      )
      .map((assignment) => assignment.assigneeAccountId);

    if (!current.assignedOperationalTeamId) {
      return [...new Set(primaryAssignments)];
    }

    const now = new Date();
    const team = await this.prisma.operationalTeam.findUnique({
      where: { id: current.assignedOperationalTeamId },
      select: {
        members: {
          where: {
            startsAt: { lte: now },
            OR: [{ endsAt: null }, { endsAt: { gt: now } }],
          },
          select: {
            employee: {
              select: { account: { select: { id: true, isEnabled: true } } },
            },
          },
        },
      },
    });

    const teamMemberAccountIds: string[] =
      team?.members.flatMap((member) => {
        const account = member.employee.account;
        return account?.isEnabled ? [account.id] : [];
      }) ?? [];

    return [
      ...new Set<string>([...primaryAssignments, ...teamMemberAccountIds]),
    ];
  }

  private async notify(
    workItem: WorkItemDetail,
    actorAccountId: string,
    action: Parameters<
      WorkNotificationsService['publishWorkUpdate']
    >[0]['action'],
    input: {
      title: string;
      body: string;
      extraRecipients?: string[];
      notificationRecipients?: string[];
      metadata?: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    // Sales responsibility is a visibility/notification relationship, not a technical assignment.
    // Include it explicitly so customer-side owners stay informed without gaining completion authority.
    const recipients = [
      workItem.createdBy.id,
      ...workItem.assignments.map((assignment) => assignment.assignee.id),
      ...(workItem.salesMember ? [workItem.salesMember.id] : []),
      ...(input.extraRecipients ?? []),
      actorAccountId,
    ];
    await this.workNotifications.publishWorkUpdate({
      workItem,
      action,
      actorAccountId,
      recipientAccountIds: recipients,
      notificationRecipientAccountIds: input.notificationRecipients,
      title: input.title,
      body: input.body,
      metadata: input.metadata,
    });
  }

  private assertSingleUpdate(count: number): void {
    if (count !== 1) {
      throw new ConflictException(
        'This work item changed while the action was being processed. Refresh and try again.',
      );
    }
  }

  private normalizeOptionalText(value: string | undefined): string | null {
    const normalized = value?.trim().replace(/\s+/g, ' ');
    return normalized || null;
  }
}
