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
  WorkFieldType,
  WorkFinalClosureMode,
  WorkSlaBasis,
  WorkTypeCreatorCategory,
  WorkTypeCreatorScope,
  WorkTypeVersionStatus,
} from '../generated/prisma/client';
import { CAPABILITIES } from '../organization/organization-capabilities';
import { OrganizationAuthorizationService } from '../organization/organization-authorization.service';
import {
  isWorkFoundationCompletionFieldCode,
  WORK_FOUNDATION_COMPLETION_FIELD_CODES,
  WORK_SYSTEM_CONTROLLED_FIELD_CODES,
} from './work-foundation.constants';
import { WorkSlaService } from './work-sla.service';
import {
  DEFAULT_WORK_TYPE_CODES,
  ensureDefaultWorkTypeCatalog,
} from './default-work-type-catalog';
import type { CreateWorkTypeDefinitionDto } from './dto/create-work-type-definition.dto';
import type { CreateWorkTypeDraftDto } from './dto/create-work-type-draft.dto';
import type {
  ReplaceWorkTypeDraftConfigurationDto,
  WorkFieldDefinitionDto,
} from './dto/replace-work-type-draft-configuration.dto';
import type { UpdateWorkTypeDraftDto } from './dto/update-work-type-draft.dto';
import {
  assertWorkTypeTemplate,
  WorkTypeTemplate,
} from './fixed-work-type-template';

const VERSION_SUMMARY_SELECT = {
  id: true,
  workTypeDefinitionId: true,
  version: true,
  status: true,
  name: true,
  description: true,
  salesDisplayLabel: true,
  template: true,
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
  template: true,
  salesDisplayLabel: true,
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
    where: { code: { notIn: [...WORK_SYSTEM_CONTROLLED_FIELD_CODES] } },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
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
} satisfies Prisma.WorkTypeVersionSelect;

const WORK_FIELD_COLLECTION_MODES = new Set<string>([
  'CREATION_ONLY',
  'COMPLETION_ONLY',
  'CREATION_AND_COMPLETION',
  'STAGE_ONLY',
]);
const WORK_FIELD_COMPLETION_MODES = new Set<string>(['READ_ONLY', 'EDITABLE']);

