import type { Prisma } from '../generated/prisma/client';
import { WorkTypeTemplate } from './fixed-work-type-template';
import {
  AccountClass,
  WorkFieldType,
  WorkFinalClosureMode,
  WorkSlaBasis,
  WorkTypeCreatorCategory,
  WorkTypeCreatorScope,
  WorkTypeVersionStatus,
} from '../generated/prisma/client';

interface DefaultWorkFieldTemplate {
  code: string;
  label: string;
  fieldType: WorkFieldType;
  isRequired: boolean;
  sortOrder: number;
  config?: Prisma.InputJsonValue;
}

export interface DefaultWorkTypeTemplate {
  code: string;
  name: string;
  sortOrder: number;
  template: WorkTypeTemplate;
  fields: DefaultWorkFieldTemplate[];
}

const COMMON_OPERATIONAL_FIELDS: DefaultWorkFieldTemplate[] = [
  {
    code: 'CUSTOMER_NAME',
    label: 'Customer name',
    fieldType: WorkFieldType.TEXT,
    isRequired: true,
    sortOrder: 10,
    config: {
      maxLength: 160,
      collectionMode: 'CREATION_AND_COMPLETION',
      completionMode: 'READ_ONLY',
    },
  },
  {
    code: 'CUSTOMER_CONTACT_TYPE',
    label: 'Contact type',
    fieldType: WorkFieldType.SELECT,
    isRequired: true,
    sortOrder: 20,
    config: {
      options: ['MOBILE', 'TELEPHONE'],
      collectionMode: 'CREATION_ONLY',
    },
  },
  {
    code: 'CUSTOMER_CONTACT_NUMBER',
    label: 'Contact number',
    fieldType: WorkFieldType.TEXT,
    isRequired: true,
    sortOrder: 30,
    config: { maxLength: 30, collectionMode: 'CREATION_ONLY' },
  },
  {
    code: 'LOCATION',
    label: 'Location',
    fieldType: WorkFieldType.TEXT,
    isRequired: true,
    sortOrder: 40,
    config: {
      maxLength: 300,
      collectionMode: 'CREATION_AND_COMPLETION',
      completionMode: 'READ_ONLY',
    },
  },
  {
    code: 'REGISTERED_AT',
    label: 'Registered date and time',
    fieldType: WorkFieldType.DATETIME,
    isRequired: true,
    sortOrder: 50,
    config: { collectionMode: 'CREATION_ONLY' },
  },
  {
    code: 'OLT',
    label: 'OLT',
    fieldType: WorkFieldType.REFERENCE,
    isRequired: true,
    sortOrder: 60,
    config: {
      maxLength: 100,
      collectionMode: 'CREATION_AND_COMPLETION',
      completionMode: 'READ_ONLY',
    },
  },
  {
    code: 'FDC_NAME',
    label: 'FDC name',
    fieldType: WorkFieldType.REFERENCE,
    isRequired: true,
    sortOrder: 70,
    config: {
      maxLength: 100,
      collectionMode: 'CREATION_AND_COMPLETION',
      completionMode: 'READ_ONLY',
    },
  },
  {
    code: 'FAP_NAME',
    label: 'FAP name',
    fieldType: WorkFieldType.REFERENCE,
    isRequired: true,
    sortOrder: 80,
    config: {
      maxLength: 100,
      collectionMode: 'CREATION_AND_COMPLETION',
      completionMode: 'READ_ONLY',
    },
  },
];

const COMMON_OPERATIONAL_EXECUTION_FIELDS: DefaultWorkFieldTemplate[] = [
  {
    code: 'RX_LEVEL_DBM',
    label: 'RX Level (dBm)',
    fieldType: WorkFieldType.DECIMAL,
    isRequired: true,
    sortOrder: 230,
    config: { min: -100, max: 20, collectionMode: 'COMPLETION_ONLY' },
  },
];

function serviceNumber(
  label = 'Service number',
  reportReference = true,
): DefaultWorkFieldTemplate {
  return {
    code: 'SERVICE_NUMBER',
    label,
    fieldType: WorkFieldType.REFERENCE,
    isRequired: true,
    sortOrder: 90,
    config: {
      maxLength: 100,
      collectionMode: 'CREATION_AND_COMPLETION',
      completionMode: 'READ_ONLY',
      ...(reportReference ? { reportReference: true } : {}),
    },
  };
}

function tokenNumber(): DefaultWorkFieldTemplate {
  return {
    code: 'TOKEN_NUMBER',
    label: 'Token number',
    fieldType: WorkFieldType.REFERENCE,
    isRequired: true,
    sortOrder: 90,
    config: {
      maxLength: 100,
      collectionMode: 'CREATION_AND_COMPLETION',
      completionMode: 'READ_ONLY',
      reportReference: true,
    },
  };
}

