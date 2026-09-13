import {
  BadRequestException,
  ConflictException,
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
  WorkFieldType,
  WorkFinalClosureMode,
  WorkSlaBasis,
  WorkStageActivationMode,
  WorkStageApprovalMode,
  WorkStageAssignmentMode,
  WorkStageResponsibleOrgUnitRule,
  WorkTypeCreatorScope,
  WorkTypeVersionStatus,
} from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import { WorkRuntimeV3SlaService } from './work-runtime-v3-sla.service';
import type { CreateWorkTypeDraftDto } from './dto/create-work-type-draft.dto';
import type {
  ReplaceWorkTypeDraftConfigurationDto,
  WorkFieldDefinitionDto,
} from './dto/replace-work-type-draft-configuration.dto';
import type { UpdateWorkTypeDraftDto } from './dto/update-work-type-draft.dto';

const VERSION_SUMMARY_SELECT = {
  id: true,
  workTypeDefinitionId: true,
  version: true,
  status: true,
  name: true,
  description: true,
  changeReason: true,
  createdByAccountId: true,
  publishedByAccountId: true,
  retiredByAccountId: true,
  publishedAt: true,
  retiredAt: true,
  createdAt: true,
  updatedAt: true,
} as const;
const VERSION_CONFIGURATION_SELECT = {
  primaryOwnerOrgUnitId: true,
  creatorCategories: true,
  creatorScope: true,
  finalClosureMode: true,
  finalClosureLeadershipType: true,
  slaBasis: true,
  overallSlaMinutes: true,
  creatorOrgUnits: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      orgUnitId: true,
      includeDescendants: true,
    },
  },
  creatorAccounts: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      accountId: true,
    },
  },
  fields: {
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      label: true,
      fieldType: true,
      isRequired: true,
      sortOrder: true,
      config: true,
      stageDefinitionId: true,
    },
  },
  stages: {
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
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
    },
  },
  stageDependencies: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      stageDefinitionId: true,
      prerequisiteStageId: true,
    },
  },
} satisfies Prisma.WorkTypeVersionSelect;