@Injectable()
export class WorkTypeV3Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorization: OrganizationAuthorizationService,
    private readonly sla: WorkSlaService,
  ) {}

  private async getWorkTypeManagerScope(
    user: AuthenticatedUser,
    officeId: string,
  ) {
    const account = await this.prisma.account.findUnique({
      where: { id: user.accountId },
      select: { employeeId: true },
    });
    if (!account?.employeeId) {
      return {
        isOfficeHead: false,
        officeWideManagement: false,
        divisionOrgUnitIds: [] as string[],
        delegatedOnly: false,
      };
    }

    const now = new Date();
    const assignments = await this.prisma.orgLeadershipAssignment.findMany({
      where: {
        employeeId: account.employeeId,
        officeId,
        effectiveFrom: { lte: now },
        OR: [{ effectiveUntil: null }, { effectiveUntil: { gt: now } }],
        leadershipType: {
          in: [OrgLeadershipType.OFFICE_HEAD, OrgLeadershipType.ORG_UNIT_HEAD],
        },
      },
      select: {
        leadershipType: true,
        orgUnitId: true,
        orgUnit: { select: { orgUnitType: { select: { code: true } } } },
      },
    });

    const isOfficeHead = assignments.some(
      (item) => item.leadershipType === OrgLeadershipType.OFFICE_HEAD,
    );
    const formalDivisionOrgUnitIds = assignments
      .filter(
        (item) =>
          item.leadershipType === OrgLeadershipType.ORG_UNIT_HEAD &&
          item.orgUnit?.orgUnitType.code === 'DIVISION' &&
          item.orgUnitId,
      )
      .map((item) => item.orgUnitId as string);

    if (isOfficeHead) {
      return {
        isOfficeHead: true,
        officeWideManagement: true,
        divisionOrgUnitIds: formalDivisionOrgUnitIds,
        delegatedOnly: false,
      };
    }

    if (formalDivisionOrgUnitIds.length > 0) {
      return {
        isOfficeHead: false,
        officeWideManagement: false,
        divisionOrgUnitIds: formalDivisionOrgUnitIds,
        delegatedOnly: false,
      };
    }

    const hasOfficeWideDraft = await this.authorization.can(
      user,
      CAPABILITIES.WORK_TYPE_DRAFT,
      officeId,
      null,
    );
    if (hasOfficeWideDraft) {
      return {
        isOfficeHead: false,
        officeWideManagement: true,
        divisionOrgUnitIds: [] as string[],
        delegatedOnly: true,
      };
    }

    const visibleOrgUnitIds = await this.authorization.visibleOrgUnitIds(
      user,
      CAPABILITIES.WORK_TYPE_DRAFT,
      officeId,
    );
    if (visibleOrgUnitIds.length === 0) {
      return {
        isOfficeHead: false,
        officeWideManagement: false,
        divisionOrgUnitIds: [] as string[],
        delegatedOnly: false,
      };
    }

    const delegatedDivisions = await this.prisma.orgUnit.findMany({
      where: {
        id: { in: visibleOrgUnitIds },
        officeId,
        isActive: true,
        orgUnitType: { code: 'DIVISION', isTeam: false },
      },
      select: { id: true },
    });

    return {
      isOfficeHead: false,
      officeWideManagement: false,
      divisionOrgUnitIds: delegatedDivisions.map((item) => item.id),
      delegatedOnly: delegatedDivisions.length > 0,
    };
  }

  private async assertCanViewWorkTypeCatalog(
    user: AuthenticatedUser,
    officeId: string,
  ) {
    if (
      await this.authorization.can(
        user,
        CAPABILITIES.WORK_TYPE_VIEW,
        officeId,
        null,
      )
    ) {
      return;
    }

    const managerScope = await this.getWorkTypeManagerScope(user, officeId);
    if (
      managerScope.officeWideManagement ||
      managerScope.divisionOrgUnitIds.length > 0
    ) {
      return;
    }

    throw new ForbiddenException(
      'You do not have permission to view Work Types in this organizational scope.',
    );
  }

  private async assertCanManageDefinition(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
    capability:
      | typeof CAPABILITIES.WORK_TYPE_DRAFT
      | typeof CAPABILITIES.WORK_TYPE_PUBLISH = CAPABILITIES.WORK_TYPE_DRAFT,
  ) {
    if (capability === CAPABILITIES.WORK_TYPE_PUBLISH) {
      await this.authorization.assertCan(user, capability, officeId, null);
    }

    const scope = await this.getWorkTypeManagerScope(user, officeId);
    if (!scope.officeWideManagement && scope.divisionOrgUnitIds.length === 0) {
      throw new ForbiddenException(
        'Work Type Management access is required for this action.',
      );
    }
    if (scope.officeWideManagement) return scope;

    const version = await this.prisma.workTypeVersion.findFirst({
      where: {
        workTypeDefinitionId,
        workTypeDefinition: { officeId },
        status: {
          in: [WorkTypeVersionStatus.DRAFT, WorkTypeVersionStatus.PUBLISHED],
        },
      },
      orderBy: [{ status: 'asc' }, { version: 'desc' }],
      select: { creatorOrgUnits: { select: { orgUnitId: true } } },
    });
    if (
      !version ||
      !version.creatorOrgUnits.some((item) =>
        scope.divisionOrgUnitIds.includes(item.orgUnitId),
      )
    ) {
      throw new ForbiddenException(
        'You can manage only Work Types owned by your authorized Division scope.',
      );
    }
    return scope;
  }

  private async assertDelegatedSystemInformationBoundary(
    tx: Prisma.TransactionClient,
    officeId: string,
    workTypeDefinitionId: string,
    versionId: string,
    delegatedOnly: boolean,
    configuration: ReplaceWorkTypeDraftConfigurationDto,
  ): Promise<boolean> {
    if (!delegatedOnly) return false;

    const definition = await tx.workTypeDefinition.findFirst({
      where: { id: workTypeDefinitionId, officeId },
      select: { code: true },
    });
    if (!definition || !DEFAULT_WORK_TYPE_CODES.includes(definition.code)) {
      return false;
    }

    const current = await tx.workTypeVersion.findUnique({
      where: { id: versionId },
      select: {
        template: true,
        salesDisplayLabel: true,
        primaryOwnerOrgUnitId: true,
        creatorCategories: true,
        creatorScope: true,
        finalClosureMode: true,
        finalClosureLeadershipType: true,
        slaBasis: true,
        overallSlaMinutes: true,
        creatorOrgUnits: {
          select: { orgUnitId: true, includeDescendants: true },
        },
        creatorAccounts: { select: { accountId: true } },
      },
    });
    if (!current) {
      throw new NotFoundException('Work type version was not found.');
    }

    const normalize = (values: readonly string[]) =>
      [...values].sort().join('|');
    const normalizeOwners = (
      values: Array<{ orgUnitId: string; includeDescendants?: boolean }>,
    ) =>
      values
        .map((item) => `${item.orgUnitId}:${item.includeDescendants === true}`)
        .sort()
        .join('|');

    const currentTemplate = assertWorkTypeTemplate(current.template);

    const structuralChange =
      configuration.template !== currentTemplate ||
      (configuration.salesDisplayLabel?.trim() || null) !==
        (current.salesDisplayLabel?.trim() || null) ||
      (configuration.primaryOwnerOrgUnitId ?? null) !==
        current.primaryOwnerOrgUnitId ||
      normalize(configuration.creatorCategories) !==
        normalize(current.creatorCategories) ||
      configuration.creatorScope !== current.creatorScope ||
      normalizeOwners(configuration.creatorOrgUnits) !==
        normalizeOwners(current.creatorOrgUnits) ||
      normalize(configuration.creatorAccounts.map((item) => item.accountId)) !==
        normalize(current.creatorAccounts.map((item) => item.accountId)) ||
      configuration.finalClosureMode !== current.finalClosureMode ||
      (configuration.finalClosureLeadershipType ?? null) !==
        current.finalClosureLeadershipType ||
      configuration.slaBasis !== current.slaBasis ||
      (configuration.overallSlaMinutes ?? null) !== current.overallSlaMinutes;

    if (structuralChange) {
      throw new ForbiddenException(
        'Delegated Work Type Management may change only Information fields on the eight permanent Work Types.',
      );
    }

    return true;
  }

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
    assertWorkTypeTemplate(dto.template);

    const creatorOrgUnitIds = dto.creatorOrgUnits.map((item) => item.orgUnitId);
    if (new Set(creatorOrgUnitIds).size !== creatorOrgUnitIds.length) {
      throw new BadRequestException('Creator OrgUnits must be unique.');
    }

    const creatorAccountIds = dto.creatorAccounts.map((item) => item.accountId);
    if (new Set(creatorAccountIds).size !== creatorAccountIds.length) {
      throw new BadRequestException('Creator accounts must be unique.');
    }

    if (dto.creatorCategories.includes(WorkTypeCreatorCategory.TEAM_LEAD)) {
      throw new BadRequestException(
        'Team Lead is an employee responsibility and cannot grant Work creation authority.',
      );
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

    if (dto.finalClosureMode !== WorkFinalClosureMode.PRIMARY_OWNER_HEAD) {
      throw new BadRequestException(
        'New Work uses an explicit Responsible Reviewer. Keep final closure on the Primary Owner Head fallback.',
      );
    }

    if (dto.finalClosureLeadershipType) {
      throw new BadRequestException(
        'Fixed Work templates do not use configurable final-closure leadership.',
      );
    }

    const fieldsByCode = new Map(
      dto.fields.map((field) => [field.code, field]),
    );
    if (fieldsByCode.size !== dto.fields.length) {
      throw new BadRequestException('Work field codes must be unique.');
    }

    const reportReferenceFields = dto.fields.filter(
      (field) => field.config?.reportReference === true,
    );
    if (reportReferenceFields.length > 1) {
      throw new BadRequestException(
        'A Work Type can use only one Work Details field as its Report Reference.',
      );
    }

    for (const field of dto.fields) {
      if (isWorkFoundationCompletionFieldCode(field.code)) {
        throw new BadRequestException(
          `Field ${field.code} is system controlled and cannot be configured as Information.`,
        );
      }
      this.validateFieldConfiguration(field);
      if (field.config?.collectionMode === 'STAGE_ONLY') {
        throw new BadRequestException(
          `Field ${field.code} cannot use stage-only collection because Work uses the fixed classic lifecycle.`,
        );
      }
    }
  }

  private validateFieldConfiguration(field: WorkFieldDefinitionDto): void {
    const config = field.config;
    if (!config || config.collectionMode === undefined) {
      throw new BadRequestException(
        `Field ${field.code} must define when it is collected.`,
      );
    }

    const sharedFieldConfigKeys = new Set([
      'collectionMode',
      'completionMode',
      'reportReference',
    ]);
    const fieldSpecificKeys = Object.keys(config).filter(
      (key) => !sharedFieldConfigKeys.has(key),
    );
    const assertAllowedKeys = (allowed: string[]) => {
      const unexpected = fieldSpecificKeys.filter(
        (key) => !allowed.includes(key),
      );
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

    const collectionMode = config.collectionMode;
    if (
      collectionMode !== undefined &&
      (typeof collectionMode !== 'string' ||
        !WORK_FIELD_COLLECTION_MODES.has(collectionMode))
    ) {
      throw new BadRequestException(
        `Field ${field.code} collectionMode is not supported.`,
      );
    }
    const reportReference = config.reportReference;
    if (reportReference !== undefined && typeof reportReference !== 'boolean') {
      throw new BadRequestException(
        `Field ${field.code} reportReference must be true or false.`,
      );
    }

    const completionMode = config.completionMode;
    if (
      completionMode !== undefined &&
      (typeof completionMode !== 'string' ||
        !WORK_FIELD_COMPLETION_MODES.has(completionMode))
    ) {
      throw new BadRequestException(
        `Field ${field.code} completionMode is not supported.`,
      );
    }
    if (
      completionMode !== undefined &&
      collectionMode !== 'CREATION_AND_COMPLETION'
    ) {
      throw new BadRequestException(
        `Field ${field.code} completionMode is only valid for Creation + Completion fields.`,
      );
    }
    if (
      collectionMode === 'CREATION_AND_COMPLETION' &&
      (field.fieldType === WorkFieldType.IMAGE ||
        field.fieldType === WorkFieldType.FILE)
    ) {
      throw new BadRequestException(
        `Field ${field.code} cannot use Creation + Completion for File or Image.`,
      );
    }

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
        assertAllowedKeys(['options', 'allowOther', 'otherLabel']);
        validateOptions();
        if (
          config.allowOther !== undefined &&
          typeof config.allowOther !== 'boolean'
        ) {
          throw new BadRequestException(
            `Field ${field.code} allowOther must be true or false.`,
          );
        }
        if (
          config.otherLabel !== undefined &&
          (typeof config.otherLabel !== 'string' ||
            config.otherLabel.trim().length === 0 ||
            config.otherLabel.length > 120)
        ) {
          throw new BadRequestException(
            `Field ${field.code} otherLabel must be a non-empty string up to 120 characters.`,
          );
        }
        return;
      case WorkFieldType.MULTI_SELECT: {
        assertAllowedKeys([
          'options',
          'minSelections',
          'maxSelections',
          'allowOther',
          'otherLabel',
        ]);
        const options = validateOptions();
        if (
          config.allowOther !== undefined &&
          typeof config.allowOther !== 'boolean'
        ) {
          throw new BadRequestException(
            `Field ${field.code} allowOther must be true or false.`,
          );
        }
        if (
          config.otherLabel !== undefined &&
          (typeof config.otherLabel !== 'string' ||
            config.otherLabel.trim().length === 0 ||
            config.otherLabel.length > 120)
        ) {
          throw new BadRequestException(
            `Field ${field.code} otherLabel must be a non-empty string up to 120 characters.`,
          );
        }
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
        assertAllowedKeys([]);
        return;
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
      template: string;
      creatorOrgUnits: Array<{
        orgUnitId: string;
        includeDescendants: boolean;
      }>;
      creatorAccounts: Array<{ accountId: string }>;
      fields: Array<{
        code: string;
        label: string;
        fieldType: WorkFieldType;
        isRequired: boolean;
        sortOrder: number;
        config: unknown;
      }>;
    },
    draftVersionId: string,
  ): Promise<void> {
    assertWorkTypeTemplate(source.template);

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

    for (const field of source.fields.filter(
      (candidate) => !isWorkFoundationCompletionFieldCode(candidate.code),
    )) {
      await tx.workFieldDefinition.create({
        data: {
          workTypeVersionId: draftVersionId,
          stageDefinitionId: null,
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

    assertWorkTypeTemplate(configuration.template);
    if (
      configuration.finalClosureMode !== WorkFinalClosureMode.PRIMARY_OWNER_HEAD
    ) {
      throw new BadRequestException(
        'Work Type final closure must remain on the fixed Responsible Reviewer lifecycle.',
      );
    }

    if (configuration.creatorOrgUnits.length === 0) {
      if (
        !configuration.creatorCategories.includes(
          WorkTypeCreatorCategory.OFFICE_HEAD,
        )
      ) {
        throw new BadRequestException(
          'A Work Type without Primary Owner Divisions must remain creatable by the Office Head.',
        );
      }
    } else {
      if (
        configuration.creatorScope !== WorkTypeCreatorScope.SPECIFIC_ORG_UNITS
      ) {
        throw new BadRequestException(
          'Primary Owner Divisions must use the specific OrgUnit creation scope.',
        );
      }
      const ownerIds = configuration.creatorOrgUnits.map(
        (item) => item.orgUnitId,
      );
      const ownerDivisions = await tx.orgUnit.findMany({
        where: {
          id: { in: ownerIds },
          officeId,
          isActive: true,
          orgUnitType: { code: 'DIVISION', isTeam: false },
        },
        select: { id: true },
      });
      if (ownerDivisions.length !== new Set(ownerIds).size) {
        throw new BadRequestException(
          'Primary Owners must be active Division OrgUnits in this Office.',
        );
      }
      if (
        configuration.creatorOrgUnits.some((item) => !item.includeDescendants)
      ) {
        throw new BadRequestException(
          'Primary Owner Divisions must include their descendant OrgUnits for Work creation access.',
        );
      }
    }

    if (configuration.slaBasis === WorkSlaBasis.OFFICE_WORKING_DURATION) {
      await this.sla.assertUsableOfficeCalendar(tx, officeId);
    }

    await this.assertOrgUnitsInOffice(
      tx,
      officeId,
      configuration.creatorOrgUnits.map((item) => item.orgUnitId),
    );
    await this.assertCreatorAccountsInOffice(
      tx,
      officeId,
      configuration.creatorAccounts.map((item) => item.accountId),
    );
  }

  async getActionContext(user: AuthenticatedUser, officeId: string) {
    const office = await this.getOffice(officeId);

    await this.assertCanViewWorkTypeCatalog(user, officeId);

    const managerScope = await this.getWorkTypeManagerScope(user, officeId);
    const directDraft = await this.authorization.can(
      user,
      CAPABILITIES.WORK_TYPE_DRAFT,
      officeId,
      null,
    );
    const draft =
      directDraft ||
      (managerScope.delegatedOnly &&
        (managerScope.officeWideManagement ||
          managerScope.divisionOrgUnitIds.length > 0));
    const publish = await this.authorization.can(
      user,
      CAPABILITIES.WORK_TYPE_PUBLISH,
      officeId,
      null,
    );

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

    await this.assertCanViewWorkTypeCatalog(user, officeId);

    const managerScope = await this.getWorkTypeManagerScope(user, officeId);
    const directDraft = await this.authorization.can(
      user,
      CAPABILITIES.WORK_TYPE_DRAFT,
      officeId,
      null,
    );
    const canDraft =
      directDraft ||
      (managerScope.delegatedOnly &&
        (managerScope.officeWideManagement ||
          managerScope.divisionOrgUnitIds.length > 0));

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
        officeWideManagement: false,
        manageableDivisionOrgUnitIds: [],
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
      officeWideManagement: managerScope.officeWideManagement,
      manageableDivisionOrgUnitIds: managerScope.divisionOrgUnitIds,
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

  private makeDefinitionCode(name: string): string {
    const normalized = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 70);
    return normalized || 'WORK_TYPE';
  }

  async createDefinition(
    user: AuthenticatedUser,
    officeId: string,
    dto: CreateWorkTypeDefinitionDto,
  ) {
    const office = await this.getOffice(officeId);
    const managerScope = await this.getWorkTypeManagerScope(user, officeId);
    if (
      !managerScope.officeWideManagement &&
      managerScope.divisionOrgUnitIds.length === 0
    ) {
      throw new ForbiddenException(
        'Work Type Management access is required to create a Work Type.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const baseCode = this.makeDefinitionCode(dto.name);
      let code = baseCode;
      let suffix = 2;

      while (
        await tx.workTypeDefinition.findUnique({
          where: { officeId_code: { officeId, code } },
          select: { id: true },
        })
      ) {
        const tail = `_${suffix++}`;
        code = `${baseCode.slice(0, 80 - tail.length)}${tail}`;
      }

      const definition = await tx.workTypeDefinition.create({
        data: {
          officeId,
          code,
          isActive: true,
          sortOrder: 1000,
          createdByAccountId: user.accountId,
        },
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

      const draft = await tx.workTypeVersion.create({
        data: {
          workTypeDefinitionId: definition.id,
          version: 1,
          status: WorkTypeVersionStatus.DRAFT,
          name: dto.name,
          description: dto.description ?? null,
          template: dto.template,
          salesDisplayLabel:
            dto.template === WorkTypeTemplate.TEAM_SALES ? 'Sales' : null,
          changeReason: 'New Work Type',
          creatorCategories: [
            WorkTypeCreatorCategory.OFFICE_HEAD,
            WorkTypeCreatorCategory.ORG_UNIT_HEAD,
          ],
          creatorScope: WorkTypeCreatorScope.PRIMARY_OWNER_SUBTREE,
          finalClosureMode: WorkFinalClosureMode.PRIMARY_OWNER_HEAD,
          slaBasis: WorkSlaBasis.CALENDAR_DURATION,
          createdByAccountId: user.accountId,
        },
        select: VERSION_SUMMARY_SELECT,
      });

      if (
        !managerScope.officeWideManagement &&
        managerScope.divisionOrgUnitIds.length > 0
      ) {
        await tx.workTypeCreatorOrgUnit.createMany({
          data: managerScope.divisionOrgUnitIds.map((orgUnitId) => ({
            workTypeVersionId: draft.id,
            orgUnitId,
            includeDescendants: true,
          })),
        });
      }

      return { definition, draft };
    });

    return { office, ...created };
  }

  async removeDefinition(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
  ) {
    const office = await this.getOffice(officeId);
    const managerScope = await this.assertCanManageDefinition(
      user,
      officeId,
      workTypeDefinitionId,
      CAPABILITIES.WORK_TYPE_DRAFT,
    );

    if (managerScope.delegatedOnly) {
      throw new ForbiddenException(
        'Shared Work Type Management can prepare drafts, but catalog activation and deactivation remain Head-controlled.',
      );
    }

    const definition = await this.prisma.workTypeDefinition.findFirst({
      where: { id: workTypeDefinitionId, officeId },
      select: { id: true, isActive: true },
    });
    if (!definition) throw new NotFoundException('Work type was not found.');

    await this.prisma.workTypeDefinition.update({
      where: { id: definition.id },
      data: { isActive: false },
    });

    return {
      office,
      removedWorkType: { id: definition.id },
      message: 'Work Type removed. Existing Work and history are unchanged.',
    };
  }

  async permanentlyDeleteDefinition(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
  ) {
    const office = await this.getOffice(officeId);
    const managerScope = await this.assertCanManageDefinition(
      user,
      officeId,
      workTypeDefinitionId,
      CAPABILITIES.WORK_TYPE_DRAFT,
    );
    if (managerScope.delegatedOnly) {
      throw new ForbiddenException(
        'Shared Work Type Management can prepare drafts, but permanent catalog deletion remains Head-controlled.',
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkTypeDefinition(tx, officeId, workTypeDefinitionId);
      const definition = await tx.workTypeDefinition.findFirst({
        where: { id: workTypeDefinitionId, officeId },
        select: { id: true, code: true },
      });
      if (!definition) throw new NotFoundException('Work type was not found.');
      if (DEFAULT_WORK_TYPE_CODES.includes(definition.code)) {
        throw new BadRequestException(
          'The eight system Work Types cannot be permanently deleted. Deactivate them instead.',
        );
      }

      const now = new Date();
      await tx.workTypeVersion.deleteMany({
        where: { workTypeDefinitionId, status: WorkTypeVersionStatus.DRAFT },
      });
      await tx.workTypeVersion.updateMany({
        where: {
          workTypeDefinitionId,
          status: WorkTypeVersionStatus.PUBLISHED,
        },
        data: {
          status: WorkTypeVersionStatus.RETIRED,
          retiredByAccountId: user.accountId,
          retiredAt: now,
        },
      });
      await tx.workTypeDefinition.update({
        where: { id: workTypeDefinitionId },
        data: { isActive: false },
      });
      return definition;
    });

    return {
      office,
      permanentlyDeletedWorkType: { id: result.id },
      message:
        'Custom Work Type permanently removed from the catalog. Historical Work and retired versions are preserved.',
    };
  }

  async restoreDefinition(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
  ) {
    const office = await this.getOffice(officeId);
    const managerScope = await this.assertCanManageDefinition(
      user,
      officeId,
      workTypeDefinitionId,
      CAPABILITIES.WORK_TYPE_DRAFT,
    );

    if (managerScope.delegatedOnly) {
      throw new ForbiddenException(
        'Shared Work Type Management can prepare drafts, but catalog restoration remains Head-controlled.',
      );
    }

    const definition = await this.prisma.workTypeDefinition.findFirst({
      where: { id: workTypeDefinitionId, officeId },
      select: {
        id: true,
        versions: {
          where: {
            status: {
              in: [
                WorkTypeVersionStatus.DRAFT,
                WorkTypeVersionStatus.PUBLISHED,
              ],
            },
          },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!definition) throw new NotFoundException('Work type was not found.');
    if (definition.versions.length === 0) {
      throw new BadRequestException(
        'A permanently deleted custom Work Type cannot be restored.',
      );
    }

    await this.prisma.workTypeDefinition.update({
      where: { id: definition.id },
      data: { isActive: true },
    });

    return {
      office,
      restoredWorkType: { id: definition.id },
      message: 'Work Type restored.',
    };
  }

  async list(user: AuthenticatedUser, officeId: string) {
    const office = await this.getOffice(officeId);

    await this.assertCanViewWorkTypeCatalog(user, officeId);

    const existingDefaults = await this.prisma.workTypeDefinition.findMany({
      where: { officeId, code: { in: DEFAULT_WORK_TYPE_CODES } },
      select: {
        id: true,
        code: true,
        versions: {
          where: { version: 1 },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (
      existingDefaults.length !== DEFAULT_WORK_TYPE_CODES.length ||
      existingDefaults.some((definition) => definition.versions.length === 0)
    ) {
      await this.prisma.$transaction((tx) =>
        ensureDefaultWorkTypeCatalog(tx, officeId),
      );
    }

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
        creatorOrgUnits: { select: { orgUnitId: true } },
      },
    });

    const managerScope = await this.getWorkTypeManagerScope(user, officeId);

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
      data: definitions
        .filter((definition) => {
          const current = currentByDefinition.get(definition.id);
          if (!current?.draft && !current?.published) return false;
          if (
            managerScope.officeWideManagement ||
            managerScope.divisionOrgUnitIds.length === 0
          ) {
            return true;
          }
          return [current.draft, current.published].some((version) =>
            version?.creatorOrgUnits.some((owner) =>
              managerScope.divisionOrgUnitIds.includes(owner.orgUnitId),
            ),
          );
        })
        .map((definition) => {
          const current = currentByDefinition.get(definition.id);
          const summarize = (version: (typeof versions)[number] | null) => {
            if (!version) return null;
            const { creatorOrgUnits, ...summary } = version;
            void creatorOrgUnits;
            return summary;
          };
          return {
            ...definition,
            currentPublishedVersion: summarize(current?.published ?? null),
            currentDraftVersion: summarize(current?.draft ?? null),
          };
        }),
    };
  }

  async createDraft(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
    dto: CreateWorkTypeDraftDto,
  ) {
    const office = await this.getOffice(officeId);

    await this.assertCanManageDefinition(
      user,
      officeId,
      workTypeDefinitionId,
      CAPABILITIES.WORK_TYPE_DRAFT,
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
          template: published.template,
          salesDisplayLabel: published.salesDisplayLabel,
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

    const managerScope = await this.assertCanManageDefinition(
      user,
      officeId,
      workTypeDefinitionId,
      CAPABILITIES.WORK_TYPE_DRAFT,
    );

    if (
      managerScope.delegatedOnly &&
      (dto.name !== undefined || dto.description !== undefined)
    ) {
      const definition = await this.prisma.workTypeDefinition.findFirst({
        where: { id: workTypeDefinitionId, officeId },
        select: { code: true },
      });
      if (definition && DEFAULT_WORK_TYPE_CODES.includes(definition.code)) {
        throw new ForbiddenException(
          'Delegated Work Type Management may change only Information fields on the eight permanent Work Types.',
        );
      }
    }

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
    const configurationDto: ReplaceWorkTypeDraftConfigurationDto = {
      ...dto,
      fields: dto.fields.filter(
        (field) => !isWorkFoundationCompletionFieldCode(field.code),
      ),
    };

    const managerScope = await this.assertCanManageDefinition(
      user,
      officeId,
      workTypeDefinitionId,
      CAPABILITIES.WORK_TYPE_DRAFT,
    );
    this.validateConfigurationShape(configurationDto);
    if (!managerScope.officeWideManagement) {
      const current = await this.prisma.workTypeVersion.findUnique({
        where: { id: versionId },
        select: { creatorOrgUnits: { select: { orgUnitId: true } } },
      });
      const currentOutsideOwn = new Set(
        (current?.creatorOrgUnits ?? [])
          .map((item) => item.orgUnitId)
          .filter((id) => !managerScope.divisionOrgUnitIds.includes(id)),
      );
      const requestedOutsideOwn = new Set(
        configurationDto.creatorOrgUnits
          .map((item) => item.orgUnitId)
          .filter((id) => !managerScope.divisionOrgUnitIds.includes(id)),
      );
      if (
        currentOutsideOwn.size !== requestedOutsideOwn.size ||
        [...currentOutsideOwn].some((id) => !requestedOutsideOwn.has(id))
      ) {
        throw new ForbiddenException(
          'Primary Owner access can be changed only within your authorized Division scope.',
        );
      }
    }

    const configuration = await this.prisma.$transaction(async (tx) => {
      await this.lockWorkTypeDefinition(tx, officeId, workTypeDefinitionId);
      await this.requireDraft(tx, workTypeDefinitionId, versionId);

      const informationOnly =
        await this.assertDelegatedSystemInformationBoundary(
          tx,
          officeId,
          workTypeDefinitionId,
          versionId,
          managerScope.delegatedOnly,
          configurationDto,
        );

      // Historical stage definitions are not rewritten. Active configuration is
      // canonical template + Information fields only. A delegated editor of a
      // permanent Work Type can replace only those Information fields; every
      // structural setting remains untouched inside the same locked transaction.
      await tx.workFieldDefinition.deleteMany({
        where: {
          workTypeVersionId: versionId,
          code: { notIn: [...WORK_FOUNDATION_COMPLETION_FIELD_CODES] },
        },
      });

      if (!informationOnly) {
        const referencedOrgUnitIds = [
          ...(configurationDto.primaryOwnerOrgUnitId
            ? [configurationDto.primaryOwnerOrgUnitId]
            : []),
          ...configurationDto.creatorOrgUnits.map((item) => item.orgUnitId),
        ];
        await this.assertOrgUnitsInOffice(tx, officeId, referencedOrgUnitIds);
        await this.assertCreatorAccountsInOffice(
          tx,
          officeId,
          configurationDto.creatorAccounts.map((item) => item.accountId),
        );

        await tx.workTypeCreatorOrgUnit.deleteMany({
          where: { workTypeVersionId: versionId },
        });
        await tx.workTypeCreatorAccount.deleteMany({
          where: { workTypeVersionId: versionId },
        });

        await tx.workTypeVersion.update({
          where: { id: versionId },
          data: {
            template: configurationDto.template,
            salesDisplayLabel:
              configurationDto.template === WorkTypeTemplate.TEAM_SALES
                ? configurationDto.salesDisplayLabel?.trim() || 'Sales'
                : null,
            primaryOwnerOrgUnitId:
              configurationDto.primaryOwnerOrgUnitId ?? null,
            creatorCategories: configurationDto.creatorCategories,
            creatorScope: configurationDto.creatorScope,
            finalClosureMode: WorkFinalClosureMode.PRIMARY_OWNER_HEAD,
            finalClosureLeadershipType: null,
            slaBasis: configurationDto.slaBasis,
            overallSlaMinutes: configurationDto.overallSlaMinutes ?? null,
          },
        });

        if (configurationDto.creatorOrgUnits.length > 0) {
          await tx.workTypeCreatorOrgUnit.createMany({
            data: configurationDto.creatorOrgUnits.map((item) => ({
              workTypeVersionId: versionId,
              orgUnitId: item.orgUnitId,
              includeDescendants: item.includeDescendants ?? false,
            })),
          });
        }

        if (configurationDto.creatorAccounts.length > 0) {
          await tx.workTypeCreatorAccount.createMany({
            data: configurationDto.creatorAccounts.map((item) => ({
              workTypeVersionId: versionId,
              accountId: item.accountId,
            })),
          });
        }
      }

      if (configurationDto.fields.length > 0) {
        await tx.workFieldDefinition.createMany({
          data: configurationDto.fields.map((field) => ({
            workTypeVersionId: versionId,
            stageDefinitionId: null,
            code: field.code,
            label: field.label,
            fieldType: field.fieldType,
            isRequired: field.isRequired ?? false,
            sortOrder: field.sortOrder ?? 0,
            config: field.config as Prisma.InputJsonValue | undefined,
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
    return { office, draft: configuration };
  }

  async discardDraft(
    user: AuthenticatedUser,
    officeId: string,
    workTypeDefinitionId: string,
    versionId: string,
  ) {
    const office = await this.getOffice(officeId);

    await this.assertCanManageDefinition(
      user,
      officeId,
      workTypeDefinitionId,
      CAPABILITIES.WORK_TYPE_DRAFT,
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

    await this.assertCanManageDefinition(
      user,
      officeId,
      workTypeDefinitionId,
      CAPABILITIES.WORK_TYPE_PUBLISH,
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

    await this.assertCanViewWorkTypeCatalog(user, officeId);

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

    const managerScope = await this.getWorkTypeManagerScope(user, officeId);
    if (
      !managerScope.officeWideManagement &&
      managerScope.divisionOrgUnitIds.length > 0
    ) {
      const ownsDefinition = definition.versions.some(
        (version) =>
          (version.status === WorkTypeVersionStatus.DRAFT ||
            version.status === WorkTypeVersionStatus.PUBLISHED) &&
          version.creatorOrgUnits.some((owner) =>
            managerScope.divisionOrgUnitIds.includes(owner.orgUnitId),
          ),
      );
      if (!ownsDefinition) {
        throw new ForbiddenException(
          'You can view only Work Types owned by your authorized Division scope.',
        );
      }
    }

    return {
      office,
      workType: definition,
    };
  }
}
