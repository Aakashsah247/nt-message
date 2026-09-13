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
  role: AccountRole.EMPLOYEE,
};

function requirementRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'requirement-1',
    officeId: 'office-1',
    orgUnitId: 'org-unit-1',
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
    office: { id: 'office-1', code: 'PATAN', name: 'Patan Office' },
    orgUnit: {
      id: 'org-unit-1',
      officeId: 'office-1',
      code: 'NET',
      name: 'Network',
      isActive: true,
      parentOrgUnitId: null,
      orgUnitType: { code: 'DEPARTMENT', name: 'Department', isTeam: false },
    },
    shift: {
      id: 'shift-1',
      name: 'Morning',
      startMinute: 8 * 60,
      endMinute: 16 * 60,
      spansNextDay: false,
      isActive: true,
      officeId: 'office-1',
      orgUnitId: 'org-unit-1',
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
    orgUnit: {
      findFirst: jest.fn(),
    },
    operationalTeam: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    orgUnitClosure: {
      findFirst: jest.fn(),
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
  const dutyAuthorization = {
    getContext: jest.fn(),
    assertCanUseManagement: jest.fn(),
  };
  const organizationAuthorization = {
    visibleOrgUnitIds: jest.fn(),
    assertCan: jest.fn(),
  };

  prisma.$transaction.mockImplementation(async (callback: unknown) =>
    (callback as (client: typeof transaction) => Promise<unknown>)(transaction),
  );
  prisma.orgUnit.findFirst.mockResolvedValue({
    id: 'org-unit-1',
    officeId: 'office-1',
    isActive: true,
  });
  prisma.orgUnitClosure.findFirst.mockResolvedValue({ ancestorOrgUnitId: 'org-unit-1' });
  prisma.dutyShiftTemplate.findUnique.mockResolvedValue({
    id: 'shift-1',
    isActive: true,
    officeId: 'office-1',
    orgUnitId: 'org-unit-1',
  });
  prisma.dutyCoverageRequirement.findFirst.mockResolvedValue(null);
  dutyAuthorization.getContext.mockResolvedValue({
    officeId: 'office-1',
    primaryOrgUnitId: 'org-unit-1',
    operationalTeamLeadIds: [],
    canView: true,
    canCreate: true,
    canAssign: true,
    canManage: true,
    readOnlyOversight: false,
  });
  dutyAuthorization.assertCanUseManagement.mockResolvedValue({
    officeId: 'office-1',
    primaryOrgUnitId: 'org-unit-1',
    operationalTeamLeadIds: [],
    canView: true,
    canCreate: true,
    canAssign: true,
    canManage: true,
    readOnlyOversight: false,
  });
  organizationAuthorization.visibleOrgUnitIds.mockResolvedValue(['org-unit-1']);
  organizationAuthorization.assertCan.mockResolvedValue(undefined);

  return {
    prisma,
    transaction,
    dutyAuthorization,
    organizationAuthorization,
    service: new DutyCoverageRequirementsService(
      prisma as never,
      dutyAuthorization as never,
      organizationAuthorization as never,
    ),
  };
}

describe('DutyCoverageRequirementsService', () => {
  it('creates an OrgUnit-scoped effective-dated staffing target without legacy Department scope', async () => {
    const { service, transaction } = createHarness();
    transaction.dutyCoverageRequirement.create.mockResolvedValue(
      requirementRecord(),
    );

    const result = await service.createRequirement(managerUser, {
      orgUnitId: 'org-unit-1',
      shiftTemplateId: 'shift-1',
      dayOfWeek: 1,
      requiredStaff: 5,
      reportingLocation: '  Patan   Office ',
      effectiveFrom: '2099-08-01',
    });

    expect(transaction.dutyCoverageRequirement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          officeId: 'office-1',
          orgUnitId: 'org-unit-1',
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
        orgUnit: expect.objectContaining({ id: 'org-unit-1' }),
        requiredStaff: 5,
        effectiveFrom: '2099-08-01',
      }),
    );
  });

  it('rejects overlapping targets inside the same OrgUnit staffing slot', async () => {
    const { service, prisma } = createHarness();
    prisma.dutyCoverageRequirement.findFirst.mockResolvedValue({
      id: 'existing-requirement',
    });

    await expect(
      service.createRequirement(managerUser, {
        orgUnitId: 'org-unit-1',
        shiftTemplateId: 'shift-1',
        dayOfWeek: 1,
        requiredStaff: 5,
        reportingLocation: 'Patan Office',
        effectiveFrom: '2099-08-01',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects management of an OrgUnit outside the actor duty scope', async () => {
    const { service, organizationAuthorization } = createHarness();
    organizationAuthorization.assertCan.mockRejectedValue(
      new ForbiddenException('outside scope'),
    );

    await expect(
      service.createRequirement(managerUser, {
        orgUnitId: 'org-unit-1',
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

  it('keeps Super Admin coverage access read-only', async () => {
    const { service, dutyAuthorization } = createHarness();
    dutyAuthorization.assertCanUseManagement.mockRejectedValue(
      new ForbiddenException(
        'Super Admin has read-only Duty oversight and cannot perform operational Duty actions.',
      ),
    );

    await expect(
      service.createRequirement(
        { ...managerUser, accountId: 'super-admin', role: AccountRole.SUPER_ADMIN },
        {
          orgUnitId: 'org-unit-1',
          shiftTemplateId: 'shift-1',
          dayOfWeek: 1,
          requiredStaff: 2,
          effectiveFrom: '2099-08-01',
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
