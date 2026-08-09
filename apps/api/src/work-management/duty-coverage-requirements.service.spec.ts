import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import {
  AccountRole,
  DutyCoverageRequirementAction,
} from '../generated/prisma/enums';
import { DutyCoverageRequirementsService } from './duty-coverage-requirements.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));

jest.mock('../generated/prisma/client', () =>
  jest.requireActual('../generated/prisma/enums'),
);

const managerUser = {
  accountId: 'manager-account',
  sessionId: 'session-1',
  username: 'manager',
  role: AccountRole.TEAM_MANAGER,
};

function requirementRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'requirement-1',
    departmentId: 'department-1',
    shiftTemplateId: 'shift-1',
    dayOfWeek: 1,
    requiredStaff: 5,
    reportingLocation: 'Patan Office',
    reportingLocationKey: 'patan office',
    effectiveFrom: new Date('2099-08-01T00:00:00.000Z'),
    effectiveUntil: null,
    createdByAccountId: 'manager-account',
    updatedByAccountId: 'manager-account',
    createdAt: new Date('2026-07-22T00:00:00.000Z'),
    updatedAt: new Date('2026-07-22T00:00:00.000Z'),
    department: {
      id: 'department-1',
      divisionId: 'division-1',
      code: 'NET',
      name: 'Network',
      isActive: true,
      division: {
        id: 'division-1',
        code: 'TECH',
        name: 'Technical',
        isActive: true,
      },
    },
    shift: {
      id: 'shift-1',
      name: 'Morning',
      startMinute: 8 * 60,
      endMinute: 16 * 60,
      spansNextDay: false,
      isActive: true,
      divisionId: 'division-1',
      departmentId: 'department-1',
    },
    createdBy: {
      username: 'manager',
      employee: { empId: 'NTC-1001', empName: 'Manager One' },
    },
    updatedBy: {
      username: 'manager',
      employee: { empId: 'NTC-1001', empName: 'Manager One' },
    },
    ...overrides,
  };
}

function createHarness() {
  const transaction = {
    dutyCoverageRequirement: {
      create: jest.fn(),
      update: jest.fn(),
    },
    dutyCoverageRequirementActivity: {
      create: jest.fn(),
    },
  };
  const prisma = {
    $transaction: jest.fn(),
    department: {
      findUnique: jest.fn(),
    },
    dutyShiftTemplate: {
      findUnique: jest.fn(),
    },
    dutyCoverageRequirement: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    dutyCoverageRequirementActivity: {
      findMany: jest.fn(),
    },
  };
  const scope = {
    resolveActorContext: jest.fn().mockResolvedValue({
      accountId: 'manager-account',
      role: AccountRole.TEAM_MANAGER,
      divisionId: 'division-1',
      departmentId: 'department-1',
    }),
    assertCanManageWork: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (callback: unknown) =>
    (callback as (client: typeof transaction) => Promise<unknown>)(transaction),
  );
  prisma.department.findUnique.mockResolvedValue({
    id: 'department-1',
    divisionId: 'division-1',
    code: 'NET',
    name: 'Network',
    isActive: true,
    division: { isActive: true },
  });
  prisma.dutyShiftTemplate.findUnique.mockResolvedValue({
    id: 'shift-1',
    isActive: true,
    divisionId: 'division-1',
    departmentId: 'department-1',
  });
  prisma.dutyCoverageRequirement.findFirst.mockResolvedValue(null);

  return {
    prisma,
    scope,
    transaction,
    service: new DutyCoverageRequirementsService(
      prisma as never,
      scope as never,
    ),
  };
}

describe('DutyCoverageRequirementsService', () => {
  it('creates an effective-dated staffing target with an audit record', async () => {
    const { service, transaction } = createHarness();
    transaction.dutyCoverageRequirement.create.mockResolvedValue(
      requirementRecord(),
    );

    const result = await service.createRequirement(managerUser, {
      departmentId: 'department-1',
      shiftTemplateId: 'shift-1',
      dayOfWeek: 1,
      requiredStaff: 5,
      reportingLocation: '  Patan   Office ',
      effectiveFrom: '2099-08-01',
    });

    expect(transaction.dutyCoverageRequirement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          departmentId: 'department-1',
          requiredStaff: 5,
          reportingLocation: 'Patan Office',
          reportingLocationKey: 'patan office',
        }),
      }),
    );
    expect(
      transaction.dutyCoverageRequirementActivity.create,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: DutyCoverageRequirementAction.CREATED,
        actorAccountId: 'manager-account',
      }),
    });
    expect(result).toEqual(
      expect.objectContaining({
        id: 'requirement-1',
        requiredStaff: 5,
        effectiveFrom: '2099-08-01',
      }),
    );
  });

  it('rejects overlapping generic and location-specific targets', async () => {
    const { service, prisma } = createHarness();
    prisma.dutyCoverageRequirement.findFirst.mockResolvedValue({
      id: 'existing-requirement',
    });

    await expect(
      service.createRequirement(managerUser, {
        departmentId: 'department-1',
        shiftTemplateId: 'shift-1',
        dayOfWeek: 1,
        requiredStaff: 5,
        reportingLocation: 'Patan Office',
        effectiveFrom: '2099-08-01',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('prevents a Team Manager from managing another department target', async () => {
    const { service, prisma } = createHarness();
    prisma.department.findUnique.mockResolvedValue({
      id: 'department-2',
      divisionId: 'division-1',
      code: 'MNT',
      name: 'Maintenance',
      isActive: true,
      division: { isActive: true },
    });

    await expect(
      service.createRequirement(managerUser, {
        departmentId: 'department-2',
        shiftTemplateId: 'shift-1',
        dayOfWeek: 1,
        requiredStaff: 3,
        effectiveFrom: '2099-08-01',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents rewriting a target after its effective date has started', async () => {
    const { service, prisma } = createHarness();
    prisma.dutyCoverageRequirement.findFirst.mockResolvedValue(
      requirementRecord({
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      }),
    );

    await expect(
      service.updateRequirement(managerUser, 'requirement-1', {
        requiredStaff: 6,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