@Injectable()
export class WorkTypeV3Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
    private readonly sla: WorkRuntimeV3SlaService,
  ) {}

  private async getOffice(officeId: string) {
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

    return office;
  }

  private async lockWorkTypeDefinition(
    tx: Prisma.TransactionClient,
    officeId: string,
    workTypeDefinitionId: string,
  ): Promise<void> {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id"
      FROM "work_type_definitions"
      WHERE "id" = CAST(${workTypeDefinitionId} AS uuid)
        AND "office_id" = CAST(${officeId} AS uuid)
      FOR UPDATE
    `;

    if (locked.length === 0) {
      throw new NotFoundException('Work type was not found in this office.');
    }
  }

  private async requireDraft(
    tx: Prisma.TransactionClient,
    workTypeDefinitionId: string,
    versionId: string,
  ) {
    const version = await tx.workTypeVersion.findFirst({
      where: {
        id: versionId,
        workTypeDefinitionId,
      },
      select: VERSION_SUMMARY_SELECT,
    });

    if (!version) {
      throw new NotFoundException('Work type version was not found.');
    }

    if (version.status !== WorkTypeVersionStatus.DRAFT) {
      throw new BadRequestException(
        'Only a draft work type version can be changed.',
      );
    }

    return version;
  }

  private validateConfigurationShape(
    dto: ReplaceWorkTypeDraftConfigurationDto,
  ): void {
    const creatorOrgUnitIds = dto.creatorOrgUnits.map((item) => item.orgUnitId);
    if (new Set(creatorOrgUnitIds).size !== creatorOrgUnitIds.length) {
      throw new BadRequestException('Creator OrgUnits must be unique.');
    }

    const creatorAccountIds = dto.creatorAccounts.map((item) => item.accountId);
    if (new Set(creatorAccountIds).size !== creatorAccountIds.length) {
      throw new BadRequestException('Creator accounts must be unique.');
    }

    if (
      dto.creatorScope === WorkTypeCreatorScope.SPECIFIC_ORG_UNITS &&
      dto.creatorOrgUnits.length === 0
    ) {
      throw new BadRequestException(
        'Specific OrgUnit creator scope requires at least one creator OrgUnit.',
      );
    }

    if (
      dto.creatorScope !== WorkTypeCreatorScope.SPECIFIC_ORG_UNITS &&
      dto.creatorOrgUnits.length > 0
    ) {
      throw new BadRequestException(
        'Creator OrgUnits are only valid with SPECIFIC_ORG_UNITS creator scope.',
      );
    }

    if (
      dto.finalClosureMode === WorkFinalClosureMode.SPECIFIC_LEADERSHIP &&
      !dto.finalClosureLeadershipType
    ) {
      throw new BadRequestException(
        'Specific-leadership final closure requires a leadership type.',
      );
    }

    if (
      dto.finalClosureMode !== WorkFinalClosureMode.SPECIFIC_LEADERSHIP &&
      dto.finalClosureLeadershipType
    ) {
      throw new BadRequestException(
        'Final-closure leadership type is only valid with SPECIFIC_LEADERSHIP.',
      );
    }

    if (dto.finalClosureLeadershipType === OrgLeadershipType.TEAM_LEAD) {
      throw new BadRequestException(
        'Operational Team Lead cannot be configured as a Work-level final-closure leadership type.',
      );
    }

    const fieldsByCode = new Map(
      dto.fields.map((field) => [field.code, field]),
    );
    if (fieldsByCode.size !== dto.fields.length) {
      throw new BadRequestException('Work field codes must be unique.');
    }

    const stagesByCode = new Map(
      dto.stages.map((stage) => [stage.code, stage]),
    );
    if (stagesByCode.size !== dto.stages.length) {
      throw new BadRequestException('Work stage codes must be unique.');
    }

    for (const field of dto.fields) {
      this.validateFieldConfiguration(field);

      if (field.stageCode && !stagesByCode.has(field.stageCode)) {
        throw new BadRequestException(
          `Field ${field.code} references an unknown stage ${field.stageCode}.`,
        );
      }
    }

    for (const stage of dto.stages) {
      const approvalMode = stage.approvalMode ?? WorkStageApprovalMode.NONE;
      const activationMode =
        stage.activationMode ?? WorkStageActivationMode.ALWAYS;

      if (
        stage.activationExpectedValue !== undefined &&
        !['string', 'number', 'boolean'].includes(
          typeof stage.activationExpectedValue,
        )
      ) {
        throw new BadRequestException(
          `Stage ${stage.code} activation expected value must be a string, number or boolean.`,
        );
      }

      if (
        stage.responsibleOrgUnitRule ===
          WorkStageResponsibleOrgUnitRule.SPECIFIC_ORG_UNIT &&
        !stage.responsibleOrgUnitId
      ) {
        throw new BadRequestException(
          `Stage ${stage.code} requires a responsible OrgUnit.`,
        );
      }

      if (
        stage.responsibleOrgUnitRule !==
          WorkStageResponsibleOrgUnitRule.SPECIFIC_ORG_UNIT &&
        stage.responsibleOrgUnitId
      ) {
        throw new BadRequestException(
          `Stage ${stage.code} may only set a responsible OrgUnit when its rule is SPECIFIC_ORG_UNIT.`,
        );
      }
      if (
        approvalMode === WorkStageApprovalMode.SPECIFIC_LEADERSHIP &&
        !stage.approvalLeadershipType
      ) {
        throw new BadRequestException(
          `Stage ${stage.code} requires an approval leadership type.`,
        );
      }


      if (
        approvalMode === WorkStageApprovalMode.SPECIFIC_LEADERSHIP &&
        stage.approvalLeadershipType === OrgLeadershipType.TEAM_LEAD
      ) {
        throw new BadRequestException(
          `Stage ${stage.code} must use TEAM_LEAD approval mode for Operational Team Lead approval.`,
        );
      }

      if (
        approvalMode !== WorkStageApprovalMode.SPECIFIC_LEADERSHIP &&
        stage.approvalLeadershipType
      ) {
        throw new BadRequestException(
          `Stage ${stage.code} may only set approval leadership with SPECIFIC_LEADERSHIP approval.`,
        );
      }

      if (
        activationMode === WorkStageActivationMode.ALWAYS ||
        activationMode === WorkStageActivationMode.MANUAL_WHEN_REQUIRED
      ) {
        if (
          stage.activationFieldCode ||
          stage.activationExpectedValue !== undefined
        ) {
          throw new BadRequestException(
            `Stage ${stage.code} cannot define an activation field/value for ${activationMode}.`,
          );
        }
      }

      if (activationMode === WorkStageActivationMode.FIELD_TRUE) {
        if (!stage.activationFieldCode) {
          throw new BadRequestException(
            `Stage ${stage.code} requires an activation field.`,
          );
        }
        if (stage.activationExpectedValue !== undefined) {
          throw new BadRequestException(
            `Stage ${stage.code} must not define an expected value for FIELD_TRUE.`,
          );
        }
        const field = fieldsByCode.get(stage.activationFieldCode);
        if (!field) {
          throw new BadRequestException(
            `Stage ${stage.code} references an unknown activation field ${stage.activationFieldCode}.`,
          );
        }
        if (field.fieldType !== WorkFieldType.BOOLEAN) {
          throw new BadRequestException(
            `Stage ${stage.code} FIELD_TRUE activation requires a BOOLEAN field.`,
          );
        }
      }

      if (activationMode === WorkStageActivationMode.FIELD_EQUALS) {
        if (!stage.activationFieldCode) {
          throw new BadRequestException(
            `Stage ${stage.code} requires an activation field.`,
          );
        }
        if (stage.activationExpectedValue === undefined) {
          throw new BadRequestException(
            `Stage ${stage.code} requires an expected activation value.`,
          );
        }
        if (!fieldsByCode.has(stage.activationFieldCode)) {
          throw new BadRequestException(
            `Stage ${stage.code} references an unknown activation field ${stage.activationFieldCode}.`,
          );
        }
      }
    }

    const dependencyKeys = new Set<string>();
    const prerequisitesByStage = new Map<string, string[]>();

    for (const dependency of dto.dependencies) {
      if (!stagesByCode.has(dependency.stageCode)) {
        throw new BadRequestException(
          `Dependency references an unknown stage ${dependency.stageCode}.`,
        );
      }
      if (!stagesByCode.has(dependency.prerequisiteStageCode)) {
        throw new BadRequestException(
          `Dependency references an unknown prerequisite stage ${dependency.prerequisiteStageCode}.`,
        );
      }
      if (dependency.stageCode === dependency.prerequisiteStageCode) {
        throw new BadRequestException(
          `Stage ${dependency.stageCode} cannot depend on itself.`,
        );
      }

      const key = `${dependency.stageCode}:${dependency.prerequisiteStageCode}`;
      if (dependencyKeys.has(key)) {
        throw new BadRequestException('Stage dependencies must be unique.');
      }
      dependencyKeys.add(key);

      const prerequisites =
        prerequisitesByStage.get(dependency.stageCode) ?? [];
      prerequisites.push(dependency.prerequisiteStageCode);
      prerequisitesByStage.set(dependency.stageCode, prerequisites);
    }

    const visitState = new Map<string, 'visiting' | 'done'>();
    const visit = (stageCode: string): void => {
      const state = visitState.get(stageCode);
      if (state === 'visiting') {
        throw new BadRequestException(
          'Work stage dependencies contain a cycle.',
        );
      }
      if (state === 'done') {
        return;
      }

      visitState.set(stageCode, 'visiting');
      for (const prerequisite of prerequisitesByStage.get(stageCode) ?? []) {
        visit(prerequisite);
      }
      visitState.set(stageCode, 'done');
    };

    for (const stageCode of stagesByCode.keys()) {
      visit(stageCode);
    }
  }

  private validateFieldConfiguration(field: WorkFieldDefinitionDto): void {
    const config = field.config;
    if (!config) {
      if (
        field.fieldType === WorkFieldType.SELECT ||
        field.fieldType === WorkFieldType.MULTI_SELECT
      ) {
        throw new BadRequestException(
          `Field ${field.code} requires configured options.`,
        );
      }
      return;
    }

    const keys = Object.keys(config);
    const assertAllowedKeys = (allowed: string[]) => {
      const unexpected = keys.filter((key) => !allowed.includes(key));
      if (unexpected.length > 0) {
        throw new BadRequestException(
          `Field ${field.code} has unsupported configuration: ${unexpected.join(', ')}.`,
        );
      }
    };

    const validateMaxLength = () => {
      const maxLength = config.maxLength;
      if (
        maxLength !== undefined &&
        (typeof maxLength !== 'number' ||
          !Number.isInteger(maxLength) ||
          maxLength < 1 ||
          maxLength > 4000)
      ) {
        throw new BadRequestException(
          `Field ${field.code} maxLength must be an integer between 1 and 4000.`,
        );
      }
    };

    const validateNumericRange = () => {
      const min = config.min;
      const max = config.max;

      if (
        min !== undefined &&
        (typeof min !== 'number' || !Number.isFinite(min))
      ) {
        throw new BadRequestException(
          `Field ${field.code} minimum must be a finite number.`,
        );
      }
      if (
        max !== undefined &&
        (typeof max !== 'number' || !Number.isFinite(max))
      ) {
        throw new BadRequestException(
          `Field ${field.code} maximum must be a finite number.`,
        );
      }
      if (typeof min === 'number' && typeof max === 'number' && min > max) {
        throw new BadRequestException(
          `Field ${field.code} minimum cannot be greater than maximum.`,
        );
      }
    };

    const validateOptions = (): string[] => {
      const rawOptions = config.options;

      const isUnknownArray = (value: unknown): value is unknown[] =>
        Array.isArray(value);

      if (
        !isUnknownArray(rawOptions) ||
        rawOptions.length === 0 ||
        rawOptions.length > 100
      ) {
        throw new BadRequestException(
          `Field ${field.code} options must contain 1 to 100 non-empty strings.`,
        );
      }

      const normalized: string[] = [];

      for (const option of rawOptions) {
        if (
          typeof option !== 'string' ||
          option.trim().length === 0 ||
          option.length > 120
        ) {
          throw new BadRequestException(
            `Field ${field.code} options must contain 1 to 100 non-empty strings.`,
          );
        }

        normalized.push(option.trim());
      }

      if (new Set(normalized).size !== normalized.length) {
        throw new BadRequestException(
          `Field ${field.code} options must be unique.`,
        );
      }

      return normalized;
    };

    switch (field.fieldType) {
      case WorkFieldType.TEXT:
      case WorkFieldType.LONG_TEXT:
      case WorkFieldType.REFERENCE:
        assertAllowedKeys(['maxLength']);
        validateMaxLength();
        return;
      case WorkFieldType.NUMBER:
      case WorkFieldType.DECIMAL:
        assertAllowedKeys(['min', 'max']);
        validateNumericRange();
        return;
      case WorkFieldType.SELECT:
        assertAllowedKeys(['options']);
        validateOptions();
        return;
      case WorkFieldType.MULTI_SELECT: {
        assertAllowedKeys(['options', 'minSelections', 'maxSelections']);
        const options = validateOptions();
        const minSelections = config.minSelections;
        const maxSelections = config.maxSelections;

        if (
          minSelections !== undefined &&
          (typeof minSelections !== 'number' ||
            !Number.isInteger(minSelections) ||
            minSelections < 0 ||
            minSelections > options.length)
        ) {
          throw new BadRequestException(
            `Field ${field.code} minSelections must be between 0 and the option count.`,
          );
        }
        if (
          maxSelections !== undefined &&
          (typeof maxSelections !== 'number' ||
            !Number.isInteger(maxSelections) ||
            maxSelections < 1 ||
            maxSelections > options.length)
        ) {
          throw new BadRequestException(
            `Field ${field.code} maxSelections must be between 1 and the option count.`,
          );
        }
        if (
          typeof minSelections === 'number' &&
          typeof maxSelections === 'number' &&
          minSelections > maxSelections
        ) {
          throw new BadRequestException(
            `Field ${field.code} minSelections cannot exceed maxSelections.`,
          );
        }
        return;
      }
      default:
        if (keys.length > 0) {
          throw new BadRequestException(
            `Field ${field.code} does not support configuration in Work Type V3.`,
          );
        }
    }
  }

  private async clearStageActivationReferences(
    tx: Prisma.TransactionClient,
    versionId: string,
  ): Promise<void> {
    await tx.$executeRaw`
      UPDATE "work_stage_definitions"
      SET "activation_mode" = 'ALWAYS',
          "activation_field_definition_id" = NULL,
          "activation_expected_value" = NULL
      WHERE "work_type_version_id" = CAST(${versionId} AS uuid)
    `;
  }
  private async assertOrgUnitsInOffice(
    tx: Prisma.TransactionClient,
    officeId: string,
    orgUnitIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(orgUnitIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return;
    }

    const units = await tx.orgUnit.findMany({
      where: {
        id: { in: uniqueIds },
        officeId,
        isActive: true,
        orgUnitType: { isTeam: false },
      },
      select: { id: true },
    });

    if (units.length !== uniqueIds.length) {
      throw new BadRequestException(
        'All configured OrgUnits must be active and belong to this office.',
      );
    }
  }

  private async assertCreatorAccountsInOffice(
    tx: Prisma.TransactionClient,
    officeId: string,
    accountIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(accountIds.filter(Boolean))];
    if (uniqueIds.length === 0) {
      return;
    }

    const accounts = await tx.account.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        role: true,
        isEnabled: true,
        employee: {
          select: {
            orgMemberships: {
              where: {
                officeId,
                endsAt: null,
                startsAt: { lte: new Date() },
              },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });

    const validIds = new Set(
      accounts
        .filter(
          (account) =>
            account.isEnabled &&
            account.role !== AccountRole.SUPER_ADMIN &&
            (account.employee?.orgMemberships.length ?? 0) > 0,
        )
        .map((account) => account.id),
    );

    if (uniqueIds.some((id) => !validIds.has(id))) {
      throw new BadRequestException(
        'Configured creator accounts must be enabled Office users in this office.',
      );
    }
  }

  private async clonePublishedConfiguration(
    tx: Prisma.TransactionClient,
    source: {
      primaryOwnerOrgUnitId: string | null;
      creatorCategories: Array<unknown>;
      creatorScope: WorkTypeCreatorScope;
      finalClosureMode: WorkFinalClosureMode;
      finalClosureLeadershipType: OrgLeadershipType | null;
      slaBasis: WorkSlaBasis;
      overallSlaMinutes: number | null;
      creatorOrgUnits: Array<{
        orgUnitId: string;
        includeDescendants: boolean;
      }>;
      creatorAccounts: Array<{ accountId: string }>;
      fields: Array<{
        id: string;
        stageDefinitionId: string | null;
        code: string;
        label: string;
        fieldType: WorkFieldType;
        isRequired: boolean;
        sortOrder: number;
        config: unknown;
      }>;
      stages: Array<{
        id: string;
        code: string;
        name: string;
        description: string | null;
        sortOrder: number;
        isRequired: boolean;
        responsibleOrgUnitRule: WorkStageResponsibleOrgUnitRule;
        responsibleOrgUnitId: string | null;
        assignmentMode: WorkStageAssignmentMode;
        approvalMode: WorkStageApprovalMode;
        approvalLeadershipType: OrgLeadershipType | null;
        activationMode: WorkStageActivationMode;
        activationFieldDefinitionId: string | null;
        activationExpectedValue: unknown;
        slaMinutes: number | null;
      }>;
      stageDependencies: Array<{
        stageDefinitionId: string;
        prerequisiteStageId: string;
      }>;
    },
    draftVersionId: string,
  ): Promise<void> {
    if (source.creatorOrgUnits.length > 0) {
      await tx.workTypeCreatorOrgUnit.createMany({
        data: source.creatorOrgUnits.map((item) => ({
          workTypeVersionId: draftVersionId,
          orgUnitId: item.orgUnitId,
          includeDescendants: item.includeDescendants,
        })),
      });
    }

    if (source.creatorAccounts.length > 0) {
      await tx.workTypeCreatorAccount.createMany({
        data: source.creatorAccounts.map((item) => ({
          workTypeVersionId: draftVersionId,
          accountId: item.accountId,
        })),
      });
    }

    const stageIdMap = new Map<string, string>();
    for (const stage of source.stages) {
      const created = await tx.workStageDefinition.create({
        data: {
          workTypeVersionId: draftVersionId,
          code: stage.code,
          name: stage.name,
          description: stage.description,
          sortOrder: stage.sortOrder,
          isRequired: stage.isRequired,
          responsibleOrgUnitRule: stage.responsibleOrgUnitRule,
          responsibleOrgUnitId: stage.responsibleOrgUnitId,
          assignmentMode: stage.assignmentMode,
          approvalMode: stage.approvalMode,
          approvalLeadershipType: stage.approvalLeadershipType,
          activationMode: WorkStageActivationMode.ALWAYS,
          activationFieldDefinitionId: null,
          activationExpectedValue: undefined,
          slaMinutes: stage.slaMinutes,
        },
        select: { id: true },
      });
      stageIdMap.set(stage.id, created.id);
    }

    const fieldIdMap = new Map<string, string>();
    for (const field of source.fields) {
      const created = await tx.workFieldDefinition.create({
        data: {
          workTypeVersionId: draftVersionId,
          stageDefinitionId: field.stageDefinitionId
            ? stageIdMap.get(field.stageDefinitionId)
            : null,
          code: field.code,
          label: field.label,
          fieldType: field.fieldType,
          isRequired: field.isRequired,
          sortOrder: field.sortOrder,
          config:
            field.config === null
              ? undefined
              : (field.config as Prisma.InputJsonValue),
        },
        select: { id: true },
      });
      fieldIdMap.set(field.id, created.id);
    }

    for (const stage of source.stages) {
      const newStageId = stageIdMap.get(stage.id);
      if (!newStageId) {
        throw new ConflictException(
          'Failed to clone work stage configuration.',
        );
      }

      await tx.workStageDefinition.update({
        where: { id: newStageId },
        data: {
          activationMode: stage.activationMode,
          activationFieldDefinitionId: stage.activationFieldDefinitionId
            ? fieldIdMap.get(stage.activationFieldDefinitionId)
            : null,
          activationExpectedValue:
            stage.activationExpectedValue === null
              ? undefined
              : (stage.activationExpectedValue as Prisma.InputJsonValue),
        },
      });
    }

    if (source.stageDependencies.length > 0) {
      await tx.workStageDependency.createMany({
        data: source.stageDependencies.map((dependency) => ({
          workTypeVersionId: draftVersionId,
          stageDefinitionId: stageIdMap.get(dependency.stageDefinitionId)!,
          prerequisiteStageId: stageIdMap.get(dependency.prerequisiteStageId)!,
        })),
      });
    }
  }

  private async assertPublishableConfiguration(
    tx: Prisma.TransactionClient,
    officeId: string,
    versionId: string,
  ): Promise<void> {
    const configuration = await tx.workTypeVersion.findUnique({
      where: { id: versionId },
      select: {
        ...VERSION_CONFIGURATION_SELECT,
      },
    });

    if (!configuration) {
      throw new NotFoundException('Work type version was not found.');
    }

    if (!configuration.primaryOwnerOrgUnitId) {
      throw new BadRequestException(
        'A Primary Owner OrgUnit is required before publishing.',
      );
    }

    if (
      configuration.creatorCategories.length === 0 &&
      configuration.creatorAccounts.length === 0
    ) {
      throw new BadRequestException(
        'At least one creator category or explicit creator account is required before publishing.',
      );
    }

    if (
      configuration.creatorScope === WorkTypeCreatorScope.SPECIFIC_ORG_UNITS &&
      configuration.creatorOrgUnits.length === 0
    ) {
      throw new BadRequestException(
        'Specific OrgUnit creator scope requires at least one creator OrgUnit before publishing.',
      );
    }

    if (configuration.stages.length === 0) {
      throw new BadRequestException(
        'At least one Work stage is required before publishing.',
      );
    }

    if (!configuration.stages.some((stage) => stage.isRequired)) {
      throw new BadRequestException(
        'At least one required Work stage is required before publishing.',
      );
    }

    if (configuration.slaBasis === WorkSlaBasis.OFFICE_WORKING_DURATION) {
      await this.sla.assertUsableOfficeCalendar(tx, officeId);
    }

    const orgUnitIds = [
      configuration.primaryOwnerOrgUnitId,
      ...configuration.creatorOrgUnits.map((item) => item.orgUnitId),
      ...configuration.stages
        .map((stage) => stage.responsibleOrgUnitId)
        .filter((id): id is string => Boolean(id)),
    ];
    await this.assertOrgUnitsInOffice(tx, officeId, orgUnitIds);
    await this.assertCreatorAccountsInOffice(
      tx,
      officeId,
      configuration.creatorAccounts.map((item) => item.accountId),
    );
  }

  async getActionContext(user: AuthenticatedUser, officeId: string) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_VIEW,
      officeId,
      null,
    );

    const [draft, publish] = await Promise.all([
      this.authorization.can(
        user,
        CAPABILITIES.WORK_TYPE_DRAFT,
        officeId,
        null,
      ),
      this.authorization.can(
        user,
        CAPABILITIES.WORK_TYPE_PUBLISH,
        officeId,
        null,
      ),
    ]);

    return {
      office,
      availableActions: {
        view: true,
        draft,
        publish,
      },
    };
  }

  async getConfigurationContext(user: AuthenticatedUser, officeId: string) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_VIEW,
      officeId,
      null,
    );

    const canDraft = await this.authorization.can(
      user,
      CAPABILITIES.WORK_TYPE_DRAFT,
      officeId,
      null,
    );

    const orgUnits = await this.prisma.orgUnit.findMany({
      where: { officeId, orgUnitType: { isTeam: false } },
      orderBy: [{ isActive: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        parentOrgUnitId: true,
        orgUnitType: {
          select: {
            code: true,
            name: true,
            isTeam: true,
          },
        },
      },
    });

    if (!canDraft) {
      return {
        office,
        orgUnits,
        creatorAccounts: [],
      };
    }

    const now = new Date();
    const memberships = await this.prisma.orgMembership.findMany({
      where: {
        officeId,
        membershipType: OrgMembershipType.PRIMARY,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        employee: {
          status: EmployeeStatus.ACTIVE,
          employmentStatus: EmploymentStatus.ACTIVE,
          archivedAt: null,
          account: {
            is: {
              isEnabled: true,
              role: { not: AccountRole.SUPER_ADMIN },
            },
          },
        },
      },
      orderBy: [
        { employee: { empName: 'asc' } },
        { employee: { empId: 'asc' } },
      ],
      select: {
        orgUnitId: true,
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
                role: true,
                isEnabled: true,
              },
            },
          },
        },
      },
    });

    return {
      office,
      orgUnits,
      creatorAccounts: memberships.flatMap((membership) =>
        membership.employee.account
          ? [
              {
                accountId: membership.employee.account.id,
                username: membership.employee.account.username,
                role: membership.employee.account.role,
                employeeId: membership.employee.id,
                empId: membership.employee.empId,
                empName: membership.employee.empName,
                designation: membership.employee.designation,
                primaryOrgUnitId: membership.orgUnitId,
              },
            ]
          : [],
      ),
    };
  }

  async list(user: AuthenticatedUser, officeId: string) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_VIEW,
      officeId,
      null,
    );

    const definitions = await this.prisma.workTypeDefinition.findMany({
      where: { officeId },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        officeId: true,
        code: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (definitions.length === 0) {
      return {
        office,
        data: [],
      };
    }

    const versions = await this.prisma.workTypeVersion.findMany({
      where: {
        workTypeDefinitionId: {
          in: definitions.map((definition) => definition.id),
        },
        status: {
          in: [WorkTypeVersionStatus.DRAFT, WorkTypeVersionStatus.PUBLISHED],
        },
      },
      orderBy: [{ workTypeDefinitionId: 'asc' }, { version: 'desc' }],
      select: {
        id: true,
        workTypeDefinitionId: true,
        version: true,
        status: true,
        name: true,
        description: true,
        changeReason: true,
        publishedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const currentByDefinition = new Map<
      string,
      {
        draft: (typeof versions)[number] | null;
        published: (typeof versions)[number] | null;
      }
    >();

    for (const version of versions) {
      const current = currentByDefinition.get(version.workTypeDefinitionId) ?? {
        draft: null,
        published: null,
      };

      if (
        version.status === WorkTypeVersionStatus.DRAFT &&
        current.draft === null
      ) {
        current.draft = version;
      }

      if (
        version.status === WorkTypeVersionStatus.PUBLISHED &&
        current.published === null
      ) {
        current.published = version;
      }

      currentByDefinition.set(version.workTypeDefinitionId, current);
    }

    return {
      office,
      data: definitions.map((definition) => ({
        ...definition,
        currentPublishedVersion:
          currentByDefinition.get(definition.id)?.published ?? null,
        currentDraftVersion:
          currentByDefinition.get(definition.id)?.draft ?? null,
      })),
    };
  }

  async createDraft(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
    dto: CreateWorkTypeDraftDto,
  ) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_DRAFT,
      officeId,
      null,
    );

    const draft = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkTypeDefinition(tx, officeId, workTypeDefinitionId);

      const existingDraft = await tx.workTypeVersion.findFirst({
        where: {
          workTypeDefinitionId,
          status: WorkTypeVersionStatus.DRAFT,
        },
        select: {
          id: true,
          version: true,
        },
      });

      if (existingDraft) {
        throw new ConflictException(
          'This work type already has an open draft.',
        );
      }

      const published = await tx.workTypeVersion.findFirst({
        where: {
          workTypeDefinitionId,
          status: WorkTypeVersionStatus.PUBLISHED,
        },
        orderBy: {
          version: 'desc',
        },
        select: {
          name: true,
          description: true,
          ...VERSION_CONFIGURATION_SELECT,
        },
      });

      if (!published) {
        throw new BadRequestException(
          'A published work type version is required before creating a new draft.',
        );
      }

      const latestVersion = await tx.workTypeVersion.findFirst({
        where: {
          workTypeDefinitionId,
        },
        orderBy: {
          version: 'desc',
        },
        select: {
          version: true,
        },
      });

      const created = await tx.workTypeVersion.create({
        data: {
          workTypeDefinitionId,
          version: (latestVersion?.version ?? 0) + 1,
          status: WorkTypeVersionStatus.DRAFT,
          name: published.name,
          description: published.description,
          changeReason: dto.changeReason ?? null,
          primaryOwnerOrgUnitId: published.primaryOwnerOrgUnitId,
          creatorCategories: published.creatorCategories,
          creatorScope: published.creatorScope,
          finalClosureMode: published.finalClosureMode,
          finalClosureLeadershipType: published.finalClosureLeadershipType,
          slaBasis: published.slaBasis,
          overallSlaMinutes: published.overallSlaMinutes,
          createdByAccountId: user.accountId,
        },
        select: VERSION_SUMMARY_SELECT,
      });

      await this.clonePublishedConfiguration(tx, published, created.id);

      return created;
    });

    return {
      office,
      draft,
    };
  }

  async updateDraft(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
    versionId: string,
    dto: UpdateWorkTypeDraftDto,
  ) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_DRAFT,
      officeId,
      null,
    );

    const data: {
      name?: string;
      description?: string | null;
      changeReason?: string | null;
    } = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }

    if (dto.description !== undefined) {
      data.description = dto.description;
    }

    if (dto.changeReason !== undefined) {
      data.changeReason = dto.changeReason;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException(
        'Provide at least one draft field to update.',
      );
    }

    const draft = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkTypeDefinition(tx, officeId, workTypeDefinitionId);

      await this.requireDraft(tx, workTypeDefinitionId, versionId);

      return tx.workTypeVersion.update({
        where: {
          id: versionId,
        },
        data,
        select: VERSION_SUMMARY_SELECT,
      });
    });

    return {
      office,
      draft,
    };
  }

  async replaceDraftConfiguration(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
    versionId: string,
    dto: ReplaceWorkTypeDraftConfigurationDto,
  ) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_DRAFT,
      officeId,
      null,
    );

    this.validateConfigurationShape(dto);

    const configuration = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkTypeDefinition(tx, officeId, workTypeDefinitionId);

      await this.requireDraft(tx, workTypeDefinitionId, versionId);

      const referencedOrgUnitIds = [
        ...(dto.primaryOwnerOrgUnitId ? [dto.primaryOwnerOrgUnitId] : []),
        ...dto.creatorOrgUnits.map((item) => item.orgUnitId),
        ...dto.stages
          .map((stage) => stage.responsibleOrgUnitId)
          .filter((id): id is string => Boolean(id)),
      ];

      await this.assertOrgUnitsInOffice(tx, officeId, referencedOrgUnitIds);
      await this.assertCreatorAccountsInOffice(
        tx,
        officeId,
        dto.creatorAccounts.map((item) => item.accountId),
      );

      await this.clearStageActivationReferences(tx, versionId);
      await tx.workStageDependency.deleteMany({
        where: { workTypeVersionId: versionId },
      });
      await tx.workFieldDefinition.deleteMany({
        where: { workTypeVersionId: versionId },
      });
      await tx.workStageDefinition.deleteMany({
        where: { workTypeVersionId: versionId },
      });
      await tx.workTypeCreatorOrgUnit.deleteMany({
        where: { workTypeVersionId: versionId },
      });
      await tx.workTypeCreatorAccount.deleteMany({
        where: { workTypeVersionId: versionId },
      });

      await tx.workTypeVersion.update({
        where: { id: versionId },
        data: {
          primaryOwnerOrgUnitId: dto.primaryOwnerOrgUnitId ?? null,
          creatorCategories: dto.creatorCategories,
          creatorScope: dto.creatorScope,
          finalClosureMode: dto.finalClosureMode,
          finalClosureLeadershipType: dto.finalClosureLeadershipType ?? null,
          slaBasis: dto.slaBasis,
          overallSlaMinutes: dto.overallSlaMinutes ?? null,
        },
      });

      if (dto.creatorOrgUnits.length > 0) {
        await tx.workTypeCreatorOrgUnit.createMany({
          data: dto.creatorOrgUnits.map((item) => ({
            workTypeVersionId: versionId,
            orgUnitId: item.orgUnitId,
            includeDescendants: item.includeDescendants ?? false,
          })),
        });
      }

      if (dto.creatorAccounts.length > 0) {
        await tx.workTypeCreatorAccount.createMany({
          data: dto.creatorAccounts.map((item) => ({
            workTypeVersionId: versionId,
            accountId: item.accountId,
          })),
        });
      }

      const stageIdByCode = new Map<string, string>();
      for (const stage of dto.stages) {
        const created = await tx.workStageDefinition.create({
          data: {
            workTypeVersionId: versionId,
            code: stage.code,
            name: stage.name,
            description: stage.description ?? null,
            sortOrder: stage.sortOrder ?? 0,
            isRequired: stage.isRequired ?? true,
            responsibleOrgUnitRule: stage.responsibleOrgUnitRule,
            responsibleOrgUnitId: stage.responsibleOrgUnitId ?? null,
            assignmentMode: stage.assignmentMode,
            approvalMode: stage.approvalMode ?? WorkStageApprovalMode.NONE,
            approvalLeadershipType: stage.approvalLeadershipType ?? null,
            activationMode: WorkStageActivationMode.ALWAYS,
            activationFieldDefinitionId: null,
            activationExpectedValue: undefined,
            slaMinutes: stage.slaMinutes ?? null,
          },
          select: { id: true },
        });
        stageIdByCode.set(stage.code, created.id);
      }

      const fieldIdByCode = new Map<string, string>();
      for (const field of dto.fields) {
        const created = await tx.workFieldDefinition.create({
          data: {
            workTypeVersionId: versionId,
            stageDefinitionId: field.stageCode
              ? stageIdByCode.get(field.stageCode)
              : null,
            code: field.code,
            label: field.label,
            fieldType: field.fieldType,
            isRequired: field.isRequired ?? false,
            sortOrder: field.sortOrder ?? 0,
            config: field.config as Prisma.InputJsonValue | undefined,
          },
          select: { id: true },
        });
        fieldIdByCode.set(field.code, created.id);
      }

      for (const stage of dto.stages) {
        const stageId = stageIdByCode.get(stage.code);
        if (!stageId) {
          throw new ConflictException(`Failed to save stage ${stage.code}.`);
        }

        const activationMode =
          stage.activationMode ?? WorkStageActivationMode.ALWAYS;
        const activationFieldDefinitionId = stage.activationFieldCode
          ? fieldIdByCode.get(stage.activationFieldCode)
          : null;

        if (stage.activationFieldCode && !activationFieldDefinitionId) {
          throw new ConflictException(
            `Failed to resolve activation field ${stage.activationFieldCode}.`,
          );
        }

        await tx.workStageDefinition.update({
          where: { id: stageId },
          data: {
            activationMode,
            activationFieldDefinitionId,
            activationExpectedValue:
              stage.activationExpectedValue === undefined
                ? undefined
                : (stage.activationExpectedValue as Prisma.InputJsonValue),
          },
        });
      }

      if (dto.dependencies.length > 0) {
        await tx.workStageDependency.createMany({
          data: dto.dependencies.map((dependency) => ({
            workTypeVersionId: versionId,
            stageDefinitionId: stageIdByCode.get(dependency.stageCode)!,
            prerequisiteStageId: stageIdByCode.get(
              dependency.prerequisiteStageCode,
            )!,
          })),
        });
      }

      return tx.workTypeVersion.findUnique({
        where: { id: versionId },
        select: {
          ...VERSION_SUMMARY_SELECT,
          ...VERSION_CONFIGURATION_SELECT,
        },
      });
    });

    if (!configuration) {
      throw new NotFoundException('Work type version was not found.');
    }

    return {
      office,
      draft: configuration,
    };
  }

  async discardDraft(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
    versionId: string,
  ) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_DRAFT,
      officeId,
      null,
    );

    const discarded = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkTypeDefinition(tx, officeId, workTypeDefinitionId);

      const draft = await this.requireDraft(
        tx,
        workTypeDefinitionId,
        versionId,
      );

      await this.clearStageActivationReferences(tx, versionId);

      await tx.workTypeVersion.delete({
        where: {
          id: versionId,
        },
      });

      return {
        id: draft.id,
        version: draft.version,
      };
    });

    return {
      office,
      discardedDraft: discarded,
    };
  }

  async publishDraft(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
    versionId: string,
  ) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_PUBLISH,
      officeId,
      null,
    );

    const publishedVersion = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkTypeDefinition(tx, officeId, workTypeDefinitionId);

      await this.requireDraft(tx, workTypeDefinitionId, versionId);

      await this.assertPublishableConfiguration(tx, officeId, versionId);

      const currentPublished = await tx.workTypeVersion.findMany({
        where: {
          workTypeDefinitionId,
          status: WorkTypeVersionStatus.PUBLISHED,
        },
        orderBy: {
          version: 'desc',
        },
        select: {
          id: true,
        },
      });

      if (currentPublished.length > 1) {
        throw new ConflictException(
          'This work type has more than one published version and must be reconciled before publishing.',
        );
      }

      const now = new Date();

      if (currentPublished[0]) {
        await tx.workTypeVersion.update({
          where: {
            id: currentPublished[0].id,
          },
          data: {
            status: WorkTypeVersionStatus.RETIRED,
            retiredByAccountId: user.accountId,
            retiredAt: now,
          },
        });
      }

      return tx.workTypeVersion.update({
        where: {
          id: versionId,
        },
        data: {
          status: WorkTypeVersionStatus.PUBLISHED,
          publishedByAccountId: user.accountId,
          publishedAt: now,
          retiredByAccountId: null,
          retiredAt: null,
        },
        select: VERSION_SUMMARY_SELECT,
      });
    });

    return {
      office,
      publishedVersion,
    };
  }

  async getById(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
  ) {
    const office = await this.getOffice(officeId);

    await this.authorization.assertCan(
      user,
      CAPABILITIES.WORK_TYPE_VIEW,
      officeId,
      null,
    );

    const definition = await this.prisma.workTypeDefinition.findFirst({
      where: {
        id: workTypeDefinitionId,
        officeId,
      },
      select: {
        id: true,
        officeId: true,
        code: true,
        isActive: true,
        sortOrder: true,
        createdAt: true,
        updatedAt: true,
        versions: {
          orderBy: {
            version: 'desc',
          },
          select: {
            id: true,
            version: true,
            status: true,
            name: true,
            description: true,
            changeReason: true,
            createdByAccountId: true,
            publishedByAccountId: true,
            retiredByAccountId: true,
            publishedAt: true,
            retiredAt: true,
            createdAt: true,
            updatedAt: true,
            ...VERSION_CONFIGURATION_SELECT,
            createdBy: {
              select: {
                id: true,
                username: true,
              },
            },
            publishedBy: {
              select: {
                id: true,
                username: true,
              },
            },
            retiredBy: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
    });

    if (!definition) {
      throw new NotFoundException('Work type was not found in this office.');
    }

    return {
      office,
      workType: definition,
    };
  }
}