function serviceTypes(): DefaultWorkFieldTemplate[] {
  return [
    {
      code: 'SERVICE_TYPES',
      label: 'Services',
      fieldType: WorkFieldType.MULTI_SELECT,
      isRequired: true,
      sortOrder: 110,
      config: {
        options: ['DATA', 'VOICE', 'IPTV', 'SIP', 'OTHER'],
        minSelections: 1,
        maxSelections: 5,
        collectionMode: 'CREATION_ONLY',
      },
    },
    {
      code: 'OTHER_SERVICE_TEXT',
      label: 'Other service',
      fieldType: WorkFieldType.TEXT,
      isRequired: false,
      sortOrder: 120,
      config: { maxLength: 160, collectionMode: 'CREATION_ONLY' },
    },
  ];
}

function customerId(required: boolean): DefaultWorkFieldTemplate {
  return {
    code: 'CUSTOMER_ID',
    label: 'Customer ID',
    fieldType: WorkFieldType.REFERENCE,
    isRequired: required,
    sortOrder: 240,
    config: { maxLength: 100, collectionMode: 'COMPLETION_ONLY' },
  };
}

function salesNote(): DefaultWorkFieldTemplate {
  return {
    code: 'SALES_NOTE',
    label: 'Sales note',
    fieldType: WorkFieldType.LONG_TEXT,
    isRequired: false,
    sortOrder: 200,
    config: { maxLength: 1500, collectionMode: 'STAGE_ONLY' },
  };
}

function operationalTemplate(input: {
  code: string;
  name: string;
  sortOrder: number;
  fields?: DefaultWorkFieldTemplate[];
  customerIdRequired?: boolean | null;
  sales?: boolean;
}): DefaultWorkTypeTemplate {
  const fields = [
    ...COMMON_OPERATIONAL_FIELDS,
    ...(input.fields ?? []),
    ...COMMON_OPERATIONAL_EXECUTION_FIELDS,
    ...(input.customerIdRequired === null ||
    input.customerIdRequired === undefined
      ? []
      : [customerId(input.customerIdRequired)]),
    ...(input.sales ? [salesNote()] : []),
  ];

  return {
    code: input.code,
    name: input.name,
    sortOrder: input.sortOrder,
    template: input.sales
      ? WorkTypeTemplate.TEAM_SALES
      : WorkTypeTemplate.STANDARD,
    fields,
  };
}

export const DEFAULT_WORK_TYPE_TEMPLATES: readonly DefaultWorkTypeTemplate[] = [
  operationalTemplate({
    code: 'ROUTINE_WORK',
    name: 'Routine Work',
    sortOrder: 10,
    fields: [serviceNumber()],
  }),
  operationalTemplate({
    code: 'TROUBLE_TICKET',
    name: 'Trouble Ticket',
    sortOrder: 20,
    fields: [serviceNumber(), ...serviceTypes()],
    customerIdRequired: true,
  }),
  operationalTemplate({
    code: 'NETWORK_MAINTENANCE',
    name: 'Network Maintenance',
    sortOrder: 30,
    customerIdRequired: false,
  }),
  operationalTemplate({
    code: 'NEW_INSTALLATION',
    name: 'New Installation',
    sortOrder: 40,
    fields: [
      tokenNumber(),
      {
        code: 'CPC_SERIAL',
        label: 'CPC Serial',
        fieldType: WorkFieldType.REFERENCE,
        isRequired: true,
        sortOrder: 100,
        config: {
          maxLength: 100,
          collectionMode: 'CREATION_AND_COMPLETION',
          completionMode: 'READ_ONLY',
        },
      },
      ...serviceTypes(),
    ],
    customerIdRequired: true,
    sales: true,
  }),
  operationalTemplate({
    code: 'UPDATE_SERVICES',
    name: 'Update Services',
    sortOrder: 50,
    fields: [
      serviceNumber('Existing service number', false),
      tokenNumber(),
      ...serviceTypes(),
    ],
    customerIdRequired: true,
    sales: true,
  }),
  operationalTemplate({
    code: 'INSPECTION',
    name: 'Inspection',
    sortOrder: 60,
    fields: [serviceNumber()],
  }),
  operationalTemplate({
    code: 'EMERGENCY_WORK',
    name: 'Emergency Work',
    sortOrder: 70,
    fields: [serviceNumber()],
    customerIdRequired: true,
  }),
  {
    code: 'ADMINISTRATIVE_WORK',
    name: 'Administrative Work',
    sortOrder: 80,
    template: WorkTypeTemplate.ADMINISTRATIVE,
    fields: [
      {
        code: 'TASK_TITLE',
        label: 'Task title',
        fieldType: WorkFieldType.TEXT,
        isRequired: true,
        sortOrder: 10,
        config: { maxLength: 160, collectionMode: 'CREATION_ONLY' },
      },
      {
        code: 'TASK_DESCRIPTION',
        label: 'Task description',
        fieldType: WorkFieldType.LONG_TEXT,
        isRequired: true,
        sortOrder: 20,
        config: { maxLength: 4000, collectionMode: 'CREATION_ONLY' },
      },
    ],
  },
];

export const DEFAULT_WORK_TYPE_CODES = DEFAULT_WORK_TYPE_TEMPLATES.map(
  (template) => template.code,
);

export async function ensureDefaultWorkTypeCatalog(
  tx: Prisma.TransactionClient,
  officeId: string,
  actorAccountId?: string,
): Promise<{ createdDefinitions: number; createdDrafts: number }> {
  await tx.$executeRaw`
    SELECT pg_advisory_xact_lock(
      hashtextextended(${`nt-message:default-work-types:${officeId}`}, 0)
    )
  `;

  const office = await tx.office.findUnique({
    where: { id: officeId },
    select: { id: true, isActive: true },
  });
  if (!office || !office.isActive) {
    return { createdDefinitions: 0, createdDrafts: 0 };
  }

  let auditActorAccountId = actorAccountId;
  if (!auditActorAccountId) {
    const superAdmin = await tx.account.findFirst({
      where: {
        accountClass: AccountClass.SUPER_ADMIN,
        isEnabled: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true },
    });
    auditActorAccountId = superAdmin?.id;
  }

  if (!auditActorAccountId) {
    throw new Error(
      'Default Work Type bootstrap requires an enabled Super Admin account for audit attribution.',
    );
  }

  const existingDefinitions = await tx.workTypeDefinition.findMany({
    where: { officeId, code: { in: DEFAULT_WORK_TYPE_CODES } },
    select: { id: true, code: true },
  });
  const definitionByCode = new Map(
    existingDefinitions.map((definition) => [definition.code, definition]),
  );

  let createdDefinitions = 0;
  let createdDrafts = 0;

  for (const template of DEFAULT_WORK_TYPE_TEMPLATES) {
    let definition = definitionByCode.get(template.code);

    if (!definition) {
      definition = await tx.workTypeDefinition.create({
        data: {
          officeId,
          code: template.code,
          isActive: true,
          sortOrder: template.sortOrder,
          createdByAccountId: auditActorAccountId,
        },
        select: { id: true, code: true },
      });
      definitionByCode.set(template.code, definition);
      createdDefinitions += 1;
    }

    const existingVersion = await tx.workTypeVersion.findUnique({
      where: {
        workTypeDefinitionId_version: {
          workTypeDefinitionId: definition.id,
          version: 1,
        },
      },
      select: { id: true },
    });
    if (existingVersion) {
      continue;
    }

    const version = await tx.workTypeVersion.create({
      data: {
        workTypeDefinitionId: definition.id,
        version: 1,
        status: WorkTypeVersionStatus.DRAFT,
        name: template.name,
        template: template.template,
        description:
          'Nepal Telecom default Work Type template. Select the Office/Division owner and any Office-specific participant units before publishing.',
        changeReason:
          'Restored default Nepal Telecom Work Type configuration from the approved WM-V2/V3 compatibility rules.',
        primaryOwnerOrgUnitId: null,
        creatorCategories: [
          WorkTypeCreatorCategory.OFFICE_HEAD,
          WorkTypeCreatorCategory.ORG_UNIT_HEAD,
        ],
        creatorScope: WorkTypeCreatorScope.PRIMARY_OWNER_SUBTREE,
        finalClosureMode: WorkFinalClosureMode.PRIMARY_OWNER_HEAD,
        finalClosureLeadershipType: null,
        slaBasis: WorkSlaBasis.CALENDAR_DURATION,
        overallSlaMinutes: null,
        createdByAccountId: auditActorAccountId,
      },
      select: { id: true },
    });

    await tx.workFieldDefinition.createMany({
      data: template.fields.map((field) => ({
        workTypeVersionId: version.id,
        stageDefinitionId: null,
        code: field.code,
        label: field.label,
        fieldType: field.fieldType,
        isRequired: field.isRequired,
        sortOrder: field.sortOrder,
        ...(field.config === undefined ? {} : { config: field.config }),
      })),
    });

    createdDrafts += 1;
  }

  return { createdDefinitions, createdDrafts };
}
